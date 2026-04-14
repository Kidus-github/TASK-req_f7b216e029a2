<script setup>
import { watch } from 'vue'
import { usePreferencesStore } from '@/stores/preferences'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import ToastContainer from '@/components/common/ToastContainer.vue'

const prefs = usePreferencesStore()
const auth = useAuthStore()
const ui = useUIStore()

watch(
  () => prefs.theme,
  (t) => {
    document.documentElement.setAttribute('data-theme', t)
  },
  { immediate: true }
)

// Reset inactivity timer on user interaction
function onActivity() {
  if (auth.isAuthenticated) {
    auth.resetInactivityTimer()
  }
}
</script>

<template>
  <div class="app-layout" @mousemove="onActivity" @keydown="onActivity" @click="onActivity">
    <AppTopbar v-if="auth.isAuthenticated" />
    <main class="app-content">
      <router-view />
    </main>
    <ToastContainer />
  </div>
</template>
