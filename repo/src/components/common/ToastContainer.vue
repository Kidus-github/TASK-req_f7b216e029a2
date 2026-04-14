<script setup>
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()
</script>

<template>
  <div class="toast-container">
    <div
      v-for="toast in ui.toasts"
      :key="toast.id"
      :class="['toast', `toast-${toast.type}`]"
      @click="ui.dismissToast(toast.id)"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
