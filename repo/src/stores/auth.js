import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/authService'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const session = ref(null)
  const encryptionKey = ref(null)
  const isLocked = ref(false)
  let inactivityTimer = null

  const isAuthenticated = computed(() => !!user.value && !!session.value && !isLocked.value)
  const userId = computed(() => user.value?.userId || null)
  const username = computed(() => user.value?.username || '')
  const displayName = computed(() => user.value?.maskedDisplayName || '')
  const isRiskTagged = computed(() => user.value?.isRiskTagged || false)

  async function login(usernameVal, password) {
    const result = await authService.login(usernameVal, password)
    user.value = result.user
    session.value = result.session
    encryptionKey.value = result.encryptionKey
    isLocked.value = false
    startInactivityTimer()
    return result
  }

  async function register({ username: u, password, realName, organization }) {
    return authService.createUser({ username: u, password, realName, organization })
  }

  async function logout() {
    stopInactivityTimer()
    if (session.value) {
      await authService.logout(session.value.sessionId, user.value?.userId)
    }
    purge()
  }

  async function lock() {
    stopInactivityTimer()
    if (session.value) {
      await authService.lockSession(session.value.sessionId)
    }
    encryptionKey.value = null
    isLocked.value = true
  }

  async function unlock(password) {
    if (!session.value || !user.value) throw new Error('No session to unlock.')
    const result = await authService.unlockSession(
      session.value.sessionId,
      user.value.userId,
      password
    )
    session.value = result.session
    encryptionKey.value = result.encryptionKey
    isLocked.value = false
    startInactivityTimer()
  }

  function purge() {
    user.value = null
    session.value = null
    encryptionKey.value = null
    isLocked.value = false
  }

  function resetInactivityTimer() {
    if (!isAuthenticated.value) return
    stopInactivityTimer()
    startInactivityTimer()
    if (session.value) {
      authService.touchSession(session.value.sessionId)
    }
  }

  function startInactivityTimer() {
    stopInactivityTimer()
    const timeout = authService.getInactivityTimeoutMs()
    inactivityTimer = setTimeout(() => {
      lock()
    }, timeout)
  }

  function stopInactivityTimer() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer)
      inactivityTimer = null
    }
  }

  return {
    user,
    session,
    encryptionKey,
    isLocked,
    isAuthenticated,
    userId,
    username,
    displayName,
    isRiskTagged,
    login,
    register,
    logout,
    lock,
    unlock,
    purge,
    resetInactivityTimer,
  }
})
