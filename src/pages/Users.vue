<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Plus,
  Search,
  ShieldCheck,
  Users,
  UserRoundCheck,
  Pencil,
  LockKeyhole,
} from 'lucide-vue-next'
import { api, json, errorMessage } from '@/lib/api'
import { type User, type Role, roleLabels, departments } from '../../shared/domain'
import { useAuth } from '@/stores/auth'
import { useUI } from '@/stores/ui'
import Modal from '@/components/Modal.vue'
import EmptyState from '@/components/EmptyState.vue'
const auth = useAuth(),
  ui = useUI()
const users = ref<User[]>([]),
  q = ref(''),
  loading = ref(false),
  error = ref(''),
  editing = ref<User>(),
  creating = ref(false),
  busy = ref(false),
  modalError = ref('')
const newUser = ref({
  username: '',
  name: '',
  password: '',
  role: 'operator' as Role,
  department: '产品研发部',
})
const editedRole = ref<Role>('operator'),
  editedEnabled = ref(true)
const filtered = computed(() =>
  users.value.filter((u) => [u.name, u.username, u.department].some((v) => v.includes(q.value))),
)
const roles = [
  {
    key: 'admin',
    icon: ShieldCheck,
    description: '管理全部业务、审核、账号与操作记录',
    features: '全空间数据 · 账号管理 · 操作日志',
  },
  {
    key: 'reviewer',
    icon: UserRoundCheck,
    description: '查看工作空间申请并完成审核流转',
    features: '全部申请 · 审核处理 · 附件查看',
  },
  {
    key: 'operator',
    icon: Users,
    description: '创建个人业务申请，上传与管理材料',
    features: '本人申请 · 草稿编辑 · 文件上传',
  },
] as const
async function load() {
  loading.value = true
  try {
    users.value = await api<User[]>('/users')
    error.value = ''
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
function edit(user: User) {
  editing.value = user
  editedRole.value = user.role
  editedEnabled.value = user.enabled
  modalError.value = ''
}
function create() {
  creating.value = true
  newUser.value = {
    username: '',
    name: '',
    password: '',
    role: 'operator',
    department: '产品研发部',
  }
  modalError.value = ''
}
async function save() {
  busy.value = true
  modalError.value = ''
  try {
    if (creating.value) await api('/users', { method: 'POST', body: json(newUser.value) })
    else
      await api(`/users/${editing.value!.id}`, {
        method: 'PATCH',
        body: json({ role: editedRole.value, enabled: editedEnabled.value }),
      })
    ui.toast(creating.value ? '账号创建成功' : '账号权限已更新，原会话已失效')
    creating.value = false
    editing.value = undefined
    await load()
  } catch (e) {
    modalError.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
onMounted(load)

function closeModal() {
  creating.value = false
  editing.value = undefined
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">PEOPLE & ACCESS</div>
      <h1>账号与权限<span class="heading-dot">.</span></h1>
      <p>明确角色边界，让每位成员在合适的权限内协作。</p>
    </div>
    <button class="button primary" @click="create"><Plus :size="17" />添加成员</button>
  </div>
  <div class="role-cards">
    <section v-for="role in roles" :key="role.key" class="panel role-card">
      <div>
        <span
          class="stat-icon"
          :class="role.key === 'admin' ? 'mint' : role.key === 'reviewer' ? 'blue' : 'purple'"
          ><component :is="role.icon" :size="20" /></span
        ><span>{{ users.filter((u) => u.role === role.key).length }} 位成员</span>
      </div>
      <h2>{{ roleLabels[role.key] }}</h2>
      <p>{{ role.description }}</p>
      <small>{{ role.features }}</small>
    </section>
  </div>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <h2>
          空间成员 <span class="number-badge">{{ users.length }}</span>
        </h2>
        <p>角色变更与停用会使该成员的登录会话失效</p>
      </div>
      <div class="search-input">
        <Search :size="17" /><input
          v-model="q"
          placeholder="搜索姓名、账号或部门"
          aria-label="搜索成员"
        />
      </div>
    </div>
    <div v-if="error" class="form-alert error">
      {{ error }}<button class="text-button" @click="load">重试</button>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>成员</th>
            <th>账号</th>
            <th>所属部门</th>
            <th>角色</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in filtered" :key="user.id">
            <td>
              <span class="person-inline"
                ><span class="avatar">{{ user.name.slice(-2) }}</span
                ><strong>{{ user.name }}</strong
                ><span v-if="user.id === auth.user?.id" class="self-badge">我</span></span
              >
            </td>
            <td class="muted mono">@{{ user.username }}</td>
            <td>{{ user.department }}</td>
            <td>
              <span class="role-label" :class="user.role">{{ roleLabels[user.role] }}</span>
            </td>
            <td>
              <span class="status-badge" :class="user.enabled ? 'approved' : 'draft'"
                ><i />{{ user.enabled ? '已启用' : '已停用' }}</span
              >
            </td>
            <td>
              <button v-if="user.id !== auth.user?.id" class="table-action" @click="edit(user)">
                <Pencil :size="14" />管理</button
              ><span v-else class="muted"><LockKeyhole :size="14" /></span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="loading && !users.length" class="loading-state">
      <span class="spinner" />正在加载成员…
    </div>
    <EmptyState
      v-else-if="!filtered.length"
      title="没有找到成员"
      description="请尝试其他姓名或账号。"
    />
    <div class="pagination">
      <span>共 {{ filtered.length }} 位成员</span
      ><span><ShieldCheck :size="14" />权限由服务端统一校验</span>
    </div>
  </section>
  <Modal
    v-if="creating || editing"
    :title="creating ? '添加空间成员' : `管理成员 · ${editing?.name}`"
    @close="!busy && ((creating = false), (editing = undefined))"
    ><form v-if="creating" id="create-user-form" @submit.prevent="save">
      <div class="form-grid">
        <div class="form-field">
          <label for="new-name">姓名</label
          ><input
            id="new-name"
            v-model="newUser.name"
            required
            minlength="2"
            maxlength="30"
            placeholder="成员姓名"
          />
        </div>
        <div class="form-field">
          <label for="new-username">账号</label
          ><input
            id="new-username"
            v-model="newUser.username"
            required
            pattern="[a-zA-Z0-9_]{3,30}"
            placeholder="3–30 位字母、数字或下划线"
          />
        </div>
        <div class="form-field full">
          <label for="new-password">初始密码</label
          ><input
            id="new-password"
            v-model="newUser.password"
            type="password"
            required
            minlength="12"
            maxlength="128"
            autocomplete="new-password"
            placeholder="至少 12 位密码"
          />
        </div>
        <div class="form-field">
          <label for="new-role">角色</label
          ><select id="new-role" v-model="newUser.role">
            <option v-for="(label, role) in roleLabels" :key="role" :value="role">
              {{ label }}
            </option>
          </select>
        </div>
        <div class="form-field">
          <label for="new-department">部门</label
          ><select id="new-department" v-model="newUser.department">
            <option v-for="d in departments" :key="d">{{ d }}</option>
          </select>
        </div>
      </div>
    </form>
    <template v-else
      ><div class="form-field">
        <label for="edit-role">成员角色</label
        ><select id="edit-role" v-model="editedRole">
          <option v-for="(label, role) in roleLabels" :key="role" :value="role">{{ label }}</option>
        </select>
      </div>
      <div class="form-field">
        <label for="edit-enabled">账号状态</label
        ><select id="edit-enabled" v-model="editedEnabled">
          <option :value="true">启用</option>
          <option :value="false">停用</option>
        </select>
      </div>
      <div class="form-alert info">保存后，该成员需要重新登录以获取最新权限。</div></template
    >
    <div v-if="modalError" class="form-alert error" role="alert">{{ modalError }}</div>
    <template #footer
      ><button class="button secondary" :disabled="busy" @click="closeModal">取消</button
      ><button
        class="button primary"
        :disabled="busy"
        :type="creating ? 'submit' : 'button'"
        :form="creating ? 'create-user-form' : undefined"
        @click="!creating && save()"
      >
        <span v-if="busy" class="spinner" />{{
          busy ? '正在保存' : creating ? '创建成员' : '保存修改'
        }}
      </button></template
    ></Modal
  >
</template>
