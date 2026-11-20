<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  ArrowLeft,
  Save,
  Send,
  Check,
  Clock3,
  FileText,
  ShieldCheck,
  Info,
  RotateCcw,
  X,
} from 'lucide-vue-next'
import {
  emptyForm,
  categories,
  departments,
  submissionErrors,
  type RequestForm,
  type BusinessRequest,
} from '../../shared/domain'
import { applicantFields, detailFields } from '@/lib/form-schema'
import { api, json, HttpError, errorMessage } from '@/lib/api'
import { readDraft, saveDraft, removeDraft, type Draft } from '@/lib/drafts'
import { useAuth } from '@/stores/auth'
import { useUI } from '@/stores/ui'
import SchemaFields from '@/components/SchemaFields.vue'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
const route = useRoute(),
  router = useRouter(),
  auth = useAuth(),
  ui = useUI()
const form = ref<RequestForm>(emptyForm()),
  errors = ref<Record<string, string>>({}),
  version = ref(1),
  loading = ref(true),
  busy = ref(false),
  pageError = ref(''),
  validating = ref(false),
  recovery = ref<Draft>(),
  savedAt = ref(''),
  saveError = ref(false)
const requestId = computed(() => (route.params.id ? String(route.params.id) : ''))
const uploading = ref(false)
const draftKey = `${auth.user!.id}:${requestId.value || 'new'}`
let timer: ReturnType<typeof setTimeout> | undefined,
  validationController: AbortController | undefined,
  done = false
