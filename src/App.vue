<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-vue-next'
import AppShell from '@/components/AppShell.vue'
import { useUI } from '@/stores/ui'
import { useAuth } from '@/stores/auth'
import { useUploads } from '@/stores/uploads'
import { router, syncRoutes } from '@/router'
const route = useRoute(), ui = useUI(), auth = useAuth()
function expired() { useUploads().stopAll(); auth.user = null; syncRoutes(); ui.toast('登录已过期，请重新登录', 'info'); void router.replace('/login') }
onMounted(() => window.addEventListener('session-expired', expired))
onUnmounted(() => window.removeEventListener('session-expired', expired))
</script>
<template>
  <RouterView v-if="route.name === 'login'" />
  <AppShell v-else-if="auth.user"><RouterView :key="route.path" /></AppShell>
  <div v-else class="boot-screen"><span class="spinner" />正在打开工作台…</div>
  <div class="toast-stack" aria-live="polite" aria-atomic="true">
    <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="toast.type"><component :is="toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Info" :size="18" /><span>{{ toast.text }}</span><button aria-label="关闭提示" @click="ui.toasts = ui.toasts.filter(t => t.id !== toast.id)"><X :size="15" /></button></div>
  </div>
</template>
