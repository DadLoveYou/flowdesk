<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
defineProps<{ page: number; total: number; pageSize: number }>()
const emit = defineEmits<{ change: [page: number] }>()
</script>
<template><div class="pagination"><span>共 {{ total }} 条记录</span><div><button class="icon-button" :disabled="page <= 1" aria-label="上一页" @click="emit('change', page - 1)"><ChevronLeft :size="17" /></button><span>{{ page }} / {{ Math.max(1, Math.ceil(total / pageSize)) }}</span><button class="icon-button" :disabled="page * pageSize >= total" aria-label="下一页" @click="emit('change', page + 1)"><ChevronRight :size="17" /></button></div></div></template>
