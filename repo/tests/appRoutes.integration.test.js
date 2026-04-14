import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '../src/App.vue'
import router from '../src/router'
import { authService } from '../src/services/authService'
import { diagramService } from '../src/services/diagramService'
import { useAuthStore } from '../src/stores/auth'

beforeEach(async () => {
  localStorage.clear()

  const pinia = createPinia()
  setActivePinia(pinia)

  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  for (const store of ['users', 'diagrams', 'nodes', 'edges', 'sessions', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch {
      // ignore
    }
  }
})

describe('app route integration', () => {
  it('renders authenticated diagrams and profile routes through the app shell', async () => {
    const user = await authService.createUser({
      username: 'route-user',
      password: 'StrongPass123',
      realName: 'Route User',
      organization: 'FlowForge',
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = user
    auth.session = { sessionId: 'route-session' }

    await diagramService.create({ title: 'Route Diagram', ownerUserId: user.userId })
    await router.push('/diagrams')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: {
          ToastContainer: true,
        },
      },
    })

    await flushPromises()
    expect(wrapper.text()).toContain('My Diagrams')
    expect(wrapper.text()).toContain('FlowForge')

    await router.push('/profile')
    await flushPromises()

    expect(wrapper.text()).toContain('Profile')
    expect(wrapper.text()).toContain('Change Password')
  })
})
