<script setup lang="ts">
import { LayoutDashboard, Files, ClipboardCheck, FolderOpen, Users, History } from 'lucide-vue-next'
defineProps<{ name: string; size?: number }>()
const icons: Record<string, unknown> = {
  LayoutDashboard,
  Files,
  ClipboardCheck,
  FolderOpen,
  Users,
  History,
}
</script>
<template><component :is="icons[name]" :size="size || 19" :stroke-width="1.8" /></template>
