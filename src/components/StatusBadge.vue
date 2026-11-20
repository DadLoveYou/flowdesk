<script setup lang="ts">
import { statusLabels, type RequestStatus } from '../../shared/domain'
defineProps<{ status: RequestStatus }>()
</script>
<template>
  <span class="status-badge" :class="status"><i />{{ statusLabels[status] }}</span>
</template>
