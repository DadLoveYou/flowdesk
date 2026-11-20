<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowRight, Check, ShieldCheck, Eye, EyeOff, ArrowUpRight } from 'lucide-vue-next'
import { useAuth } from '@/stores/auth'
import { api, errorMessage } from '@/lib/api'
import { syncRoutes } from '@/router'
const auth = useAuth(), router = useRouter(), route = useRoute()
const username = ref(''), password = ref(''), busy = ref(false), error = ref(''), showPassword = ref(false), demo = ref(false)
onMounted(async () => { try { demo.value = (await api<{ demo: boolean }>('/health')).demo } catch { error.value = '无法连接服务，请确认后端已启动' } })
async function login(account?: string) {
  if (busy.value) return
  if (account) { username.value = account; password.value = 'Demo@123456' }
  error.value = ''; busy.value = true
  try { await auth.login(username.value, password.value); syncRoutes(); const redirect = String(route.query.redirect || '/'); await router.replace(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/') } catch (e) { error.value = errorMessage(e) } finally { busy.value = false }
}
</script>
<template>
  <div class="login-page"><section class="login-story"><a class="brand" href="/login"><span class="brand-mark">F</span><span>FlowDesk<small>企业流程工作台</small></span></a><div class="login-story-content"><div class="eyebrow light"><span />为高效团队而设计</div><h1>把复杂流程，<br />变成清晰的<span>下一步。</span></h1><p>申请、审核、文件与权限，在一个工作空间内顺畅协作。让团队专注于真正重要的事。</p><div class="login-mini-card"><div class="mini-card-header"><span class="mini-icon"><Check :size="18" /></span><div><strong>研发团队工作站采购</strong><small>采购申请 · 产品研发部</small></div><span class="mini-badge">已通过</span></div><div class="mini-progress"><span>提交申请</span><i /><span>部门审核</span><i /><span>流程完成</span></div><div class="mini-card-footer"><span class="avatar small">予安</span><span>陈予安已完成审核</span><ArrowUpRight :size="15" /></div></div><div class="story-features"><span><ShieldCheck :size="17" />角色权限控制</span><span><Check :size="17" />完整操作记录</span></div></div><div class="login-story-footer">FLOWDESK WORKSPACE<span>让每一步协作，都有迹可循。</span></div></section><section class="login-form-side"><div class="login-form-wrap"><span class="login-welcome">WELCOME BACK</span><h2>欢迎回到工作台</h2><p>登录你的账号，继续今天的协作。</p><form @submit.prevent="login()"><label for="username">账号</label><input id="username" v-model="username" autocomplete="username" placeholder="请输入账号" required /><label for="password">密码</label><div class="password-input"><input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入密码" required /><button type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><component :is="showPassword ? EyeOff : Eye" :size="18" /></button></div><div v-if="error" class="form-alert error" role="alert">{{ error }}</div><button class="button primary login-submit" :disabled="busy" type="submit"><span v-if="busy" class="spinner" />{{ busy ? '正在登录' : '进入工作台' }}<ArrowRight v-if="!busy" :size="18" /></button></form><div v-if="demo" class="demo-accounts"><div class="demo-title"><span />快速体验不同角色<span /></div><div class="demo-buttons"><button :disabled="busy" @click="login('admin')"><strong>管理员</strong><small>全部功能</small></button><button :disabled="busy" @click="login('reviewer')"><strong>审核员</strong><small>审核与查看</small></button><button :disabled="busy" @click="login('operator')"><strong>业务专员</strong><small>申请与上传</small></button></div><p>演示账号共用密码：<code>Demo@123456</code></p></div><div class="login-trust"><ShieldCheck :size="15" />会话由服务端安全管理</div></div><div class="login-bottom">FlowDesk © {{ new Date().getFullYear() }}</div></section></div>
</template>
