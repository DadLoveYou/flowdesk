import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, json } from '@/lib/api'
import type { User, Permission } from '../../shared/domain'
import { useUploads } from './uploads'

export const useAuth = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const ready = ref(false)
  const permissions = computed(() => user.value?.permissions || [])
  const can = (permission: Permission) => permissions.value.includes(permission)
  async function restore() { try { user.value = await api<User>('/auth/me') } catch { user.value = null } finally { ready.value = true } }
  async function login(username: string, password: string) { user.value = await api<User>('/auth/login', { method: 'POST', body: json({ username, password }) }); ready.value = true }
  async function logout() { useUploads().stopAll(); try { await api('/auth/logout', { method: 'POST' }) } finally { user.value = null } }
  return { user, ready, can, permissions, restore, login, logout }
})
