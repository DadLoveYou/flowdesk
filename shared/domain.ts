export type Role = 'admin' | 'reviewer' | 'operator'
export type Permission = 'dashboard' | 'requests' | 'request:create' | 'request:review' | 'request:all' | 'request:amount' | 'files' | 'users' | 'audit'
export const roleLabels: Record<Role, string> = { admin: '管理员', reviewer: '审核员', operator: '业务专员' }
export const rolePermissions: Record<Role, Permission[]> = {
  admin: ['dashboard', 'requests', 'request:create', 'request:review', 'request:all', 'request:amount', 'files', 'users', 'audit'],
  reviewer: ['dashboard', 'requests', 'request:review', 'request:all', 'request:amount', 'files'],
  operator: ['dashboard', 'requests', 'request:create', 'files'],
}
export interface User { id: string; username: string; name: string; role: Role; department: string; enabled: boolean; permissions: Permission[] }
export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export const statusLabels: Record<RequestStatus, string> = { draft: '草稿', pending: '待审核', approved: '已通过', rejected: '已退回' }
export const categories = ['采购申请', '服务开通', '资质备案'] as const
export const departments = ['产品研发部', '市场运营部', '财务管理部', '综合行政部'] as const
export interface RequestForm {
  title: string; category: typeof categories[number]; department: string; priority: 'normal' | 'urgent';
  applicantType: 'enterprise' | 'personal'; companyName: string; creditCode: string; contact: string;
  amount: number; startDate: string; endDate: string; description: string; justification: string; attachmentIds: string[];
}
export interface BusinessRequest {
  id: string; number: string; ownerId: string; ownerName: string; status: RequestStatus; form: RequestForm;
  createdAt: string; updatedAt: string; submittedAt: string | null; version: number;
}
export interface Review { id: string; requestId: string; actorName: string; action: string; comment: string; createdAt: string }
export interface StoredFile { id: string; name: string; size: number; hash: string; totalChunks: number; chunks: number[]; state: 'uploading' | 'complete'; createdAt: string; ownerId: string; ownerName?: string }
export interface AuditEvent { id: string; actorName: string; action: string; target: string; detail: string; createdAt: string }
export const emptyForm = (): RequestForm => ({ title: '', category: '采购申请', department: '产品研发部', priority: 'normal', applicantType: 'enterprise', companyName: '', creditCode: '', contact: '', amount: 0, startDate: '', endDate: '', description: '', justification: '', attachmentIds: [] })

export function submissionErrors(form: RequestForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (form.title.trim().length < 4) errors.title = '申请标题至少填写 4 个字符'
  if (!form.contact.trim()) errors.contact = '请填写联系人'
  if (form.applicantType === 'enterprise') {
    if (!form.companyName.trim()) errors.companyName = '请填写企业名称'
    if (!/^[0-9A-Z]{18}$/.test(form.creditCode)) errors.creditCode = '请填写 18 位大写字母或数字的信用代码'
    if (form.category === '资质备案' && !form.attachmentIds.length) errors.attachmentIds = '企业资质备案需要上传营业执照'
  }
  if (form.category === '采购申请' && form.amount <= 0) errors.amount = '采购预算必须大于 0'
  if (form.amount > 20000 && form.justification.trim().length < 10) errors.justification = '超过 20,000 元请填写至少 10 字的预算说明'
  if (!form.startDate) errors.startDate = '请选择开始日期'
  if (!form.endDate) errors.endDate = '请选择结束日期'
  if (form.startDate && form.endDate && form.endDate < form.startDate) errors.endDate = '结束日期不能早于开始日期'
  if (form.description.trim().length < 10) errors.description = '请填写至少 10 字的申请说明'
  return errors
}
