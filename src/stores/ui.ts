import { defineStore } from 'pinia'
import { ref } from 'vue'
export const useUI = defineStore('ui', () => {
  const toasts = ref<{ id: number; text: string; type: 'success' | 'error' | 'info' }[]>([])
  let next = 0
  function toast(text: string, type: 'success' | 'error' | 'info' = 'success') {
    const id = ++next; toasts.value.push({ id, text, type })
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 4500)
  }
  return { toasts, toast }
})
