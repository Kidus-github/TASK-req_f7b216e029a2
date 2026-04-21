import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

export async function resetDatabase() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const storeName of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(storeName, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

export function createTestPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

export function createTestRouter(initialPath = '/') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Dashboard Route</div>' } },
      { path: '/login', component: { template: '<div>Login Route</div>' } },
      { path: '/register', component: { template: '<div>Register Route</div>' } },
      { path: '/diagrams', component: { template: '<div>Diagrams Route</div>' } },
      { path: '/diagrams/:id', component: { template: '<div>Diagram Route</div>' } },
      { path: '/library', component: { template: '<div>Library Route</div>' } },
      { path: '/profile', component: { template: '<div>Profile Route</div>' } },
    ],
  })
}

export async function createUserSession(overrides = {}) {
  const { authService } = await import('@/services/authService')
  const user = await authService.createUser({
    username: overrides.username || 'test-user',
    password: overrides.password || 'StrongPass123',
    realName: overrides.realName || 'Test User',
    organization: overrides.organization || 'FlowForge',
  })

  return {
    user,
    session: overrides.session || {
      sessionId: overrides.sessionId || 'test-session',
      userId: user.userId,
    },
    password: overrides.password || 'StrongPass123',
  }
}
