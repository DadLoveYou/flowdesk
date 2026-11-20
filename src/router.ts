import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '@/stores/auth'
import type { Permission } from '../shared/domain'

export const navigation = [
  { path: '/', label: '工作台', icon: 'LayoutDashboard', permission: 'dashboard' },
  { path: '/requests', label: '申请管理', icon: 'Files', permission: 'requests' },
  { path: '/reviews', label: '审核中心', icon: 'ClipboardCheck', permission: 'request:review' },
  { path: '/files', label: '文件中心', icon: 'FolderOpen', permission: 'files' },
  { path: '/users', label: '账号与权限', icon: 'Users', permission: 'users' },
  { path: '/audit', label: '操作日志', icon: 'History', permission: 'audit' },
] as const
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: () => import('@/pages/Dashboard.vue'), meta: { permission: 'dashboard', title: '工作台' } },
  { path: '/requests', name: 'requests', component: () => import('@/pages/Requests.vue'), meta: { permission: 'requests', title: '申请管理' } },
  { path: '/reviews', name: 'reviews', component: () => import('@/pages/Requests.vue'), meta: { permission: 'request:review', title: '审核中心' } },
  { path: '/requests/new', name: 'create', component: () => import('@/pages/RequestEditor.vue'), meta: { permission: 'request:create', title: '新建申请' } },
  { path: '/requests/:id/edit', name: 'edit', component: () => import('@/pages/RequestEditor.vue'), meta: { permission: 'request:create', title: '编辑申请' } },
  { path: '/requests/:id', name: 'detail', component: () => import('@/pages/RequestDetail.vue'), meta: { permission: 'requests', title: '申请详情' } },
  { path: '/files', name: 'files', component: () => import('@/pages/Files.vue'), meta: { permission: 'files', title: '文件中心' } },
  { path: '/users', name: 'users', component: () => import('@/pages/Users.vue'), meta: { permission: 'users', title: '账号与权限' } },
  { path: '/audit', name: 'audit', component: () => import('@/pages/Audit.vue'), meta: { permission: 'audit', title: '操作日志' } },
]
export const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/login', name: 'login', component: () => import('@/pages/Login.vue'), meta: { title: '登录' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFound.vue'), meta: { title: '页面不存在' } },
] })
let registered: string[] = []
export function syncRoutes() {
  registered.forEach(name => router.removeRoute(name)); registered = []
  const auth = useAuth()
  for (const route of routes) if (auth.can(route.meta!.permission as Permission)) { router.addRoute(route); registered.push(String(route.name)) }
}
router.beforeEach(async to => {
  const auth = useAuth()
  if (!auth.ready) { await auth.restore(); syncRoutes(); if (auth.user && to.name === 'not-found' && routes.some(r => r.path === to.path || r.path.includes(':id') && to.path.startsWith('/requests/'))) return to.fullPath }
  if (!auth.user && to.name !== 'login') return { name: 'login', query: { redirect: to.fullPath } }
  if (auth.user && to.name === 'login') return '/'
  if (to.meta.permission && !auth.can(to.meta.permission as Permission)) return '/'
  document.title = `${String(to.meta.title || '工作台')} · FlowDesk`
})
