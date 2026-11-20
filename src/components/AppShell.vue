<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Bell, ChevronDown, ArrowUpRight, LogOut, Menu, X, ShieldCheck, Sparkles } from 'lucide-vue-next'
import Icon from './Icon.vue'
import { navigation, syncRoutes } from '@/router'
import { useAuth } from '@/stores/auth'
import { roleLabels } from '../../shared/domain'
import { api, errorMessage } from '@/lib/api'
import { useUI } from '@/stores/ui'
const auth = useAuth(), route = useRoute(), router = useRouter(), ui = useUI()
const mobileOpen = ref(false), menuOpen = ref(false), search = ref(''), pending = ref(0)
const items = computed(() => navigation.filter(n => auth.can(n.permission)))
const active = (path: string) => path === '/' ? route.path === '/' : route.path.startsWith(path)
function doSearch() { if (search.value.trim()) { void router.push({ path: '/requests', query: { q: search.value.trim() } }); search.value = '' } }
async function logout() { try { await auth.logout(); syncRoutes(); await router.replace('/login') } catch (e) { ui.toast(errorMessage(e), 'error') } }
async function refresh() { try { pending.value = (await api<{ stats: { pending: number } }>('/dashboard')).stats.pending } catch { /* pages show network errors */ } }
function closeMenu(event: MouseEvent) { if (!(event.target as HTMLElement).closest('.user-menu')) menuOpen.value = false }
let interval: ReturnType<typeof setInterval>
onMounted(() => { void refresh(); interval = setInterval(refresh, 30000); document.addEventListener('click', closeMenu); window.addEventListener('business-updated', refresh) })
onUnmounted(() => { clearInterval(interval); document.removeEventListener('click', closeMenu); window.removeEventListener('business-updated', refresh) })
</script>
<template>
  <div class="app-shell">
    <div v-if="mobileOpen" class="sidebar-scrim" @click="mobileOpen = false" />
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <RouterLink to="/" class="brand"><span class="brand-mark">F</span><span>FlowDesk<small>企业流程工作台</small></span></RouterLink>
      <button class="sidebar-close icon-button" aria-label="关闭导航" @click="mobileOpen = false"><X :size="20" /></button>
      <div class="workspace-switch"><span class="workspace-avatar">青</span><div><strong>青禾科技</strong><small>企业协作空间</small></div><ShieldCheck :size="16" /></div>
      <div class="nav-caption">工作空间 <span>WORKSPACE</span></div>
      <nav aria-label="主导航"><RouterLink v-for="item in items" :key="item.path" :to="item.path" class="nav-item" :class="{ active: active(item.path) }" @click="mobileOpen = false"><Icon :name="item.icon" /><span>{{ item.label }}</span><span v-if="item.path === '/reviews' && pending" class="nav-count">{{ pending }}</span></RouterLink></nav>
      <div class="sidebar-bottom"><div class="sidebar-note"><Sparkles :size="19" /><strong>让每一步协作，都有迹可循。</strong><p>从申请到审核，保持团队步调一致。</p><RouterLink to="/requests">查看业务申请 <ArrowUpRight :size="14" /></RouterLink></div><div class="sidebar-footer"><span class="live-dot" />工作空间运行中<span>v1.0</span></div></div>
    </aside>
    <div class="main-wrap">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" aria-label="打开导航" @click="mobileOpen = true"><Menu :size="21" /></button><span>工作空间</span><span class="breadcrumb-slash">/</span><strong>{{ route.meta.title }}</strong></div><div class="topbar-actions"><form class="global-search" @submit.prevent="doSearch"><Search :size="16" /><input v-model="search" aria-label="搜索申请" placeholder="搜索申请、编号…" /><span>↵</span></form><button class="notification-button icon-button" :aria-label="`查看${pending}条待审核申请`" @click="router.push(auth.can('request:review') ? '/reviews' : '/requests?status=pending')"><Bell :size="19" /><i v-if="pending" /></button><div class="topbar-divider" /><div class="user-menu"><button class="user-trigger" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><span class="avatar">{{ auth.user?.name.slice(-2) }}</span><div><strong>{{ auth.user?.name }}</strong><small>{{ roleLabels[auth.user!.role] }}</small></div><ChevronDown :size="14" /></button><div v-if="menuOpen" class="user-dropdown"><strong>{{ auth.user?.department }}</strong><small>@{{ auth.user?.username }}</small><button @click="logout"><LogOut :size="16" />退出登录</button></div></div></div></header>
      <main id="main-content" class="page-content"><slot /></main>
      <footer class="page-footer"><span>FlowDesk · 让流程更清晰，让协作更轻松。</span><span>企业协作工作台</span></footer>
    </div>
  </div>
</template>
