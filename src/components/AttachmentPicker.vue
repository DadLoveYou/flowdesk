<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { UploadCloud, Paperclip, X, FileText, Check } from 'lucide-vue-next'
import { useUploads } from '@/stores/uploads'
import { useAuth } from '@/stores/auth'
import { useUI } from '@/stores/ui'
import { api, fileSize, errorMessage } from '@/lib/api'
import type { StoredFile } from '../../shared/domain'
import UploadQueue from './UploadQueue.vue'
import Modal from './Modal.vue'
const props = defineProps<{ modelValue: string[]; error?: string }>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]]; busy: [active: boolean] }>()
const uploads = useUploads(),
  auth = useAuth(),
  ui = useUI()
const files = ref<StoredFile[]>([]),
  keys = ref<string[]>([]),
  libraryOpen = ref(false),
  dragging = ref(false),
  input = ref<HTMLInputElement>(),
  libraryError = ref('')
const selected = computed(() => files.value.filter((f) => props.modelValue.includes(f.id)))
const processed = new Set<string>()
watch(
  () =>
    keys.value.some((key) => uploads.tasks.some((t) => t.key === key && t.state !== 'complete')),
  (active) => emit('busy', active),
  { immediate: true },
)
async function load() {
  try {
    files.value = (await api<StoredFile[]>('/files')).filter(
      (f) => f.ownerId === auth.user?.id && f.state === 'complete',
    )
    libraryError.value = ''
  } catch (e) {
    libraryError.value = errorMessage(e)
  }
}
function addFileList(list: FileList | File[]) {
  for (const file of Array.from(list)) {
    if (
      props.modelValue.length +
        keys.value.filter((k) => uploads.tasks.find((t) => t.key === k)?.state !== 'complete')
          .length >=
      10
    ) {
      ui.toast('每份申请最多关联 10 个附件', 'error')
      break
    }
    try {
      keys.value.push(uploads.add(file))
    } catch (e) {
      ui.toast(errorMessage(e), 'error')
    }
  }
}
function pick(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) addFileList(target.files)
  target.value = ''
}
function drop(event: DragEvent) {
  dragging.value = false
  if (event.dataTransfer?.files) addFileList(event.dataTransfer.files)
}
function toggle(id: string) {
  if (props.modelValue.includes(id))
    emit(
      'update:modelValue',
      props.modelValue.filter((v) => v !== id),
    )
  else if (props.modelValue.length < 10) emit('update:modelValue', [...props.modelValue, id])
  else ui.toast('最多关联 10 个附件', 'error')
}
watch(
  () => uploads.tasks.map((t) => [t.key, t.state]),
  () => {
    const completed = uploads.tasks.filter(
      (t) =>
        keys.value.includes(t.key) && !processed.has(t.key) && t.state === 'complete' && t.stored,
    )
    if (!completed.length) return
    const ids = [...new Set([...props.modelValue, ...completed.map((t) => t.stored!.id)])].slice(
      0,
      10,
    )
    for (const task of completed) {
      processed.add(task.key)
      if (!files.value.some((f) => f.id === task.stored!.id)) files.value.push(task.stored!)
    }
    if (ids.join() !== props.modelValue.join()) emit('update:modelValue', ids)
  },
)
onMounted(load)
</script>
<template>
  <div class="attachment-picker">
    <input
      ref="input"
      class="sr-only"
      type="file"
      multiple
      aria-label="上传申请附件"
      @change="pick"
    /><button
      type="button"
      class="attachment-drop"
      :class="{ dragging }"
      @click="input?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="drop"
    >
      <UploadCloud :size="25" /><strong>点击上传，或拖拽文件到这里</strong
      ><span>单个文件不超过 200 MB，支持暂停与续传</span>
    </button>
    <div class="attachment-library">
      <span>最多关联 10 个附件</span
      ><button
        type="button"
        class="text-button"
        @click="
          libraryOpen = true
          load()
        "
      >
        <Paperclip :size="14" />从文件中心选择
      </button>
    </div>
    <UploadQueue v-if="keys.length" :keys="keys" />
    <div v-for="file in selected" :key="file.id" class="selected-file">
      <FileText :size="17" /><a :href="`/api/files/${file.id}/download`">{{ file.name }}</a
      ><small>{{ fileSize(file.size) }}</small
      ><button
        type="button"
        class="icon-button"
        :aria-label="`移除附件${file.name}`"
        @click="toggle(file.id)"
      >
        <X :size="15" />
      </button>
    </div>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <Modal v-if="libraryOpen" title="选择已有文件" @close="libraryOpen = false"
      ><div v-if="libraryError" class="form-alert error">{{ libraryError }}</div>
      <p class="muted">选择本人已上传完成的文件。</p>
      <div class="file-library">
        <button
          v-for="file in files"
          :key="file.id"
          type="button"
          :class="{ selected: modelValue.includes(file.id) }"
          @click="toggle(file.id)"
        >
          <FileText :size="19" />
          <div>
            <strong>{{ file.name }}</strong
            ><small>{{ fileSize(file.size) }}</small>
          </div>
          <Check v-if="modelValue.includes(file.id)" :size="17" />
        </button>
        <p v-if="!files.length" class="muted">尚无可选择的文件，请先上传。</p>
      </div>
      <template #footer
        ><button type="button" class="button primary" @click="libraryOpen = false">
          完成选择
        </button></template
      ></Modal
    >
  </div>
</template>
