<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { UploadCloud, Upload, FileText, Download, Search, FolderOpen, HardDrive, RefreshCw, Play, ShieldCheck } from 'lucide-vue-next'
import { useUploads } from '@/stores/uploads'
import { useAuth } from '@/stores/auth'
import { useUI } from '@/stores/ui'
import { api, fileSize, dateTime, errorMessage } from '@/lib/api'
import type { StoredFile } from '../../shared/domain'
import UploadQueue from '@/components/UploadQueue.vue'
import EmptyState from '@/components/EmptyState.vue'
import Pagination from '@/components/Pagination.vue'
const uploads = useUploads(), auth = useAuth(), ui = useUI()
const files = ref<StoredFile[]>([]), input = ref<HTMLInputElement>(), dragging = ref(false), q = ref(''), page = ref(1), loading = ref(false), error = ref('')
const filtered = computed(() => files.value.filter(f => f.name.toLowerCase().includes(q.value.toLowerCase())))
const complete = computed(() => files.value.filter(f => f.state === 'complete'))
const totalSize = computed(() => complete.value.reduce((sum, f) => sum + f.size, 0))
async function load() { loading.value = true; error.value = ''; try { files.value = await api<StoredFile[]>('/files') } catch (e) { error.value = errorMessage(e) } finally { loading.value = false } }
function addFiles(list: FileList | File[]) { for (const file of Array.from(list)) { try { uploads.add(file) } catch (e) { ui.toast(errorMessage(e), 'error') } } }
function pick(event: Event) { const target = event.target as HTMLInputElement; if (target.files) addFiles(target.files); target.value = '' }
function drop(event: DragEvent) { dragging.value = false; if (event.dataTransfer?.files) addFiles(event.dataTransfer.files) }
function resumeFile() { ui.toast('请选择同一份原文件，系统将校验并接续已有进度', 'info'); input.value?.click() }
watch(q, () => { page.value = 1 })
watch(() => uploads.tasks.filter(t => t.state === 'complete').length, load)
onMounted(load)
</script>
<template>
  <div class="page-heading"><div><div class="eyebrow">FILE WORKSPACE</div><h1>文件中心<span class="heading-dot">.</span></h1><p>把业务材料放在一起，随时上传，安心续传。</p></div><button class="button primary" @click="input?.click()"><Upload :size="17" />上传文件</button></div><input ref="input" type="file" multiple class="sr-only" aria-label="选择上传文件" @change="pick" />
  <div class="file-summary"><div class="panel"><span class="stat-icon mint"><FolderOpen :size="19" /></span><div><small>已上传文件</small><strong>{{ complete.length }} <span>份</span></strong></div></div><div class="panel"><span class="stat-icon blue"><HardDrive :size="19" /></span><div><small>已用存储空间</small><strong>{{ totalSize ? fileSize(totalSize) : '0 KB' }}</strong></div></div><div class="panel"><span class="stat-icon amber"><ShieldCheck :size="19" /></span><div><small>文件传输保障</small><strong class="file-guarantee">断点续传 · 完整性校验</strong></div></div></div>
  <button class="file-dropzone" :class="{ dragging }" @click="input?.click()" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop"><span class="upload-cloud-icon"><UploadCloud :size="32" :stroke-width="1.5" /></span><div><h2>拖拽文件到这里，或<span>点击上传</span></h2><p>单个文件最大 200 MB · 支持大文件分片、暂停与续传</p></div><span class="dropzone-tip">资料在手，协作无忧。</span></button>
  <section v-if="uploads.tasks.length" class="panel queue-panel"><div class="panel-heading"><h2>传输任务 <span class="number-badge">{{ uploads.tasks.length }}</span></h2><button class="text-button" @click="uploads.clearCompleted">清除已完成</button></div><UploadQueue /></section>
  <section class="panel files-panel"><div class="panel-heading"><div><h2>全部文件</h2><p>{{ auth.can('request:all') ? '工作空间内的业务附件' : '我上传的业务附件' }}</p></div><div class="inline-actions"><div class="search-input"><Search :size="16" /><input v-model="q" aria-label="搜索文件" placeholder="搜索文件名称" /></div><button class="icon-button bordered" aria-label="刷新文件列表" @click="load"><RefreshCw :size="17" :class="{ spinning: loading }" /></button></div></div><div v-if="error" class="form-alert error">{{ error }}<button class="text-button" @click="load">重试</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>文件名称</th><th>文件大小</th><th>上传人</th><th>上传时间</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="file in filtered.slice((page - 1) * 8, page * 8)" :key="file.id"><td><span class="request-title"><span class="document-icon"><FileText :size="19" /></span><strong class="filename">{{ file.name }}</strong></span></td><td class="muted nowrap">{{ fileSize(file.size) }}</td><td><span class="person-inline"><span class="avatar tiny">{{ file.ownerName?.slice(-1) }}</span>{{ file.ownerName }}</span></td><td class="muted nowrap">{{ dateTime(file.createdAt) }}</td><td><span class="status-badge" :class="file.state === 'complete' ? 'approved' : 'pending'"><i />{{ file.state === 'complete' ? '已完成' : `已传 ${file.chunks.length}/${file.totalChunks}` }}</span></td><td><a v-if="file.state === 'complete'" class="table-action" :href="`/api/files/${file.id}/download`"><Download :size="14" />下载</a><button v-else-if="file.ownerId === auth.user?.id" class="table-action" @click="resumeFile"><Play :size="14" />继续上传</button><span v-else class="muted">上传中</span></td></tr></tbody></table></div><div v-if="loading && !files.length" class="loading-state"><span class="spinner" />正在加载文件…</div><EmptyState v-else-if="!filtered.length" title="还没有文件记录" description="上传第一份文件，或尝试其他搜索条件。" /><Pagination :page="page" :total="filtered.length" :page-size="8" @change="page = $event" /></section><div class="scope-note"><span class="live-dot" />刷新后选择相同原文件，系统会接续服务端保存的分片进度。<span>文件访问受角色权限控制</span></div>
</template>
