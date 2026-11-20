<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
</script>
<template><div class="not-found"><span>404</span><h1>这个页面暂时无法访问</h1><p>页面可能不存在，或当前角色没有访问权限。</p><RouterLink class="button primary" to="/"><ArrowLeft :size="17" />返回工作台</RouterLink></div></template>
