<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { validateUsername, validatePassword, validateRealName, validateOrganization } from '@/utils/validation'

const router = useRouter()
const auth = useAuthStore()
const ui = useUIStore()

const form = ref({
  username: '',
  password: '',
  confirmPassword: '',
  realName: '',
  organization: '',
})
const errors = ref({})
const loading = ref(false)
const serverError = ref('')

function validate() {
  const e = {}
  const ue = validateUsername(form.value.username)
  if (ue) e.username = ue
  const pe = validatePassword(form.value.password)
  if (pe) e.password = pe
  if (form.value.password !== form.value.confirmPassword) {
    e.confirmPassword = 'Passwords do not match.'
  }
  const rn = validateRealName(form.value.realName)
  if (rn) e.realName = rn
  const oe = validateOrganization(form.value.organization)
  if (oe) e.organization = oe
  errors.value = e
  return Object.keys(e).length === 0
}

async function handleRegister() {
  serverError.value = ''
  if (!validate()) return

  loading.value = true
  try {
    await auth.register({
      username: form.value.username,
      password: form.value.password,
      realName: form.value.realName || null,
      organization: form.value.organization || null,
    })
    ui.showToast('Account created! Please sign in.', 'success')
    router.push('/login')
  } catch (e) {
    serverError.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="card auth-card">
      <h1>Create Account</h1>
      <p class="subtitle">Set up your local FlowForge account</p>

      <form @submit.prevent="handleRegister">
        <div class="form-group">
          <label for="reg-username">Username *</label>
          <input id="reg-username" v-model="form.username" type="text" placeholder="3-50 characters" />
          <p v-if="errors.username" class="form-error">{{ errors.username }}</p>
        </div>

        <div class="form-group">
          <label for="reg-password">Password *</label>
          <input id="reg-password" v-model="form.password" type="password" placeholder="Min 8 characters" />
          <p v-if="errors.password" class="form-error">{{ errors.password }}</p>
        </div>

        <div class="form-group">
          <label for="reg-confirm">Confirm Password *</label>
          <input id="reg-confirm" v-model="form.confirmPassword" type="password" placeholder="Repeat password" />
          <p v-if="errors.confirmPassword" class="form-error">{{ errors.confirmPassword }}</p>
        </div>

        <div class="form-group">
          <label for="reg-realname">Real Name</label>
          <input id="reg-realname" v-model="form.realName" type="text" placeholder="Optional" />
          <p v-if="errors.realName" class="form-error">{{ errors.realName }}</p>
        </div>

        <div class="form-group">
          <label for="reg-org">Organization</label>
          <input id="reg-org" v-model="form.organization" type="text" placeholder="Optional" />
          <p v-if="errors.organization" class="form-error">{{ errors.organization }}</p>
        </div>

        <p v-if="serverError" class="form-error" style="margin-bottom: 12px">{{ serverError }}</p>

        <button type="submit" class="btn btn-primary btn-lg" style="width: 100%" :disabled="loading">
          {{ loading ? 'Creating...' : 'Create Account' }}
        </button>
      </form>

      <div class="footer-link">
        Already have an account? <router-link to="/login">Sign in</router-link>
      </div>
    </div>
  </div>
</template>
