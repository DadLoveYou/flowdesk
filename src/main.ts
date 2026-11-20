import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useAuth } from './stores/auth'
import type { Permission } from '../shared/domain'
import './styles.css'

const app = createApp(App)
app.use(createPinia())
app.directive('permission', {
  mounted(el: HTMLElement, binding) {
    if (!useAuth().can(binding.value as Permission)) el.remove()
  },
  updated(el: HTMLElement, binding) {
    if (!useAuth().can(binding.value as Permission)) el.remove()
  },
})
app.use(router)
app.mount('#app')
