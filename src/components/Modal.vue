<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>(), previous = document.activeElement as HTMLElement | null
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  if (event.key === 'Tab') {
    const elements = panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')
    if (!elements?.length) return
    const first = elements[0]!, last = elements[elements.length - 1]!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
}
onMounted(() => { document.addEventListener('keydown', key); panel.value?.focus(); document.body.style.overflow = 'hidden' })
onUnmounted(() => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; previous?.focus() })
</script>
<template><Teleport to="body"><div class="modal-backdrop" @mousedown.self="emit('close')"><section ref="panel" class="modal" :class="{ wide }" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><header><h2 id="modal-title">{{ title }}</h2><button class="icon-button" aria-label="关闭窗口" @click="emit('close')"><X :size="20" /></button></header><div class="modal-body"><slot /></div><footer v-if="$slots.footer"><slot name="footer" /></footer></section></div></Teleport></template>
