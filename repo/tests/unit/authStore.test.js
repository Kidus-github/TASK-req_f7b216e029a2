import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  await clearDB()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('auth store', () => {
  it('starts unauthenticated with empty user/session/encryption state', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.session).toBeNull()
    expect(store.encryptionKey).toBeNull()
    expect(store.userId).toBeNull()
    expect(store.username).toBe('')
    expect(store.displayName).toBe('')
    expect(store.isRiskTagged).toBe(false)
    expect(store.isLocked).toBe(false)
  })

  it('login hydrates user + session + encryption key and flips isAuthenticated', async () => {
    await authService.createUser({
      username: 'authstore-user',
      password: 'StrongPass123',
      realName: 'Auth Store',
      organization: 'FlowForge',
    })

    const store = useAuthStore()
    const result = await store.login('authstore-user', 'StrongPass123')

    expect(result.user.username).toBe('authstore-user')
    expect(store.isAuthenticated).toBe(true)
    expect(store.userId).toBe(result.user.userId)
    expect(store.username).toBe('authstore-user')
    expect(store.displayName).toBeTruthy()
    expect(store.encryptionKey).toBeTruthy()
    expect(store.session?.sessionId).toBeTruthy()
    expect(store.isLocked).toBe(false)

    await store.logout()
  })

  it('login with wrong password throws and leaves state unauthenticated', async () => {
    await authService.createUser({
      username: 'bad-pw-user',
      password: 'StrongPass123',
      realName: 'BP',
    })
    const store = useAuthStore()
    await expect(store.login('bad-pw-user', 'wrong-pass-0')).rejects.toThrow('Invalid username or password.')
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })

  it('logout clears auth state and ends the session', async () => {
    await authService.createUser({ username: 'logout-user', password: 'StrongPass123', realName: 'LU' })
    const store = useAuthStore()
    await store.login('logout-user', 'StrongPass123')
    const sessionId = store.session.sessionId

    await store.logout()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.session).toBeNull()
    expect(store.encryptionKey).toBeNull()

    const { getDB } = await import('@/db/schema')
    const db = await getDB()
    const persisted = await db.get('sessions', sessionId)
    expect(persisted.endedAt).toBeTruthy()
    expect(persisted.terminationReason).toBe('logout')
  })

  it('logout without an active session still purges local auth state', async () => {
    const store = useAuthStore()
    store.user = { userId: 'user-1', username: 'orphan', maskedDisplayName: 'O***' }
    store.session = null
    store.encryptionKey = 'fake-key'

    await expect(store.logout()).resolves.toBeUndefined()
    expect(store.user).toBeNull()
    expect(store.session).toBeNull()
    expect(store.encryptionKey).toBeNull()
    expect(store.isLocked).toBe(false)
  })

  it('lock clears the encryption key and marks isLocked without logging out', async () => {
    await authService.createUser({ username: 'lock-user', password: 'StrongPass123', realName: 'LU' })
    const store = useAuthStore()
    await store.login('lock-user', 'StrongPass123')

    await store.lock()

    expect(store.isLocked).toBe(true)
    expect(store.encryptionKey).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).not.toBeNull()
    expect(store.session).not.toBeNull()
  })

  it('unlock restores the encryption key and clears isLocked', async () => {
    await authService.createUser({ username: 'unlock-user', password: 'StrongPass123', realName: 'U' })
    const store = useAuthStore()
    await store.login('unlock-user', 'StrongPass123')
    await store.lock()
    expect(store.isLocked).toBe(true)

    await store.unlock('StrongPass123')

    expect(store.isLocked).toBe(false)
    expect(store.encryptionKey).toBeTruthy()
    expect(store.isAuthenticated).toBe(true)
  })

  it('unlock with wrong password throws and keeps session locked', async () => {
    await authService.createUser({ username: 'unlock2', password: 'StrongPass123', realName: 'U' })
    const store = useAuthStore()
    await store.login('unlock2', 'StrongPass123')
    await store.lock()

    await expect(store.unlock('wrong-password')).rejects.toThrow('Invalid password.')
    expect(store.isLocked).toBe(true)
  })

  it('unlock without an active session rejects immediately', async () => {
    const store = useAuthStore()
    await expect(store.unlock('anything')).rejects.toThrow('No session to unlock.')
  })

  it('register creates a user via the auth service without logging in', async () => {
    const store = useAuthStore()
    const user = await store.register({
      username: 'new-reg',
      password: 'StrongPass123',
      realName: 'New Reg',
      organization: 'FF',
    })
    expect(user.username).toBe('new-reg')
    expect(store.isAuthenticated).toBe(false)
  })

  it('purge synchronously clears auth state without touching IndexedDB', async () => {
    await authService.createUser({ username: 'purge', password: 'StrongPass123', realName: 'P' })
    const store = useAuthStore()
    await store.login('purge', 'StrongPass123')
    const sessionId = store.session.sessionId

    store.purge()

    expect(store.user).toBeNull()
    expect(store.session).toBeNull()
    expect(store.encryptionKey).toBeNull()
    expect(store.isAuthenticated).toBe(false)

    const { getDB } = await import('@/db/schema')
    const db = await getDB()
    const persisted = await db.get('sessions', sessionId)
    expect(persisted.endedAt).toBeNull()
  })

  it('resetInactivityTimer is a no-op when not authenticated', () => {
    const store = useAuthStore()
    expect(() => store.resetInactivityTimer()).not.toThrow()
  })

  it('resetInactivityTimer touches the session when authenticated', async () => {
    await authService.createUser({ username: 'reset', password: 'StrongPass123', realName: 'R' })
    const store = useAuthStore()
    await store.login('reset', 'StrongPass123')
    const spy = vi.spyOn(authService, 'touchSession').mockResolvedValue()

    store.resetInactivityTimer()

    expect(spy).toHaveBeenCalledWith(store.session.sessionId)
    spy.mockRestore()
  })

  it('isRiskTagged reflects the current user flag', () => {
    const store = useAuthStore()
    store.user = { userId: 'risky', username: 'risky', maskedDisplayName: 'R***', isRiskTagged: true }
    store.session = { sessionId: 's-1' }
    expect(store.isRiskTagged).toBe(true)
  })

  it('auto-locks when the inactivity timer expires', async () => {
    await authService.createUser({ username: 'timer-user', password: 'StrongPass123', realName: 'Timer' })
    const store = useAuthStore()
    const timeoutSpy = vi.spyOn(authService, 'getInactivityTimeoutMs').mockReturnValue(1)

    await store.login('timer-user', 'StrongPass123')
    expect(store.isLocked).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(store.isLocked).toBe(true)
    expect(store.encryptionKey).toBeNull()
    timeoutSpy.mockRestore()
  })
})
