import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import router from '@/router'
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
  localStorage.clear()
  await clearDB()
  const pinia = createPinia()
  setActivePinia(pinia)
  // Ensure we begin each test at a known route
  await router.push('/login')
  await router.isReady()
})

describe('router guards (real router instance)', () => {
  it('redirects an unauthenticated user away from /diagrams to /login', async () => {
    await router.push('/diagrams')
    expect(router.currentRoute.value.name).toBe('Login')
  })

  it('redirects an unauthenticated user away from /profile to /login', async () => {
    await router.push('/profile')
    expect(router.currentRoute.value.name).toBe('Login')
  })

  it('redirects an unauthenticated user away from /library to /login', async () => {
    await router.push('/library')
    expect(router.currentRoute.value.name).toBe('Login')
  })

  it('redirects an unauthenticated user away from the dashboard / to /login', async () => {
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('Login')
  })

  it('passes through to protected routes once the auth store is hydrated', async () => {
    const user = await authService.createUser({
      username: 'guard-user',
      password: 'StrongPass123',
      realName: 'Guard User',
    })

    const auth = useAuthStore()
    auth.user = user
    auth.session = { sessionId: 'guard-session' }
    auth.encryptionKey = 'fake-key'

    await router.push('/diagrams')
    expect(router.currentRoute.value.name).toBe('Diagrams')

    await router.push('/profile')
    expect(router.currentRoute.value.name).toBe('Profile')

    await router.push('/library')
    expect(router.currentRoute.value.name).toBe('ApprovedLibrary')

    await router.push('/')
    expect(router.currentRoute.value.name).toBe('Dashboard')
  })

  it('when already authenticated, navigating to /login bounces to the Dashboard', async () => {
    const user = await authService.createUser({
      username: 'already-in',
      password: 'StrongPass123',
    })
    const auth = useAuthStore()
    auth.user = user
    auth.session = { sessionId: 'session-1' }

    // Leave /login first so the subsequent navigation actually fires a transition.
    await router.push('/diagrams')
    expect(router.currentRoute.value.name).toBe('Diagrams')

    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('Dashboard')
  })

  it('sends a locked session to /login?locked=1 when touching a protected route', async () => {
    const user = await authService.createUser({
      username: 'locked-user',
      password: 'StrongPass123',
    })
    const auth = useAuthStore()
    auth.user = user
    auth.session = { sessionId: 'locked-session' }
    auth.isLocked = true

    await router.push('/diagrams')
    expect(router.currentRoute.value.name).toBe('Login')
    expect(router.currentRoute.value.query.locked).toBe('1')
  })

  it('diagram editor route preserves the :id param', async () => {
    const user = await authService.createUser({
      username: 'editor-param',
      password: 'StrongPass123',
    })
    const auth = useAuthStore()
    auth.user = user
    auth.session = { sessionId: 'editor-param-session' }

    await router.push('/diagrams/abc-123')
    expect(router.currentRoute.value.name).toBe('DiagramEditor')
    expect(router.currentRoute.value.params.id).toBe('abc-123')
  })
})
