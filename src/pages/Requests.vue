<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Search, Download, SlidersHorizontal, ArrowUpRight, FileText, X, RefreshCw } from 'lucide-vue-next'
import { api, dateTime, money, errorMessage } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { type BusinessRequest, categories, statusLabels, type RequestStatus } from '../../shared/domain'
import StatusBadge from '@/components/StatusBadge.vue'
import Pagination from '@/components/Pagination.vue'
import EmptyState from '@/components/EmptyState.vue'
const route = useRoute(), auth = useAuth()
const reviewMode = computed(() => route.path === '/reviews')
const q = ref(String(route.query.q || '')), status = ref(String(route.query.status || (reviewMode.value ? 'pending' : ''))), category = ref(''), sort = ref('newest'), page = ref(1)
const items = ref<BusinessRequest[]>([]), total = ref(0), loading = ref(false), error = ref(''), exporting = ref(false)
const tabs: { value: string; label: string }[] = [{ value: '', label: '全部申请' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]
let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  controller?.abort(); controller = new AbortController(); const current = controller
  loading.value = true; error.value = ''
  const params = new URLSearchParams({ q: q.value, status: status.value, category: category.value, sort: sort.value, page: String(page.value) })
  try { const result = await api<{ items: BusinessRequest[]; total: number }>('/requests?' + params, { signal: current.signal }); if (!current.signal.aborted) { items.value = result.items; total.value = result.total } } catch (e) { if (!current.signal.aborted) error.value = errorMessage(e) } finally { if (!current.signal.aborted) loading.value = false }
}
watch([status, category, sort], () => { page.value = 1; void load() })
watch(q, () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; void load() }, 300) })
watch(() => route.query, query => { q.value = String(query.q || ''); status.value = String(query.status || (reviewMode.value ? 'pending' : '')); page.value = 1; void load() })
watch(page, load)
void load()
onUnmounted(() => { controller?.abort(); clearTimeout(timer) })
function csvCell(value: string | number) { const text = String(value); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"' }
async function exportCsv() {
  exporting.value = true
  try {
    const rows: BusinessRequest[] = []; let current = 1, count = Infinity
    while (rows.length < count) { const result = await api<{ items: BusinessRequest[]; total: number }>('/requests?' + new URLSearchParams({ q: q.value, status: status.value, category: category.value, sort: sort.value, page: String(current++), pageSize: '50' })); rows.push(...result.items); count = result.total; if (!result.items.length) break }
    const headers = ['申请编号', '申请标题', '类型', '申请人', '部门', '状态', ...(auth.can('request:amount') ? ['预算金额'] : []), '创建时间']
    const lines = [headers, ...rows.map(r => [r.number, r.form.title, r.form.category, r.ownerName, r.form.department, statusLabels[r.status], ...(auth.can('request:amount') ? [r.form.amount] : []), r.createdAt])].map(row => row.map(csvCell).join(','))
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'FlowDesk-业务申请.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { error.value = errorMessage(e) } finally { exporting.value = false }
}
</script>
<template>
  <div class="page-heading"><div><div class="eyebrow">{{ reviewMode ? 'APPROVAL CENTER' : 'REQUEST MANAGEMENT' }}</div><h1>{{ reviewMode ? '审核中心' : '申请管理' }}<span class="heading-dot">.</span></h1><p>{{ reviewMode ? '聚焦待审核事项，让每份申请及时得到回应。' : '从一份申请开始，让业务流转清晰有序。' }}</p></div><div class="heading-actions"><button class="button secondary" :disabled="exporting || loading" @click="exportCsv"><Download :size="16" />{{ exporting ? '正在导出' : '导出记录' }}</button><RouterLink v-permission="'request:create'" to="/requests/new" class="button primary"><Plus :size="17" />新建申请</RouterLink></div></div>
  <section class="panel requests-panel"><div class="tabs" role="tablist" aria-label="申请状态"><button v-for="tab in tabs" :key="tab.value" role="tab" :aria-selected="status === tab.value" :class="{ selected: status === tab.value }" @click="status = tab.value">{{ tab.label }}<span v-if="status === tab.value" class="tab-count">{{ total }}</span></button></div><div class="filter-bar"><div class="search-input"><Search :size="17" /><input v-model="q" aria-label="筛选申请" placeholder="搜索申请标题、编号或申请人" /><button v-if="q" aria-label="清空搜索" @click="q = ''"><X :size="15" /></button></div><div class="filter-selects"><select v-model="category" aria-label="申请类型"><option value="">全部类型</option><option v-for="c in categories" :key="c">{{ c }}</option></select><select v-model="sort" aria-label="排序方式"><option value="newest">最新创建</option><option value="oldest">最早创建</option><option v-if="auth.can('request:amount')" value="amount">预算从高到低</option></select><button class="icon-button bordered" aria-label="重置筛选" @click="q = ''; category = ''; sort = 'newest'; status = reviewMode ? 'pending' : ''"><SlidersHorizontal :size="17" /></button><button class="icon-button bordered" aria-label="刷新列表" @click="load"><RefreshCw :size="17" :class="{ spinning: loading }" /></button></div></div><div v-if="error" class="form-alert error" role="alert">{{ error }}<button class="text-button" @click="load">重试</button></div><div class="table-scroll" :class="{ 'is-loading': loading }" :aria-busy="loading"><table class="data-table"><thead><tr><th>申请事项</th><th>类型 / 部门</th><th>申请人</th><th v-if="auth.can('request:amount')">预算金额</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td><RouterLink :to="`/requests/${item.id}`" class="request-title"><span class="document-icon" :class="{ amber: item.form.priority === 'urgent' }"><FileText :size="18" /></span><div><strong>{{ item.form.title || '未命名草稿' }}<span v-if="item.form.priority === 'urgent'" class="urgent-label">加急</span></strong><small>{{ item.number }}</small></div></RouterLink></td><td><div class="cell-stack"><span>{{ item.form.category }}</span><small>{{ item.form.department }}</small></div></td><td><span class="person-inline"><span class="avatar tiny">{{ item.ownerName.slice(-1) }}</span>{{ item.ownerName }}</span></td><td v-if="auth.can('request:amount')" class="money-cell">{{ money(item.form.amount) }}</td><td><StatusBadge :status="item.status as RequestStatus" /></td><td class="muted nowrap">{{ dateTime(item.createdAt) }}</td><td><RouterLink class="table-action" :to="`/requests/${item.id}`">{{ reviewMode && item.status === 'pending' && item.ownerId !== auth.user?.id ? '去审核' : '查看' }}<ArrowUpRight :size="14" /></RouterLink></td></tr></tbody></table></div><div v-if="loading && !items.length" class="loading-state"><span class="spinner" />正在加载申请…</div><EmptyState v-else-if="!items.length && !error" title="没有找到符合条件的申请" description="试试其他筛选条件，或创建一份新的申请。"><button class="button secondary" @click="q = ''; status = ''; category = ''">清空筛选</button></EmptyState><Pagination :page="page" :total="total" :page-size="8" @change="page = $event" /></section><div class="scope-note"><span class="live-dot" />{{ auth.can('request:all') ? '当前角色可查看工作空间内全部申请' : '当前角色仅可查看自己提交的申请' }}<span>{{ total }} 项符合当前筛选</span></div>
</template>
