import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import supertest from 'supertest'
import { createApp } from '../server/app.js'
import { emptyForm, type RequestForm } from '../shared/domain.js'

describe('FlowDesk business API', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flowdesk-test-'))
  let context: Awaited<ReturnType<typeof createApp>>
  let admin: ReturnType<typeof supertest.agent>,
    reviewer: ReturnType<typeof supertest.agent>,
    operator: ReturnType<typeof supertest.agent>,
    other: ReturnType<typeof supertest.agent>
  let requestId: string, requestVersion: number
  const validForm = (): RequestForm => ({
    ...emptyForm(),
    title: '业务接口验证采购申请',
    applicantType: 'personal',
    contact: '测试联系人',
    amount: 16800,
    startDate: '2026-11-20',
    endDate: '2026-11-25',
    description: '采购工作站以满足团队日常研发与测试需求。',
  })
  before(async () => {
    context = await createApp({ dataDir: dir, demo: true })
    admin = supertest.agent(context.app)
    reviewer = supertest.agent(context.app)
    operator = supertest.agent(context.app)
    other = supertest.agent(context.app)
    for (const [agent, username] of [
      [admin, 'admin'],
      [reviewer, 'reviewer'],
      [operator, 'operator'],
      [other, 'operator2'],
    ] as const)
      await agent.post('/api/auth/login').send({ username, password: 'Demo@123456' }).expect(200)
  })
  after(() => {
    context.store.close()
    const target = resolve(dir)
    assert.ok(
      target.startsWith(resolve(tmpdir()) + '\\') || target.startsWith(resolve(tmpdir()) + '/'),
    )
    rmSync(target, { recursive: true, force: true })
  })
  it('rejects unauthenticated requests and never returns password hashes', async () => {
    await supertest(context.app).get('/api/requests').expect(401)
    const me = await operator.get('/api/auth/me').expect(200)
    assert.equal(me.body.role, 'operator')
    assert.equal(me.body.password, undefined)
    const login = await supertest(context.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'bad-password' })
      .expect(401)
    assert.ok(!JSON.stringify(login.body).includes('$2a$'))
  })
  it('sets HttpOnly SameSite session cookies and blocks cross-site writes', async () => {
    const response = await supertest(context.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Demo@123456' })
      .expect(200)
    assert.match(String(response.headers['set-cookie']), /HttpOnly/)
    assert.match(String(response.headers['set-cookie']), /SameSite=Lax/)
    await operator
      .post('/api/requests')
      .set('Origin', 'https://evil.example')
      .send({ form: validForm() })
      .expect(403)
  })
  it('enforces route permissions and scopes operator lists to their own data', async () => {
    await operator.get('/api/users').expect(403)
    await reviewer.get('/api/audit').expect(403)
    await reviewer.post('/api/requests').send({ form: validForm() }).expect(403)
    const list = await operator.get('/api/requests?pageSize=50').expect(200)
    assert.ok(list.body.items.length > 0)
    assert.ok(list.body.items.every((r: { ownerId: string }) => r.ownerId === 'operator'))
    const someone = await other.get('/api/requests').expect(200)
    await operator.get(`/api/requests/${someone.body.items[0].id}`).expect(404)
  })
  it('validates conditional and cross-field requirements on the server', async () => {
    const form = {
      ...validForm(),
      applicantType: 'enterprise',
      creditCode: '',
      companyName: '',
      amount: 25000,
      justification: '',
      endDate: '2026-11-01',
    }
    const result = await operator.post('/api/requests').send({ form, submit: true }).expect(422)
    assert.ok(result.body.fields.creditCode)
    assert.ok(result.body.fields.justification)
    assert.ok(result.body.fields.endDate)
    await operator
      .post('/api/requests')
      .send({ form: { ...validForm(), injected: 'bad' } })
      .expect(400)
  })
  it('saves incomplete drafts and rejects stale edits', async () => {
    const saved = await operator
      .post('/api/requests')
      .send({ form: emptyForm(), submit: false })
      .expect(201)
    requestId = saved.body.id
    requestVersion = saved.body.version
    assert.equal(saved.body.status, 'draft')
    const updated = await operator
      .put(`/api/requests/${requestId}`)
      .send({ form: validForm(), version: requestVersion, submit: false })
      .expect(200)
    assert.equal(updated.body.version, requestVersion + 1)
    await operator
      .put(`/api/requests/${requestId}`)
      .send({ form: validForm(), version: requestVersion, submit: false })
      .expect(409)
    requestVersion = updated.body.version
    await admin
      .put(`/api/requests/${requestId}`)
      .send({ form: validForm(), version: requestVersion })
      .expect(403)
  })
  it('runs submission, rejection, resubmission and approval with conflict detection', async () => {
    const submitted = await operator
      .put(`/api/requests/${requestId}`)
      .send({ form: validForm(), version: requestVersion, submit: true })
      .expect(200)
    assert.equal(submitted.body.status, 'pending')
    requestVersion = submitted.body.version
    await operator
      .post(`/api/requests/${requestId}/review`)
      .send({ decision: 'approved', version: requestVersion, comment: '' })
      .expect(403)
    await operator
      .put(`/api/requests/${requestId}`)
      .send({ form: validForm(), version: requestVersion })
      .expect(409)
    await reviewer
      .post(`/api/requests/${requestId}/review`)
      .send({ decision: 'rejected', version: requestVersion, comment: '短' })
      .expect(422)
    const rejected = await reviewer
      .post(`/api/requests/${requestId}/review`)
      .send({
        decision: 'rejected',
        version: requestVersion,
        comment: '请补充设备型号与报价依据。',
      })
      .expect(200)
    const resubmitted = await operator
      .put(`/api/requests/${requestId}`)
      .send({ form: validForm(), version: rejected.body.version, submit: true })
      .expect(200)
    await reviewer
      .post(`/api/requests/${requestId}/review`)
      .send({ decision: 'approved', version: requestVersion, comment: '' })
      .expect(409)
    await reviewer
      .post(`/api/requests/${requestId}/review`)
      .send({
        decision: 'approved',
        version: resubmitted.body.version,
        comment: '资料已补充完整。',
      })
      .expect(200)
    const detail = await operator.get(`/api/requests/${requestId}`).expect(200)
    assert.equal(detail.body.request.status, 'approved')
    assert.equal(detail.body.reviews.length, 4)
  })
  it('prohibits self-approval for administrators too', async () => {
    const saved = await admin
      .post('/api/requests')
      .send({ form: validForm(), submit: true })
      .expect(201)
    await admin
      .post(`/api/requests/${saved.body.id}/review`)
      .send({ decision: 'approved', version: saved.body.version, comment: '' })
      .expect(403)
  })
  it('resumes server checkpoints and verifies merged upload bytes', async () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 53, 65),
      hash = createHash('md5').update(bytes).digest('hex')
    const init = await operator
      .post('/api/uploads/init')
      .send({ name: '采购报价单.pdf', size: bytes.length, hash })
      .expect(201)
    const id = init.body.id
    await other
      .post(`/api/uploads/${id}/chunks/0`)
      .attach('chunk', bytes.subarray(0, 2 * 1024 * 1024), 'chunk')
      .expect(404)
    await operator
      .post(`/api/uploads/${id}/chunks/0`)
      .attach('chunk', Buffer.alloc(10), 'chunk')
      .expect(400)
    await operator
      .post(`/api/uploads/${id}/chunks/0`)
      .attach('chunk', bytes.subarray(0, 2 * 1024 * 1024), 'chunk')
      .expect(200)
    const resumed = await operator
      .post('/api/uploads/init')
      .send({ name: '采购报价单.pdf', size: bytes.length, hash })
      .expect(200)
    assert.equal(resumed.body.id, id)
    assert.deepEqual(resumed.body.chunks, [0])
    await operator.post(`/api/uploads/${id}/complete`).expect(409)
    await operator
      .post(`/api/uploads/${id}/chunks/1`)
      .attach('chunk', bytes.subarray(2 * 1024 * 1024), 'chunk')
      .expect(200)
    await operator.post(`/api/uploads/${id}/complete`).expect(200)
    const downloaded = await operator
      .get(`/api/files/${id}/download`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (b) => chunks.push(b))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
      .expect(200)
    assert.deepEqual(downloaded.body, bytes)
    assert.match(downloaded.headers['content-disposition'], /attachment/)
    await other.get(`/api/files/${id}/download`).expect(404)
    await reviewer.get(`/api/files/${id}/download`).expect(200)
    const instant = await operator
      .post('/api/uploads/init')
      .send({ name: '采购报价单.pdf', size: bytes.length, hash })
      .expect(200)
    assert.equal(instant.body.state, 'complete')
    const stolen = await other
      .post('/api/requests')
      .send({ form: { ...validForm(), attachmentIds: [id] }, submit: false })
      .expect(400)
    assert.match(stolen.body.message, /本人/)
  })
  it('rejects incorrect whole-file hashes and recovers by replacing the bad chunk', async () => {
    const original = Buffer.from('original-file'),
      corrupt = Buffer.from('corrupteddata')
    assert.equal(original.length, corrupt.length)
    const hash = createHash('md5').update(original).digest('hex')
    const init = await operator
      .post('/api/uploads/init')
      .send({ name: 'hash-test.txt', size: original.length, hash })
      .expect(201)
    await operator
      .post(`/api/uploads/${init.body.id}/chunks/0`)
      .attach('chunk', corrupt, 'chunk')
      .expect(200)
    await operator.post(`/api/uploads/${init.body.id}/complete`).expect(422)
    await operator
      .post(`/api/uploads/${init.body.id}/chunks/0`)
      .attach('chunk', original, 'chunk')
      .expect(200)
    await operator.post(`/api/uploads/${init.body.id}/complete`).expect(200)
  })
  it('validates enterprise filing duplicates and required license attachments', async () => {
    const bytes = Buffer.from('demo-license'),
      hash = createHash('md5').update(bytes).digest('hex')
    const upload = await operator
      .post('/api/uploads/init')
      .send({ name: 'license.txt', size: bytes.length, hash })
      .expect(201)
    await operator
      .post(`/api/uploads/${upload.body.id}/chunks/0`)
      .attach('chunk', bytes, 'chunk')
      .expect(200)
    await operator.post(`/api/uploads/${upload.body.id}/complete`).expect(200)
    const form = {
      ...validForm(),
      category: '资质备案',
      applicantType: 'enterprise',
      companyName: '测试企业有限公司',
      creditCode: '91320100MA00000123',
      amount: 0,
      attachmentIds: [] as string[],
    }
    await operator.post('/api/requests').send({ form, submit: true }).expect(422)
    form.attachmentIds = [upload.body.id]
    await operator.post('/api/requests').send({ form, submit: true }).expect(201)
    const result = await operator
      .get('/api/validate/company?creditCode=91320100MA00000123')
      .expect(200)
    assert.equal(result.body.valid, false)
    await operator.post('/api/requests').send({ form, submit: true }).expect(422)
  })
  it('protects current admin and immediately invalidates changed member sessions', async () => {
    await admin.patch('/api/users/admin').send({ role: 'operator', enabled: false }).expect(422)
    await admin.patch('/api/users/operator2').send({ role: 'reviewer', enabled: true }).expect(200)
    await other.get('/api/auth/me').expect(401)
    await admin.patch('/api/users/operator2').send({ role: 'operator', enabled: false }).expect(200)
    await other
      .post('/api/auth/login')
      .send({ username: 'operator2', password: 'Demo@123456' })
      .expect(401)
    await admin.patch('/api/users/operator2').send({ role: 'operator', enabled: true }).expect(200)
  })
  it('creates accounts, detects duplicates and records audited changes', async () => {
    const payload = {
      username: 'test_member',
      name: '测试成员',
      password: 'LongPassword@123',
      role: 'operator',
      department: '产品研发部',
    }
    const created = await admin.post('/api/users').send(payload).expect(201)
    assert.equal(created.body.password, undefined)
    await admin.post('/api/users').send(payload).expect(409)
    const events = await admin.get('/api/audit?q=创建账号').expect(200)
    assert.ok(events.body.items.some((e: { target: string }) => e.target === 'test_member'))
  })
  it('filters and paginates without exposing SQL or unbounded queries', async () => {
    const result = await admin
      .get('/api/requests?q=业务接口验证&pageSize=1&sort=oldest')
      .expect(200)
    assert.equal(result.body.items.length, 1)
    assert.ok(result.body.total >= 2)
    await admin.get('/api/requests?pageSize=10000').expect(400)
    await admin.get('/api/requests?sort=DROP%20TABLE%20requests').expect(400)
    const empty = await admin.get('/api/requests?q=%27%20OR%201%3D1').expect(200)
    assert.equal(empty.body.total, 0)
  })
})