let savingLocal: Promise<void> = Promise.resolve()
async function persist() {
  if (loading.value || done || recovery.value) return
  const snapshot = JSON.parse(JSON.stringify(form.value)) as RequestForm
  savingLocal = savingLocal
    .catch(() => {})
    .then(async () => {
      try {
        savedAt.value = await saveDraft(draftKey, snapshot)
        saveError.value = false
      } catch {
        saveError.value = true
      }
    })
  await savingLocal
}
watch(
  form,
  () => {
    if (loading.value || done) return
    clearTimeout(timer)
    timer = setTimeout(persist, 600)
  },
  { deep: true },
)
watch(
  () => [form.value.creditCode, form.value.category, form.value.applicantType],
  () => {
    validationController?.abort()
    validating.value = false
    delete errors.value.creditCode
  },
)
watch(
  () => form.value.category,
  (category) => {
    if (category !== '采购申请') {
      form.value.amount = 0
      form.value.justification = ''
    }
  },
)
function update(key: keyof RequestForm, value: string | number) {
  ;(form.value as unknown as Record<string, unknown>)[key] = value
  delete errors.value[key]
  if (key === 'startDate' || key === 'endDate') delete errors.value.endDate
}
async function validateCompany() {
  if (
    form.value.applicantType !== 'enterprise' ||
    form.value.category !== '资质备案' ||
    !/^[0-9A-Z]{18}$/.test(form.value.creditCode)
  )
    return true
  validationController?.abort()
  const controller = new AbortController()
  validationController = controller
  validating.value = true
  try {
    const result = await api<{ valid: boolean; message?: string }>(
      '/validate/company?' +
        new URLSearchParams({ creditCode: form.value.creditCode, excludeId: requestId.value }),
      { signal: controller.signal },
    )
    if (!result.valid) errors.value.creditCode = result.message || '该企业已存在备案'
    return result.valid
  } catch (e) {
    if (controller.signal.aborted) return false
    errors.value.creditCode = errorMessage(e)
    return false
  } finally {
    if (!controller.signal.aborted) validating.value = false
  }
}
function blur(key: keyof RequestForm) {
  const current = submissionErrors(form.value)
  if (current[key]) errors.value[key] = current[key]!
  if (key === 'creditCode') void validateCompany()
}
async function save(submit: boolean) {
  if (busy.value) return
  if (submit && uploading.value) {
    ui.toast('请等待附件上传完成后再提交', 'info')
    return
  }
  pageError.value = ''
  errors.value = submit ? submissionErrors(form.value) : {}
  if (submit && Object.keys(errors.value).length) {
    ui.toast('请检查必填项与申请条件', 'error')
    document
      .querySelector('[aria-invalid="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return
  }
  busy.value = true
  try {
    if (submit && !(await validateCompany())) return
    const request = await api<BusinessRequest>(
      requestId.value ? `/requests/${requestId.value}` : '/requests',
      {
        method: requestId.value ? 'PUT' : 'POST',
        body: json({
          form: form.value,
          submit,
          ...(requestId.value ? { version: version.value } : {}),
        }),
      },
    )
    done = true
    clearTimeout(timer)
    await savingLocal
    await removeDraft(draftKey).catch(() => {})
    ui.toast(submit ? '申请已提交，等待审核' : '草稿已保存到工作空间')
    await router.push(`/requests/${request.id}`)
  } catch (e) {
    pageError.value = errorMessage(e)
    if (e instanceof HttpError && e.fields) errors.value = e.fields
  } finally {
    busy.value = false
  }
}
async function recover() {
  if (recovery.value) {
    form.value = recovery.value.form
    savedAt.value = recovery.value.savedAt
    recovery.value = undefined
    ui.toast('已恢复本地草稿')
  }
}
async function discardRecovery() {
  recovery.value = undefined
  await removeDraft(draftKey)
  await persist()
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!done && saveError.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(async () => {
  try {
    if (requestId.value) {
      const result = await api<{ request: BusinessRequest }>(`/requests/${requestId.value}`)
      if (
        result.request.ownerId !== auth.user?.id ||
        !['draft', 'rejected'].includes(result.request.status)
      ) {
        done = true
        await router.replace(`/requests/${requestId.value}`)
        return
      }
      form.value = result.request.form
      version.value = result.request.version
    } else {
      form.value.contact = auth.user!.name
      form.value.department = auth.user!.department
    }
    recovery.value = await readDraft(draftKey).catch(() => undefined)
  } catch (e) {
    pageError.value = errorMessage(e)
  } finally {
    loading.value = false
  }
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeRouteLeave(async () => {
  clearTimeout(timer)
  if (!done) await persist()
  return !saveError.value || window.confirm('本地草稿保存失败，离开后可能丢失修改。是否继续离开？')
})
onUnmounted(() => {
  clearTimeout(timer)
  validationController?.abort()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>
<template>
  <RouterLink :to="requestId ? `/requests/${requestId}` : '/requests'" class="back-link"
    ><ArrowLeft :size="16" />返回{{ requestId ? '申请详情' : '申请列表' }}</RouterLink
  >
  <div class="page-heading">
    <div>
      <div class="eyebrow">CREATE A REQUEST</div>
      <h1>{{ requestId ? '编辑申请' : '新建申请' }}<span class="heading-dot">.</span></h1>
      <p>填写业务信息，开启一段清晰的协作流程。</p>
    </div>
    <span class="draft-indicator" :class="{ 'error-text': saveError }"
      ><component :is="savedAt && !saveError ? Check : Clock3" :size="15" />{{
        saveError
          ? '本地保存失败，请手动保存'
          : savedAt
            ? '草稿已自动保存到本机'
            : '编辑时自动保存草稿'
      }}</span
    >
  </div>
  <div v-if="recovery" class="recovery-banner">
    <RotateCcw :size="19" />
    <div>
      <strong>发现尚未提交的本地草稿</strong
      ><span>保存于 {{ new Date(recovery.savedAt).toLocaleString('zh-CN') }}</span>
    </div>
    <button class="button secondary small" @click="recover">恢复草稿</button
    ><button class="icon-button" aria-label="放弃本地草稿" @click="discardRecovery">
      <X :size="17" />
    </button>
  </div>
  <div v-if="pageError" class="form-alert error" role="alert">{{ pageError }}</div>
  <div v-if="loading" class="loading-state"><span class="spinner" />正在读取申请…</div>
  <form v-else class="editor-layout" novalidate @submit.prevent="save(true)">
    <div class="editor-main">
      <section class="panel form-panel">
        <div class="section-title">
          <span>01</span>
          <div>
            <h2>基本信息</h2>
            <p>为这份申请提供一个清晰的描述</p>
          </div>
        </div>
        <div class="form-field full" :class="{ invalid: errors.title }">
          <label for="request-title">申请标题<span class="required">*</span></label
          ><input
            id="request-title"
            v-model="form.title"
            maxlength="100"
            placeholder="例如：研发团队工作站采购申请"
            :aria-invalid="!!errors.title"
            @input="delete errors.title"
          />
          <p v-if="errors.title" class="field-error">{{ errors.title }}</p>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="category">申请类型<span class="required">*</span></label
            ><select id="category" v-model="form.category">
              <option v-for="c in categories" :key="c">{{ c }}</option>
            </select>
          </div>
          <div class="form-field">
            <label for="department">所属部门<span class="required">*</span></label
            ><select id="department" v-model="form.department">
              <option v-for="d in departments" :key="d">{{ d }}</option>
            </select>
          </div>
          <div class="form-field full">
            <label>优先级</label>
            <div class="priority-options">
              <label :class="{ checked: form.priority === 'normal' }"
                ><input v-model="form.priority" type="radio" value="normal" /><span
                  class="priority-dot normal"
                />常规处理<small>按标准流程推进</small></label
              ><label :class="{ checked: form.priority === 'urgent' }"
                ><input v-model="form.priority" type="radio" value="urgent" /><span
                  class="priority-dot urgent"
                />加急处理<small>需要优先关注</small></label
              >
            </div>
          </div>
        </div>
      </section>
      <section class="panel form-panel">
        <div class="section-title">
          <span>02</span>
          <div>
            <h2>申请主体</h2>
            <p>主体类型决定需要填写的资质信息</p>
          </div>
        </div>
        <SchemaFields
          :fields="applicantFields"
          :model="form"
          :errors="errors"
          :validating="validating"
          @change="update"
          @blur="blur"
        />
      </section>
      <section class="panel form-panel">
        <div class="section-title">
          <span>03</span>
          <div>
            <h2>业务详情</h2>
            <p>补充时间、预算与具体需求</p>
          </div>
        </div>
        <SchemaFields
          :fields="detailFields"
          :model="form"
          :errors="errors"
          @change="update"
          @blur="blur"
        />
      </section>
      <section class="panel form-panel">
        <div class="section-title">
          <span>04</span>
          <div>
            <h2>
              {{
                form.category === '资质备案' && form.applicantType === 'enterprise'
                  ? '营业执照与相关材料'
                  : '相关附件'
              }}
            </h2>
            <p>
              {{
                form.category === '资质备案' && form.applicantType === 'enterprise'
                  ? '企业资质备案必须关联营业执照材料'
                  : '上传报价单、需求文档或其他辅助材料'
              }}
            </p>
          </div>
        </div>
        <AttachmentPicker
          v-model="form.attachmentIds"
          :error="errors.attachmentIds"
          @busy="uploading = $event"
        />
      </section>
      <div class="editor-actions">
        <span><ShieldCheck :size="16" />提交后将进入审核流程</span>
        <div>
          <button type="button" class="button secondary" :disabled="busy" @click="save(false)">
            <Save :size="16" />保存草稿</button
          ><button type="submit" class="button primary" :disabled="busy || validating || uploading">
            <span v-if="busy" class="spinner" /><Send v-else :size="16" />{{
              busy ? '正在保存' : '提交申请'
            }}
          </button>
        </div>
      </div>
    </div>
    <aside class="editor-aside">
      <section class="panel flow-guide">
        <span class="eyebrow">WHAT HAPPENS NEXT</span>
        <h2>申请如何流转？</h2>
        <div class="flow-step active">
          <span>1</span>
          <div>
            <strong>填写并提交</strong>
            <p>完善业务信息与相关材料</p>
          </div>
        </div>
        <div class="flow-step">
          <span>2</span>
          <div>
            <strong>审核员处理</strong>
            <p>通过审核，或退回补充信息</p>
          </div>
        </div>
        <div class="flow-step">
          <span>3</span>
          <div>
            <strong>流程完成</strong>
            <p>结果与处理记录随时可查</p>
          </div>
        </div>
      </section>
      <div class="editor-tip">
        <Info :size="18" />
        <h3>填写小提示</h3>
        <p>清晰的标题和完整的业务说明，能帮助审核员更快理解你的需求。</p>
        <p>预算超过 20,000 元时，请补充预算依据；资质备案会检查信用代码是否重复。</p>
      </div>
      <div class="editor-local-note">
        <FileText :size="17" />
        <p>草稿保存在当前浏览器。点击「保存草稿」后，可在其他设备继续处理。</p>
      </div>
    </aside>
  </form>
</template>
