<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  FileText,
  Clock3,
  CheckCircle2,
  FilePenLine,
  CalendarDays,
  ChevronRight,
  Check,
  Activity,
  RefreshCw,
} from 'lucide-vue-next'
import { useAuth } from '@/stores/auth'
import { api, dateTime, errorMessage } from '@/lib/api'
import type { BusinessRequest, AuditEvent } from '../../shared/domain'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
const auth = useAuth()
interface Dashboard {
  stats: { total: number; pending: number; approved: number; draft: number }
  trend: { day: string; submitted: number; approved: number }[]
  recent: BusinessRequest[]
  pending: BusinessRequest[]
  activity: AuditEvent[]
}
const data = ref<Dashboard>(),
  error = ref(''),
  loading = ref(true)
const cards = computed(() => [
  {
    label: '申请总数',
    value: data.value?.stats.total || 0,
    icon: FileText,
    cls: 'mint',
    note: auth.can('request:all') ? '工作空间全部申请' : '我提交的全部申请',
  },
  {
    label: '待审核申请',
    value: data.value?.stats.pending || 0,
    icon: Clock3,
    cls: 'amber',
    note: auth.can('request:review') ? '需要你关注的申请' : '等待审核员处理',
  },
  {
    label: '已通过申请',
    value: data.value?.stats.approved || 0,
    icon: CheckCircle2,
    cls: 'blue',
    note: '已完成审核流程',
  },
  {
    label: '草稿箱',
    value: data.value?.stats.draft || 0,
    icon: FilePenLine,
    cls: 'purple',
    note: '尚未提交的申请',
  },
])
const max = computed(() =>
  Math.max(4, ...(data.value?.trend.map((t) => Math.max(t.submitted, t.approved)) || [])),
)
function path(field: 'submitted' | 'approved') {
  return (
    data.value?.trend
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${38 + i * 81} ${176 - (d[field] / max.value) * 140}`)
      .join(' ') || ''
  )
}
const today = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date())
async function load() {
  error.value = ''
  loading.value = true
  try {
    data.value = await api<Dashboard>('/dashboard')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">WORKSPACE OVERVIEW</div>
      <h1>{{ auth.user?.name }}，今天也从容协作<span class="heading-dot">.</span></h1>
      <p>待办与业务进展，一眼掌握。</p>
    </div>
    <div class="heading-actions">
      <span class="date-chip"><CalendarDays :size="15" />{{ today }}</span
      ><RouterLink v-permission="'request:create'" to="/requests/new" class="button primary"
        ><Plus :size="17" />新建申请</RouterLink
      >
    </div>
  </div>
  <div v-if="error" class="form-alert error">
    {{ error }}<button class="text-button" @click="load">重新加载</button>
  </div>
  <div v-if="loading && !data" class="skeleton-grid">
    <div v-for="n in 4" :key="n" class="skeleton stat-skeleton" />
  </div>
  <template v-if="data"
    ><div class="stats-grid">
      <RouterLink
        v-for="(card, i) in cards"
        :key="card.label"
        :to="i === 0 ? '/requests' : `/requests?status=${['', 'pending', 'approved', 'draft'][i]}`"
        class="stat-card"
        ><div class="stat-top">
          <span>{{ card.label }}</span
          ><span class="stat-icon" :class="card.cls"><component :is="card.icon" :size="19" /></span>
        </div>
        <strong class="stat-value"
          >{{ card.value.toString().padStart(2, '0') }}<small>项</small></strong
        >
        <div class="stat-bottom">
          <span>{{ card.note }}</span
          ><ArrowUpRight :size="15" /></div
      ></RouterLink>
    </div>
    <div class="dashboard-mid">
      <section class="panel trend-panel">
        <div class="panel-heading">
          <div>
            <h2>申请趋势 <span class="subtle-label">近 7 天</span></h2>
            <p>了解团队的业务提交与处理情况</p>
          </div>
          <button class="icon-button" aria-label="刷新统计" @click="load">
            <RefreshCw :size="16" :class="{ spinning: loading }" />
          </button>
        </div>
        <div class="chart-legend">
          <span><i class="green" />提交申请</span><span><i class="light-green" />审核通过</span>
        </div>
        <div class="trend-chart">
          <svg viewBox="0 0 560 214" role="img" aria-label="近七天申请提交与审核通过趋势">
            <defs>
              <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#4e9e7b" stop-opacity=".22" />
                <stop offset="100%" stop-color="#4e9e7b" stop-opacity="0" />
              </linearGradient>
            </defs>
            <g v-for="n in 5" :key="n">
              <line
                x1="38"
                :y1="36 + (n - 1) * 35"
                x2="524"
                :y2="36 + (n - 1) * 35"
                stroke="#edf1ef"
                stroke-dasharray="3 4"
              />
              <text x="20" :y="40 + (n - 1) * 35" text-anchor="end" class="chart-text">
                {{ Math.round((max * (5 - n)) / 4) }}
              </text>
            </g>
            <path :d="path('submitted') + ' L524 176 L38 176 Z'" fill="url(#area-fill)" />
            <path
              :d="path('approved')"
              fill="none"
              stroke="#acc8b5"
              stroke-width="2.5"
              stroke-dasharray="6 4"
            />
            <path
              :d="path('submitted')"
              fill="none"
              stroke="#32815f"
              stroke-width="3"
              stroke-linejoin="round"
            />
            <g v-for="(point, i) in data.trend" :key="point.day">
              <circle
                :cx="38 + i * 81"
                :cy="176 - (point.submitted / max) * 140"
                r="4"
                fill="#fff"
                stroke="#32815f"
                stroke-width="2"
              >
                <title>
                  {{ point.day }}：提交 {{ point.submitted }} 项，通过 {{ point.approved }} 项
                </title>
              </circle>
              <text :x="38 + i * 81" y="205" text-anchor="middle" class="chart-text">
                {{ point.day.slice(5).replace('-', '/') }}
              </text>
            </g>
          </svg>
        </div>
        <div class="chart-caption">
          <span class="live-dot" />统计范围：{{
            auth.can('request:all') ? '整个工作空间' : '我的业务申请'
          }}<span>数据实时计算</span>
        </div>
      </section>
      <section class="panel todo-panel">
        <div class="panel-heading">
          <div>
            <h2>
              {{ auth.can('request:review') ? '待办事项' : '审核进展'
              }}<span class="number-badge">{{ data.stats.pending }}</span>
            </h2>
            <p>
              {{
                auth.can('request:review')
                  ? '这些申请正在等待你的处理'
                  : '已提交，正在等待审核员处理'
              }}
            </p>
          </div>
          <span class="stat-icon amber"><Clock3 :size="18" /></span>
        </div>
        <div v-if="data.pending.length" class="todo-list">
          <RouterLink
            v-for="item in data.pending.slice(0, 3)"
            :key="item.id"
            :to="`/requests/${item.id}`"
            class="todo-item"
            ><span class="todo-dot" :class="{ urgent: item.form.priority === 'urgent' }" />
            <div>
              <strong>{{ item.form.title }}</strong
              ><span>{{ item.ownerName }} · {{ item.form.category }}</span>
            </div>
            <ChevronRight :size="15"
          /></RouterLink>
        </div>
        <EmptyState
          v-else
          title="所有待办已处理"
          description="可以从容开始下一项工作。"
        /><RouterLink
          class="todo-footer"
          :to="auth.can('request:review') ? '/reviews' : '/requests?status=pending'"
          >{{ auth.can('request:review') ? '进入审核中心' : '查看全部待审核申请'
          }}<ArrowRight :size="16"
        /></RouterLink>
      </section>
    </div>
    <div class="dashboard-bottom">
      <section class="panel recent-panel">
        <div class="panel-heading">
          <div>
            <h2>最近申请</h2>
            <p>最新业务动态，保持信息同步</p>
          </div>
          <RouterLink to="/requests" class="text-button"
            >查看全部<ArrowUpRight :size="15"
          /></RouterLink>
        </div>
        <div class="table-scroll">
          <table class="data-table compact">
            <thead>
              <tr>
                <th>申请事项</th>
                <th>申请人</th>
                <th>状态</th>
                <th>提交时间</th>
                <th aria-label="查看" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in data.recent" :key="item.id">
                <td>
                  <RouterLink :to="`/requests/${item.id}`" class="request-title"
                    ><span class="document-icon"><FileText :size="17" /></span>
                    <div>
                      <strong>{{ item.form.title }}</strong
                      ><small>{{ item.number }}</small>
                    </div></RouterLink
                  >
                </td>
                <td>
                  <span class="person-inline"
                    ><span class="avatar tiny">{{ item.ownerName.slice(-1) }}</span
                    >{{ item.ownerName }}</span
                  >
                </td>
                <td><StatusBadge :status="item.status" /></td>
                <td class="muted nowrap">{{ dateTime(item.createdAt, true) }}</td>
                <td>
                  <RouterLink
                    :to="`/requests/${item.id}`"
                    class="row-arrow"
                    :aria-label="`查看${item.form.title}`"
                    ><ArrowUpRight :size="16"
                  /></RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState
          v-if="!data.recent.length"
          title="还没有申请"
          description="创建第一份申请，开始你的工作流程。"
        />
      </section>
      <section class="panel activity-panel">
        <div class="panel-heading">
          <div>
            <h2>协作动态</h2>
            <p>每一步，都有记录</p>
          </div>
          <Activity :size="19" class="muted" />
        </div>
        <div class="activity-list">
          <div v-for="(event, i) in data.activity" :key="event.id" class="activity-item">
            <span class="activity-node" :class="{ first: i === 0 }"><Check :size="12" /></span>
            <div>
              <p>
                <strong>{{ event.actorName }}</strong> {{ event.action }}
              </p>
              <small>{{ event.target }}</small
              ><time>{{ dateTime(event.createdAt) }}</time>
            </div>
          </div>
        </div>
        <EmptyState
          v-if="!data.activity.length"
          title="等待新的动态"
          description="业务流转记录会展示在这里。"
        />
      </section>
    </div>
  </template>
</template>
