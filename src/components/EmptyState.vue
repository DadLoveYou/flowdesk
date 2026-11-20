<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: '暂时没有记录',
  description: '新的记录会出现在这里。',
})
</script>
<template>
  <div class="empty-state">
    <div class="empty-icon"><Inbox :size="26" /></div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
