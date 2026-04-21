import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import router from '@/router'
import { authService } from '@/services/authService'
import { diagramService } from '@/services/diagramService'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'

beforeEach(async () => {
  localStorage.clear()

  const pinia = createPinia()
  setActivePinia(pinia)

  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(store, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
})

describe('app route integration', () => {
  it('renders authenticated diagrams and profile routes through the app shell with the real ToastContainer', async () => {
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
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    })

    await flushPromises()
    expect(wrapper.text()).toContain('My Diagrams')
    expect(wrapper.text()).toContain('FlowForge')

    // Real ToastContainer is mounted and receives toasts from the real UI store
    const ui = useUIStore()
    ui.showToast('Route integration toast', 'success', 0)
    await flushPromises()
    expect(wrapper.text()).toContain('Route integration toast')
    expect(wrapper.findAll('.toast').length).toBeGreaterThan(0)

    await router.push('/profile')
    await flushPromises()

    expect(wrapper.text()).toContain('Profile')
    expect(wrapper.text()).toContain('Change Password')

    wrapper.unmount()
  })
})
