import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { emptyForm, type RequestForm } from '../shared/domain.js'

let sqlPromise: Promise<SqlJsStatic> | undefined
const require = createRequire(import.meta.url)
export async function openDatabase(dataDir: string, demo: boolean, adminPassword?: string) {
  mkdirSync(dataDir, { recursive: true })
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
  sqlPromise ??= initSqlJs({ locateFile: () => wasmPath, useOldExtensionFunctions: false })
  const SQL = await sqlPromise
  const path = join(dataDir, 'flowdesk.sqlite')
  const db = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database()
  db.run(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, department TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, form TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), actor_name TEXT NOT NULL, action TEXT NOT NULL, comment TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL, total_chunks INTEGER NOT NULL, chunks TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner_id,hash,size));
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, actor_name TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_requests_owner ON requests(owner_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_request ON reviews(request_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires);`)
  const store = new Store(db, path)
  if (!store.one('SELECT id FROM users LIMIT 1')) {
    if (!demo && (!adminPassword || adminPassword.length < 12)) throw new Error('非演示模式首次启动需要设置至少 12 位 ADMIN_PASSWORD')
    const password = bcrypt.hashSync(demo ? 'Demo@123456' : adminPassword!, 10)
    store.run('INSERT INTO users VALUES(?,?,?,?,?,?,1)', ['admin', 'admin', password, '林知远', 'admin', '综合行政部'])
    if (demo) {
      store.run('INSERT INTO users VALUES(?,?,?,?,?,?,1)', ['reviewer', 'reviewer', password, '陈予安', 'reviewer', '财务管理部'])
      store.run('INSERT INTO users VALUES(?,?,?,?,?,?,1)', ['operator', 'operator', password, '周沐', 'operator', '产品研发部'])
      store.run('INSERT INTO users VALUES(?,?,?,?,?,?,1)', ['operator2', 'operator2', password, '许清禾', 'operator', '市场运营部'])
      seedRequests(store)
    }
    store.persist()
  }
  return store
}
export class Store {
  constructor(readonly db: Database, readonly path: string) {}
  all<T = Record<string, unknown>>(sql: string, params: (string | number | null)[] = []): T[] {
    const statement = this.db.prepare(sql)
    try { statement.bind(params); const rows: T[] = []; while (statement.step()) rows.push(statement.getAsObject() as T); return rows } finally { statement.free() }
  }
  one<T = Record<string, unknown>>(sql: string, params: (string | number | null)[] = []): T | undefined { return this.all<T>(sql, params)[0] }
  run(sql: string, params: (string | number | null)[] = []) { this.db.run(sql, params) }
  persist() { writeFileSync(this.path + '.tmp', this.db.export()); renameSync(this.path + '.tmp', this.path) }
  transaction<T>(fn: () => T): T {
    this.db.run('BEGIN')
    let result: T
    try { result = fn(); this.db.run('COMMIT') } catch (error) { this.db.run('ROLLBACK'); throw error }
    this.persist(); return result
  }
  audit(actor: string, action: string, target: string, detail = '') {
    this.run('INSERT INTO audit VALUES(?,?,?,?,?,?)', [randomUUID(), actor, action, target, detail, new Date().toISOString()])
  }
  close() { this.persist(); this.db.close() }
}
function seedRequests(store: Store) {
  const titles = ['研发团队工作站采购', '企业服务账号开通', '合作供应商资质备案', '年度设计工具订阅', '办公区网络设备升级', '客户数据平台服务开通', '活动物料采购申请', '新供应商入驻备案', '研发测试设备采购', '团队协作空间开通', '品牌设计服务采购', '季度办公用品采购', '合作伙伴资料更新', '云资源扩容申请', '部门培训服务采购', '企业邮箱服务开通', '视频会议设备采购', '合同归档服务开通', '产品研究工具采购', '外部咨询服务采购', '工作室资质备案', '软件许可证采购', '展示样品采购', '办公空间服务申请']
  titles.forEach((title, i) => {
    const status = i % 9 === 8 ? 'draft' : i % 7 === 6 ? 'rejected' : i % 3 === 0 ? 'pending' : 'approved'
    const date = new Date(Date.now() - i * 23 * 3600000).toISOString()
    const form: RequestForm = { ...emptyForm(), title, category: i % 3 === 1 ? '服务开通' : '采购申请', department: i % 2 ? '市场运营部' : '产品研发部', contact: i % 2 ? '许清禾' : '周沐', companyName: ['青禾科技（南京）有限公司', '远景数字科技有限公司', '澄川软件服务有限公司'][i % 3]!, creditCode: '91320100MA00000' + String(i).padStart(3, '0'), amount: [12800, 4800, 0, 18600, 32000, 6800][i % 6]!, startDate: date.slice(0, 10), endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), description: '为保障团队日常业务运行，申请配置相应设备与服务。相关需求已与部门负责人沟通，请按流程审核。', justification: '现有设备已无法满足业务增长需求，预算依据三家供应商报价确定。', priority: i % 5 === 0 ? 'urgent' : 'normal' }
    const id = randomUUID()
    const isFiling = /资质|备案|入驻|资料更新/.test(title)
    const isService = /服务|开通|订阅|培训|咨询|云资源/.test(title)
    form.category = isFiling ? '资质备案' : isService ? '服务开通' : '采购申请'
    form.amount = form.category === '采购申请' ? Math.max(4800, form.amount) : 0
    if (isFiling || i % 3 === 0) {
      const fileId = randomUUID(), name = isFiling ? `企业资质材料-${i + 1}.txt` : `采购需求与报价-${i + 1}.txt`
      const content = Buffer.from(`FlowDesk 虚构业务材料\n\n申请：${title}\n企业：${form.companyName}\n联系人：${form.contact}\n说明：此文件仅用于个人项目演示，不是真实营业执照或供应商报价。\n`)
      const folder = join(dirname(store.path), 'uploads', fileId)
      mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'content'), content)
      store.run('INSERT INTO uploads VALUES(?,?,?,?,?,?,?,?,?)', [fileId, i % 2 ? 'operator2' : 'operator', name, content.length, createHash('md5').update(content).digest('hex'), 1, '[0]', 'complete', date])
      form.attachmentIds = [fileId]
    }
    store.run('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,1)', [id, `FD-${new Date().getFullYear()}-${String(1001 + i)}`, i % 2 ? 'operator2' : 'operator', status, JSON.stringify(form), date, date, status === 'draft' ? null : date])
    if (status !== 'draft') store.run('INSERT INTO reviews VALUES(?,?,?,?,?,?)', [randomUUID(), id, form.contact, '提交申请', '申请已提交，等待审核。', date])
    if (status === 'approved' || status === 'rejected') store.run('INSERT INTO reviews VALUES(?,?,?,?,?,?)', [randomUUID(), id, '陈予安', status === 'approved' ? '审核通过' : '退回修改', status === 'approved' ? '资料完整，符合申请条件。' : '请补充预算依据及服务范围后重新提交。', date])
  })
  store.audit('系统', '初始化工作台', '演示数据', '已创建角色账号与 24 条业务申请。')
}
