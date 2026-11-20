import express, { type Request, type Response, type NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import { z } from 'zod'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  renameSync,
  unlinkSync,
  createReadStream,
  createWriteStream,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { once } from 'node:events'
import { openDatabase, type Store } from './database.js'
import {
  rolePermissions,
  submissionErrors,
  type User,
  type Role,
  type Permission,
  type BusinessRequest,
  type StoredFile,
  type RequestForm,
} from '../shared/domain.js'
import { formSchema } from '../shared/validation.js'

interface UserRow {
  id: string
  username: string
  password: string
  name: string
  role: Role
  department: string
  enabled: number
}
interface RequestRow {
  id: string
  number: string
  owner_id: string
  owner_name: string
  status: BusinessRequest['status']
  form: string
  created_at: string
  updated_at: string
  submitted_at: string | null
  version: number
}
interface UploadRow {
  id: string
  owner_id: string
  owner_name?: string
  name: string
  size: number
  hash: string
  total_chunks: number
  chunks: string
  state: 'uploading' | 'complete'
  created_at: string
}
type AuthedRequest = Request & { user: User }
class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
  }
}
const handler =
  (fn: (req: AuthedRequest, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => fn(req as AuthedRequest, res))
      .catch(next)
  }
const publicUser = (u: UserRow): User => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  department: u.department,
  enabled: !!u.enabled,
  permissions: rolePermissions[u.role],
})
const mapRequest = (r: RequestRow): BusinessRequest => ({
  id: r.id,
  number: r.number,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  status: r.status,
  form: JSON.parse(r.form),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  submittedAt: r.submitted_at,
  version: r.version,
})
const mapUpload = (u: UploadRow): StoredFile => ({
  id: u.id,
  ownerId: u.owner_id,
  ownerName: u.owner_name,
  name: u.name,
  size: u.size,
  hash: u.hash,
  totalChunks: u.total_chunks,
  chunks: JSON.parse(u.chunks),
  state: u.state,
  createdAt: u.created_at,
})
const digestToken = (token: string) => createHash('sha256').update(token).digest('hex')
const CHUNK_SIZE = 2 * 1024 * 1024
export async function createApp(options: {
  dataDir: string
  demo?: boolean
  adminPassword?: string
  secureCookie?: boolean
  staticDir?: string
}) {
  const store = await openDatabase(
    resolve(options.dataDir),
    options.demo ?? true,
    options.adminPassword,
  )
  const uploadDir = join(resolve(options.dataDir), 'uploads')
  mkdirSync(uploadDir, { recursive: true })
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    )
    next()
  })
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '100kb' }))
  app.use('/api', (req, _res, next) => {
    // Browser fetches through the same-origin Vite proxy in development.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      let host: string
      try {
        host = new URL(req.headers.origin).host
      } catch {
        return next(new ApiError(403, '请求来源无效'))
      }
      if (host !== req.headers.host) return next(new ApiError(403, '不允许跨站提交'))
    }
    next()
  })
  app.get('/api/health', (_req, res) => res.json({ ok: true, demo: options.demo ?? true }))
  const attempts = new Map<string, number[]>()
  app.post(
    '/api/auth/login',
    handler(async (req, res) => {
      const ip = req.ip || 'unknown'
      const now = Date.now()
      for (const [key, values] of attempts)
        if (!values.some((t) => now - t < 900000)) attempts.delete(key)
      const recent = (attempts.get(ip) || []).filter((t) => now - t < 900000)
      if (recent.length >= 15) throw new ApiError(429, '登录尝试过于频繁，请 15 分钟后重试')
      recent.push(now)
      attempts.set(ip, recent)
      const { username, password } = z
        .object({ username: z.string().min(1).max(50), password: z.string().min(1).max(128) })
        .parse(req.body)
      const user = store.one<UserRow>('SELECT * FROM users WHERE username=?', [username])
      if (!user || !user.enabled || !(await bcrypt.compare(password, user.password)))
        throw new ApiError(401, '账号或密码不正确，或账号已停用')
      const token = randomBytes(32).toString('hex')
      const old = cookieToken(req)
      store.transaction(() => {
        store.run('DELETE FROM sessions WHERE expires<?', [now])
        if (old) store.run('DELETE FROM sessions WHERE token=?', [digestToken(old)])
        store.run('INSERT INTO sessions VALUES(?,?,?)', [
          digestToken(token),
          user.id,
          now + 8 * 3600000,
        ])
        store.audit(user.name, '登录系统', user.username)
      })
      attempts.delete(ip)
      res.cookie('flowdesk_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !!options.secureCookie,
        maxAge: 8 * 3600000,
        path: '/',
      })
      res.json(publicUser(user))
    }),
  )
  app.use('/api', (req, _res, next) => {
    const token = cookieToken(req)
    const user = token
      ? store.one<UserRow>(
          'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.enabled=1',
          [digestToken(token), Date.now()],
        )
      : undefined
    if (!user) return next(new ApiError(401, '登录已过期，请重新登录'))
    ;(req as AuthedRequest).user = publicUser(user)
    next()
  })
  app.get(
    '/api/auth/me',
    handler((req, res) => res.json(req.user)),
  )
  app.post(
    '/api/auth/logout',
    handler((req, res) => {
      const token = cookieToken(req)
      if (token)
        store.transaction(() =>
          store.run('DELETE FROM sessions WHERE token=?', [digestToken(token)]),
        )
      res.clearCookie('flowdesk_session', {
        httpOnly: true,
        sameSite: 'lax',
        secure: !!options.secureCookie,
        path: '/',
      })
      res.json({ ok: true })
    }),
  )
  function permit(permission: Permission) {
    return (req: Request, _res: Response, next: NextFunction) => {
      if (!(req as AuthedRequest).user.permissions.includes(permission))
        return next(new ApiError(403, '当前角色没有此操作权限'))
      next()
    }
  }
  function visibleRequests(user: User) {
    return store
      .all<RequestRow>(
        'SELECT r.*,u.name AS owner_name FROM requests r JOIN users u ON u.id=r.owner_id' +
          (user.permissions.includes('request:all') ? '' : ' WHERE r.owner_id=?') +
          ' ORDER BY r.created_at DESC',
        user.permissions.includes('request:all') ? [] : [user.id],
      )
      .map(mapRequest)
  }
  function getRequest(id: string, user: User): BusinessRequest {
    const row = store.one<RequestRow>(
      'SELECT r.*,u.name AS owner_name FROM requests r JOIN users u ON u.id=r.owner_id WHERE r.id=?',
      [id],
    )
    if (!row || (!user.permissions.includes('request:all') && row.owner_id !== user.id))
      throw new ApiError(404, '申请不存在或无权访问')
    return mapRequest(row)
  }
  function checkAttachments(ids: string[], user: User) {
    for (const id of ids) {
      const file = store.one<UploadRow>('SELECT * FROM uploads WHERE id=?', [id])
      if (!file || file.owner_id !== user.id || file.state !== 'complete')
        throw new ApiError(400, '只能关联本人已完成上传的附件')
    }
  }
  function checkCompany(form: RequestForm, excludeId = '') {
    if (form.applicantType !== 'enterprise' || form.category !== '资质备案') return
    const duplicate = store
      .all<{
        id: string
        form: string
      }>("SELECT id,form FROM requests WHERE status IN ('pending','approved') AND id!=?", [
        excludeId,
      ])
      .some((r) => {
        const f: RequestForm = JSON.parse(r.form)
        return f.category === '资质备案' && f.creditCode === form.creditCode
      })
    if (duplicate)
      throw new ApiError(422, '该企业已有审核中或已通过的资质备案', {
        creditCode: '该信用代码已有资质备案，请勿重复提交',
      })
  }
  app.get(
    '/api/dashboard',
    permit('dashboard'),
    handler((req, res) => {
      const requests = visibleRequests(req.user)
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - 6 + i)
        return d.toISOString().slice(0, 10)
      })
      const activity = req.user.permissions.includes('audit')
        ? store.all(
            'SELECT id,actor_name AS actorName,action,target,detail,created_at AS createdAt FROM audit ORDER BY created_at DESC LIMIT 5',
          )
        : store.all(
            'SELECT v.id,v.actor_name AS actorName,v.action,r.number AS target,v.comment AS detail,v.created_at AS createdAt FROM reviews v JOIN requests r ON r.id=v.request_id' +
              (req.user.permissions.includes('request:all') ? '' : ' WHERE r.owner_id=?') +
              ' ORDER BY v.created_at DESC LIMIT 5',
            req.user.permissions.includes('request:all') ? [] : [req.user.id],
          )
      res.json({
        stats: {
          total: requests.length,
          pending: requests.filter((r) => r.status === 'pending').length,
          approved: requests.filter((r) => r.status === 'approved').length,
          draft: requests.filter((r) => r.status === 'draft').length,
        },
        trend: days.map((day) => ({
          day,
          submitted: requests.filter((r) => r.submittedAt?.slice(0, 10) === day).length,
          approved: requests.filter(
            (r) => r.status === 'approved' && r.updatedAt.slice(0, 10) === day,
          ).length,
        })),
        recent: requests.slice(0, 5),
        pending: requests.filter((r) => r.status === 'pending').slice(0, 4),
        activity,
      })
    }),
  )
  app.get(
    '/api/requests',
    permit('requests'),
    handler((req, res) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(8),
          q: z.string().max(100).default(''),
          status: z.enum(['', 'draft', 'pending', 'approved', 'rejected']).default(''),
          category: z.string().max(20).default(''),
          sort: z.enum(['newest', 'oldest', 'amount']).default('newest'),
        })
        .parse(req.query)
      let items = visibleRequests(req.user).filter(
        (r) =>
          (!query.status || r.status === query.status) &&
          (!query.category || r.form.category === query.category) &&
          (!query.q ||
            [r.form.title, r.number, r.ownerName, r.form.companyName].some((v) =>
              v.toLowerCase().includes(query.q.toLowerCase()),
            )),
      )
      if (query.sort === 'oldest') items.reverse()
      if (query.sort === 'amount') items = items.sort((a, b) => b.form.amount - a.form.amount)
      res.json({
        items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
        total: items.length,
        page: query.page,
        pageSize: query.pageSize,
      })
    }),
  )
  app.get(
    '/api/validate/company',
    permit('request:create'),
    handler((req, res) => {
      const { creditCode, excludeId } = z
        .object({
          creditCode: z.string().regex(/^[0-9A-Z]{18}$/),
          excludeId: z.string().max(50).default(''),
        })
        .parse(req.query)
      try {
        checkCompany(
          {
            ...JSON.parse('{}'),
            applicantType: 'enterprise',
            category: '资质备案',
            creditCode,
          } as RequestForm,
          excludeId,
        )
        res.json({ valid: true })
      } catch (error) {
        if (error instanceof ApiError) res.json({ valid: false, message: error.fields?.creditCode })
        else throw error
      }
    }),
  )
  app.post(
    '/api/requests',
    permit('request:create'),
    handler((req, res) => {
      const body = z
        .object({ form: formSchema, submit: z.boolean().default(false) })
        .strict()
        .parse(req.body)
      checkAttachments(body.form.attachmentIds, req.user)
      if (body.submit) {
        const fields = submissionErrors(body.form)
        if (Object.keys(fields).length) throw new ApiError(422, '请完善申请信息', fields)
        checkCompany(body.form)
      }
      const id = randomUUID(),
        now = new Date().toISOString()
      const count = Number(
        store.one<{ total: number }>('SELECT COUNT(*) AS total FROM requests')!.total,
      )
      const number = `FD-${new Date().getFullYear()}-${count + 1001}`
      store.transaction(() => {
        store.run('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,1)', [
          id,
          number,
          req.user.id,
          body.submit ? 'pending' : 'draft',
          JSON.stringify(body.form),
          now,
          now,
          body.submit ? now : null,
        ])
        if (body.submit)
          store.run('INSERT INTO reviews VALUES(?,?,?,?,?,?)', [
            randomUUID(),
            id,
            req.user.name,
            '提交申请',
            '申请已提交，等待审核。',
            now,
          ])
        store.audit(req.user.name, body.submit ? '提交申请' : '保存草稿', number, body.form.title)
      })
      res.status(201).json(getRequest(id, req.user))
    }),
  )
  app.get(
    '/api/requests/:id',
    permit('requests'),
    handler((req, res) => {
      const request = getRequest(req.params.id, req.user)
      const reviews = store.all(
        'SELECT id,request_id AS requestId,actor_name AS actorName,action,comment,created_at AS createdAt FROM reviews WHERE request_id=? ORDER BY created_at ASC',
        [request.id],
      )
      const files = request.form.attachmentIds.flatMap((id) => {
        const row = store.one<UploadRow>('SELECT * FROM uploads WHERE id=?', [id])
        return row ? [mapUpload(row)] : []
      })
      res.json({ request, reviews, files })
    }),
  )
  app.put(
    '/api/requests/:id',
    permit('request:create'),
    handler((req, res) => {
      const request = getRequest(req.params.id, req.user)
      const body = z
        .object({
          form: formSchema,
          submit: z.boolean().default(false),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body)
      if (request.ownerId !== req.user.id) throw new ApiError(403, '只能编辑自己的申请')
      if (!['draft', 'rejected'].includes(request.status))
        throw new ApiError(409, '当前状态不能编辑，请刷新页面')
      if (request.version !== body.version)
        throw new ApiError(409, '申请已在其他页面更新，请刷新后重试')
      checkAttachments(body.form.attachmentIds, req.user)
      if (body.submit) {
        const fields = submissionErrors(body.form)
        if (Object.keys(fields).length) throw new ApiError(422, '请完善申请信息', fields)
        checkCompany(body.form, request.id)
      }
      const now = new Date().toISOString()
      store.transaction(() => {
        store.run(
          'UPDATE requests SET form=?,status=?,updated_at=?,submitted_at=?,version=version+1 WHERE id=?',
          [
            JSON.stringify(body.form),
            body.submit ? 'pending' : 'draft',
            now,
            body.submit ? now : request.submittedAt,
            request.id,
          ],
        )
        if (body.submit)
          store.run('INSERT INTO reviews VALUES(?,?,?,?,?,?)', [
            randomUUID(),
            request.id,
            req.user.name,
            '提交申请',
            '申请已提交，等待审核。',
            now,
          ])
        store.audit(
          req.user.name,
          body.submit ? '提交申请' : '更新草稿',
          request.number,
          body.form.title,
        )
      })
      res.json(getRequest(request.id, req.user))
    }),
  )
  app.post(
    '/api/requests/:id/review',
    permit('request:review'),
    handler((req, res) => {
      const request = getRequest(req.params.id, req.user)
      const { decision, comment, version } = z
        .object({
          decision: z.enum(['approved', 'rejected']),
          comment: z.string().trim().max(500),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(req.body)
      if (request.ownerId === req.user.id) throw new ApiError(403, '不能审核自己提交的申请')
      if (request.status !== 'pending' || request.version !== version)
        throw new ApiError(409, '申请状态已更新，请刷新后重试')
      if (decision === 'rejected' && comment.length < 5)
        throw new ApiError(422, '退回时请填写至少 5 字的修改意见')
      const now = new Date().toISOString()
      store.transaction(() => {
        store.run('UPDATE requests SET status=?,updated_at=?,version=version+1 WHERE id=?', [
          decision,
          now,
          request.id,
        ])
        store.run('INSERT INTO reviews VALUES(?,?,?,?,?,?)', [
          randomUUID(),
          request.id,
          req.user.name,
          decision === 'approved' ? '审核通过' : '退回修改',
          comment || '资料完整，审核通过。',
          now,
        ])
        store.audit(
          req.user.name,
          decision === 'approved' ? '审核通过' : '退回修改',
          request.number,
          comment,
        )
      })
      res.json(getRequest(request.id, req.user))
    }),
  )
  app.get(
    '/api/files',
    permit('files'),
    handler((req, res) => {
      const scope = req.user.permissions.includes('request:all') ? '' : ' WHERE f.owner_id=?'
      const rows = store.all<UploadRow>(
        'SELECT f.*,u.name AS owner_name FROM uploads f JOIN users u ON u.id=f.owner_id' +
          scope +
          ' ORDER BY f.created_at DESC',
        scope ? [req.user.id] : [],
      )
      res.json(rows.map(mapUpload))
    }),
  )
  const initSchema = z
    .object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((n) => !/[\x00-\x1f]/.test(n), '文件名无效'),
      size: z
        .number()
        .int()
        .min(1)
        .max(200 * 1024 * 1024),
      hash: z.string().regex(/^[a-f0-9]{32}$/),
    })
    .strict()
  app.post(
    '/api/uploads/init',
    permit('files'),
    handler((req, res) => {
      const { name, size, hash } = initSchema.parse(req.body)
      const prior = store.one<UploadRow>(
        'SELECT * FROM uploads WHERE owner_id=? AND hash=? AND size=?',
        [req.user.id, hash, size],
      )
      if (prior) return res.json(mapUpload(prior))
      const id = randomUUID(),
        now = new Date().toISOString(),
        count = Math.ceil(size / CHUNK_SIZE)
      mkdirSync(join(uploadDir, id), { recursive: true })
      store.transaction(() =>
        store.run('INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)', [
          id,
          req.user.id,
          name,
          size,
          hash,
          count,
          '[]',
          'uploading',
          now,
        ]),
      )
      res
        .status(201)
        .json(mapUpload(store.one<UploadRow>('SELECT * FROM uploads WHERE id=?', [id])!))
    }),
  )
  const merging = new Set<string>()
  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CHUNK_SIZE, files: 1, fields: 0 },
  }).single('chunk')
  function ownedUpload(id: string, user: User) {
    const upload = store.one<UploadRow>('SELECT * FROM uploads WHERE id=?', [id])
    if (!upload || upload.owner_id !== user.id) throw new ApiError(404, '上传任务不存在或无权访问')
    return upload
  }
  app.post(
    '/api/uploads/:id/chunks/:index',
    permit('files'),
    (req, res, next) => {
      try {
        const file = ownedUpload(req.params.id, (req as AuthedRequest).user)
        if (file.state !== 'uploading' || merging.has(file.id))
          throw new ApiError(409, '文件已完成或正在合并')
        uploadMiddleware(req, res, next)
      } catch (e) {
        next(e)
      }
    },
    handler((req, res) => {
      const file = ownedUpload(req.params.id, req.user)
      if (file.state !== 'uploading' || merging.has(file.id))
        throw new ApiError(409, '文件已完成或正在合并')
      const index = z.coerce
        .number()
        .int()
        .min(0)
        .max(file.total_chunks - 1)
        .parse(req.params.index)
      const expected = Math.min(CHUNK_SIZE, file.size - index * CHUNK_SIZE)
      if (!req.file || req.file.size !== expected) throw new ApiError(400, '分片大小不符合预期')
      const path = join(uploadDir, file.id, `${index}.chunk`)
      writeFileSync(path + '.tmp', req.file.buffer)
      renameSync(path + '.tmp', path)
      const chunks = [...new Set([...(JSON.parse(file.chunks) as number[]), index])].sort(
        (a, b) => a - b,
      )
      store.transaction(() =>
        store.run('UPDATE uploads SET chunks=? WHERE id=?', [JSON.stringify(chunks), file.id]),
      )
      res.json({ chunks })
    }),
  )
  app.post(
    '/api/uploads/:id/complete',
    permit('files'),
    handler(async (req, res) => {
      const file = ownedUpload(req.params.id, req.user)
      if (file.state === 'complete') return res.json(mapUpload(file))
      if (merging.has(file.id)) throw new ApiError(409, '文件正在合并，请稍后重试')
      const chunks: number[] = JSON.parse(file.chunks)
      if (
        chunks.length !== file.total_chunks ||
        chunks.some((i) => !existsSync(join(uploadDir, file.id, `${i}.chunk`)))
      )
        throw new ApiError(409, '分片尚未完整上传')
      merging.add(file.id)
      const path = join(uploadDir, file.id, 'content.tmp')
      const output = createWriteStream(path)
      // Handle filesystem errors even when the writer is not waiting for drain.
      let writeError: Error | undefined
      output.on('error', (error) => {
        writeError = error
      })
      try {
        const hash = createHash('md5')
        let bytes = 0
        for (let i = 0; i < file.total_chunks; i++) {
          for await (const buffer of createReadStream(join(uploadDir, file.id, `${i}.chunk`))) {
            if (writeError) throw writeError
            hash.update(buffer)
            bytes += buffer.length
            if (!output.write(buffer)) await once(output, 'drain')
          }
        }
        output.end()
        await once(output, 'finish')
        if (writeError) throw writeError
        if (bytes !== file.size || hash.digest('hex') !== file.hash) {
          store.transaction(() =>
            store.run('UPDATE uploads SET chunks=? WHERE id=?', ['[]', file.id]),
          )
          for (let i = 0; i < file.total_chunks; i++)
            unlinkSync(join(uploadDir, file.id, `${i}.chunk`))
          throw new ApiError(422, '文件完整性校验失败，已清空错误分片，请重试上传')
        }
        renameSync(path, join(uploadDir, file.id, 'content'))
        store.transaction(() => {
          store.run("UPDATE uploads SET state='complete' WHERE id=?", [file.id])
          store.audit(
            req.user.name,
            '完成文件上传',
            file.name,
            `${file.size} bytes，服务端 MD5 校验通过`,
          )
        })
        for (let i = 0; i < file.total_chunks; i++)
          unlinkSync(join(uploadDir, file.id, `${i}.chunk`))
        res.json(mapUpload(store.one<UploadRow>('SELECT * FROM uploads WHERE id=?', [file.id])!))
      } finally {
        merging.delete(file.id)
        output.destroy()
        if (existsSync(path)) unlinkSync(path)
      }
    }),
  )
  app.get(
    '/api/files/:id/download',
    permit('files'),
    handler((req, res) => {
      const file = store.one<UploadRow>('SELECT * FROM uploads WHERE id=?', [req.params.id])
      if (
        !file ||
        file.state !== 'complete' ||
        (file.owner_id !== req.user.id && !req.user.permissions.includes('request:all'))
      )
        throw new ApiError(404, '文件不存在或无权访问')
      // Always download user content; never execute an uploaded HTML/SVG document inline.
      res.setHeader('Content-Type', 'application/octet-stream')
      res.download(join(uploadDir, file.id, 'content'), file.name)
    }),
  )
  app.get(
    '/api/users',
    permit('users'),
    handler((_req, res) =>
      res.json(store.all<UserRow>('SELECT * FROM users ORDER BY username').map(publicUser)),
    ),
  )
  app.post(
    '/api/users',
    permit('users'),
    handler((req, res) => {
      const body = z
        .object({
          username: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/),
          password: z.string().min(12).max(128),
          name: z.string().trim().min(2).max(30),
          role: z.enum(['admin', 'reviewer', 'operator']),
          department: z.string().min(1).max(30),
        })
        .strict()
        .parse(req.body)
      if (store.one('SELECT id FROM users WHERE username=?', [body.username]))
        throw new ApiError(409, '用户名已存在')
      const id = randomUUID()
      store.transaction(() => {
        store.run('INSERT INTO users VALUES(?,?,?,?,?,?,1)', [
          id,
          body.username,
          bcrypt.hashSync(body.password, 10),
          body.name,
          body.role,
          body.department,
        ])
        store.audit(req.user.name, '创建账号', body.username, body.role)
      })
      res.status(201).json(publicUser(store.one<UserRow>('SELECT * FROM users WHERE id=?', [id])!))
    }),
  )
  app.patch(
    '/api/users/:id',
    permit('users'),
    handler((req, res) => {
      const body = z
        .object({ role: z.enum(['admin', 'reviewer', 'operator']), enabled: z.boolean() })
        .strict()
        .parse(req.body)
      const target = store.one<UserRow>('SELECT * FROM users WHERE id=?', [req.params.id])
      if (!target) throw new ApiError(404, '账号不存在')
      if (target.id === req.user.id && (!body.enabled || body.role !== 'admin'))
        throw new ApiError(422, '不能停用或降级当前登录的管理员')
      if (
        target.role === 'admin' &&
        target.enabled &&
        (!body.enabled || body.role !== 'admin') &&
        Number(
          store.one<{ total: number }>(
            "SELECT COUNT(*) AS total FROM users WHERE role='admin' AND enabled=1",
          )!.total,
        ) <= 1
      )
        throw new ApiError(422, '至少保留一位启用的管理员')
      store.transaction(() => {
        store.run('UPDATE users SET role=?,enabled=? WHERE id=?', [
          body.role,
          Number(body.enabled),
          target.id,
        ])
        store.run('DELETE FROM sessions WHERE user_id=?', [target.id])
        store.audit(
          req.user.name,
          '修改账号权限',
          target.username,
          `${body.role} / ${body.enabled ? '启用' : '停用'}`,
        )
      })
      res.json(publicUser(store.one<UserRow>('SELECT * FROM users WHERE id=?', [target.id])!))
    }),
  )
  app.get(
    '/api/audit',
    permit('audit'),
    handler((req, res) => {
      const { page, q } = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          q: z.string().max(100).default(''),
        })
        .parse(req.query)
      const rows = store
        .all<{
          id: string
          actorName: string
          action: string
          target: string
          detail: string
          createdAt: string
        }>(
          'SELECT id,actor_name AS actorName,action,target,detail,created_at AS createdAt FROM audit ORDER BY created_at DESC',
        )
        .filter((r) => !q || [r.actorName, r.action, r.target].some((v) => v.includes(q)))
      res.json({ items: rows.slice((page - 1) * 15, page * 15), total: rows.length })
    }),
  )
  app.use('/api', (_req, _res, next) => next(new ApiError(404, '接口不存在')))
  if (options.staticDir) {
    app.use(express.static(options.staticDir, { maxAge: '1h' }))
    app.get('*', (_req, res) => res.sendFile(join(resolve(options.staticDir!), 'index.html')))
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return
    if (error instanceof ApiError)
      return res.status(error.status).json({ message: error.message, fields: error.fields })
    if (error instanceof z.ZodError)
      return res.status(400).json({
        message: '输入格式不正确',
        fields: Object.fromEntries(error.issues.map((i) => [i.path.join('.'), i.message])),
      })
    if (error instanceof multer.MulterError)
      return res.status(400).json({ message: '上传分片超出限制或格式不正确' })
    if (error instanceof SyntaxError)
      return res.status(400).json({ message: '请求 JSON 格式不正确' })
    console.error(error)
    res.status(500).json({ message: '服务暂时无法完成请求，请稍后重试' })
  })
  return { app, store }
}
function cookieToken(req: Request): string | undefined {
  const value = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('flowdesk_session='))
    ?.slice('flowdesk_session='.length)
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined
}
export type { Store }
