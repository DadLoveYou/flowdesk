import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import { api, json, errorMessage, HttpError } from '@/lib/api'
import type { StoredFile } from '../../shared/domain'
export interface UploadTask { key: string; file: File; name: string; size: number; state: 'queued' | 'hashing' | 'uploading' | 'paused' | 'merging' | 'complete' | 'error'; progress: number; hashProgress: number; stored?: StoredFile; error?: string; instant: boolean; controller?: AbortController }
const CHUNK_SIZE = 2 * 1024 * 1024
export const useUploads = defineStore('uploads', () => {
  const tasks = ref<UploadTask[]>([])
  let active = false
  function schedule() {
    if (active) return
    const task = tasks.value.find(t => t.state === 'queued')
    if (!task) return
    active = true; void run(task).finally(() => { active = false; schedule() })
  }
  function add(file: File): string {
    if (!file.size || file.size > 200 * 1024 * 1024) throw new Error('请选择 1 字节至 200 MB 的文件')
    const task: UploadTask = { key: crypto.randomUUID(), file: markRaw(file), name: file.name, size: file.size, state: 'queued', progress: 0, hashProgress: 0, instant: false }
    tasks.value.unshift(task)
    schedule()
    return task.key
  }
  async function hashFile(task: UploadTask) {
    return new Promise<string>((resolve, reject) => {
      const worker = new Worker(new URL('../workers/hash.worker.ts', import.meta.url), { type: 'module' })
      const stop = () => { worker.terminate(); reject(new Error('文件校验已取消')) }
      const cleanup = () => { worker.terminate(); task.controller?.signal.removeEventListener('abort', stop) }
      task.controller?.signal.addEventListener('abort', stop, { once: true })
      worker.onmessage = event => {
        if (event.data.progress !== undefined) task.hashProgress = event.data.progress
        if (event.data.hash) { cleanup(); resolve(event.data.hash) }
        if (event.data.error) { cleanup(); reject(new Error(event.data.error)) }
      }
      worker.onerror = () => { cleanup(); reject(new Error('文件校验失败，请重新选择文件')) }
      worker.postMessage(task.file)
    })
  }
  async function run(task: UploadTask) {
    const controller = markRaw(new AbortController()); task.controller = controller; task.error = undefined
    try {
      if (!task.stored) {
        task.state = 'hashing'; const hash = await hashFile(task)
        if (controller.signal.aborted) return
        task.stored = await api<StoredFile>('/uploads/init', { method: 'POST', body: json({ name: task.name, size: task.size, hash }), signal: controller.signal })
      }
      if (task.stored.state === 'complete') { task.instant = true; task.progress = 1; task.state = 'complete'; return }
      task.state = 'uploading'
      // Re-initialize on resume to get the server's authoritative chunk checkpoint.
      task.stored = await api<StoredFile>('/uploads/init', { method: 'POST', body: json({ name: task.name, size: task.size, hash: task.stored.hash }), signal: controller.signal })
      const done = new Set(task.stored.chunks)
      const byteCount = () => [...done].reduce((sum, i) => sum + Math.min(CHUNK_SIZE, task.size - i * CHUNK_SIZE), 0)
      task.progress = byteCount() / task.size
      const missing = Array.from({ length: task.stored.totalChunks }, (_, i) => i).filter(i => !done.has(i)); let cursor = 0
      async function sendChunk(index: number) {
        for (let retry = 0; retry < 3; retry++) {
          try {
            const body = new FormData(); body.append('chunk', task.file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE), 'chunk')
            await api(`/uploads/${task.stored!.id}/chunks/${index}`, { method: 'POST', body, signal: controller.signal }); return
          } catch (error) {
            if (controller.signal.aborted || error instanceof HttpError && error.status < 500 || retry === 2) throw error
            await new Promise(resolve => setTimeout(resolve, 400 * 2 ** retry))
          }
        }
      }
      async function worker() {
        while (cursor < missing.length && !controller.signal.aborted) { const index = missing[cursor++]!; await sendChunk(index); done.add(index); task.progress = byteCount() / task.size }
      }
      await Promise.all(Array.from({ length: Math.min(3, missing.length) }, worker))
      if (controller.signal.aborted) return
      task.state = 'merging'
      task.stored = await api<StoredFile>(`/uploads/${task.stored.id}/complete`, { method: 'POST', signal: controller.signal })
      task.state = 'complete'; task.progress = 1
    } catch (error) {
      if (!controller.signal.aborted) { task.error = errorMessage(error); task.state = 'error'; controller.abort() }
    }
  }
  function pause(key: string) { const task = tasks.value.find(t => t.key === key); if (task?.state === 'uploading') { task.state = 'paused'; task.controller?.abort() } }
  function resume(key: string) { const task = tasks.value.find(t => t.key === key); if (task && ['paused', 'error'].includes(task.state)) { task.state = 'queued'; schedule() } }
  function clearCompleted() { tasks.value = tasks.value.filter(t => t.state !== 'complete') }
  function stopAll() { tasks.value.forEach(t => { if (['uploading', 'hashing'].includes(t.state)) { t.controller?.abort(); t.state = 'paused' } }); tasks.value = [] }
  return { tasks, add, pause, resume, clearCompleted, stopAll }
})
