<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Search, ShieldCheck, History, RefreshCw } from 'lucide-vue-next'
import { api, dateTime, errorMessage } from '@/lib/api'
import type { AuditEvent } from '../../shared/domain'
import EmptyState from '@/components/EmptyState.vue'
import Pagination from '@/components/Pagination.vue'
const events = ref<AuditEvent[]>([]),
  page = ref(1),
  q = ref(''),
  total = ref(0),
  error = ref(''),
  loading = ref(false)
let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  controller?.abort()
  controller = new AbortController()
  const current = controller
  error.value = ''
  loading.value = true
  try {
    const result = await api<{ items: AuditEvent[]; total: number }>(
      '/audit?' + new URLSearchParams({ page: String(page.value), q: q.value }),
      { signal: current.signal },
    )
    events.value = result.items
    total.value = result.total
  } catch (e) {
    if (!current.signal.aborted) error.value = errorMessage(e)
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
watch(page, load)
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})
void load()
onUnmounted(() => {
  controller?.abort()
  clearTimeout(timer)
})
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">ACTIVITY & AUDIT</div>
      <h1>操作日志<span class="heading-dot">.</span></h1>
      <p>记录重要操作，让业务过程可追溯。</p>
    </div>
    <span class="date-chip"><ShieldCheck :size="16" />仅管理员可查看</span>
  </div>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <h2>工作空间操作记录</h2>
        <p>登录、申请流转、文件上传与账号权限变更</p>
      </div>
      <div class="inline-actions">
        <div class="search-input">
          <Search :size="17" /><input
            v-model="q"
            aria-label="搜索操作记录"
            placeholder="搜索成员、操作或对象"
          />
        </div>
        <button class="icon-button bordered" aria-label="刷新操作日志" @click="load">
          <RefreshCw :size="17" :class="{ spinning: loading }" />
        </button>
      </div>
    </div>
    <div v-if="error" class="form-alert error">
      {{ error }}<button class="text-button" @click="load">重试</button>
    </div>
    <div class="table-scroll">
      <table class="data-table audit-table">
        <thead>
          <tr>
            <th>操作行为</th>
            <th>操作人</th>
            <th>操作对象</th>
            <th>详情</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.id">
            <td>
              <span class="person-inline"
                ><span class="document-icon"><History :size="16" /></span
                ><strong>{{ event.action }}</strong></span
              >
            </td>
            <td>{{ event.actorName }}</td>
            <td class="mono">{{ event.target }}</td>
            <td class="muted audit-detail">{{ event.detail || '—' }}</td>
            <td class="muted nowrap">{{ dateTime(event.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="loading && !events.length" class="loading-state">
      <span class="spinner" />正在加载日志…
    </div>
    <EmptyState
      v-else-if="!events.length"
      title="没有找到相关操作"
      description="尝试其他搜索条件。"
    /><Pagination :page="page" :total="total" :page-size="15" @change="page = $event" />
  </section>
</template>
