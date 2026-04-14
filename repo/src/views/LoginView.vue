<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const ui = useUIStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const isLockScreen = computed(() => route.query.locked === '1' && auth.isLocked)

async function handleLogin() {
  error.value = ''
  if (!isLockScreen.value && !username.value.trim()) {
    error.value = 'Username and password are required.'
    return
  }
  if (!password.value) {
    error.value = isLockScreen.value ? 'Password is required.' : 'Username and password are required.'
    return
  }
  loading.value = true
  try {
    if (isLockScreen.value) {
      await auth.unlock(password.value)
      ui.showToast('Session unlocked.', 'success')
    } else {
      await auth.login(username.value, password.value)
      ui.showToast('Logged in successfully.', 'success')
    }
    router.push('/')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="card auth-card">
      <h1>{{ isLockScreen ? 'Session Locked' : 'Sign In' }}</h1>
      <p class="subtitle">
        {{ isLockScreen ? 'Enter your password to unlock' : 'FlowForge SOP Canvas' }}
      </p>

      <form @submit.prevent="handleLogin">
        <div v-if="!isLockScreen" class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="Enter username"
          />
        </div>

        <div v-if="isLockScreen" class="form-group">
          <label>Locked as</label>
          <input type="text" :value="auth.username" disabled />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="Enter password"
          />
        </div>

        <p v-if="error" class="form-error" style="margin-bottom: 12px">{{ error }}</p>

        <button type="submit" class="btn btn-primary btn-lg" style="width: 100%" :disabled="loading">
          {{ loading ? 'Please wait...' : isLockScreen ? 'Unlock' : 'Sign In' }}
        </button>
      </form>

      <div v-if="!isLockScreen" class="footer-link">
        Don't have an account? <router-link to="/register">Create one</router-link>
      </div>
      <div v-if="isLockScreen" class="footer-link">
        <a href="#" @click.prevent="auth.logout(); router.push('/login')">Sign out instead</a>
      </div>
    </div>
  </div>
</template>
