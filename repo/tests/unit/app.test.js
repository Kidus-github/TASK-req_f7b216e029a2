import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { useUIStore } from '@/stores/ui'

function buildRouter(initialPath = '/') {
  const router = createRouter({
    history: createMemoryHistory(initialPath),
    routes: [
      { path: '/', component: { template: '<div>Home Route</div>' } },
      { path: '/login', component: { template: '<div>Login Route</div>' } },
      { path: '/library', component: { template: '<div>Library Route</div>' } },
    ],
  })
  return router
}

async function mountApp({ authed = false } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = buildRouter('/')
  await router.push('/')
  await router.isReady()

  if (authed) {
    const auth = useAuthStore()
    auth.user = { userId: 'u-1', username: 'test', maskedDisplayName: 'T. U.' }
    auth.session = { sessionId: 's-1', userId: 'u-1' }
    auth.isLocked = false
  }

  const wrapper = mount(App, {
    global: {
      plugins: [pinia, router],
    },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('ff_')) localStorage.removeItem(k)
  }
  document.documentElement.removeAttribute('data-theme')
  document.body.innerHTML = ''
})

describe('App.vue (focused spec)', () => {
  it('mounts with layout, ToastContainer, and applies the preferences theme to <html>', async () => {
    const { wrapper } = await mountApp()
    expect(wrapper.find('.app-layout').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ToastContainer' }).exists()).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    wrapper.unmount()
  })

  it('hides the topbar when unauthenticated and shows it when authenticated', async () => {
    const { wrapper } = await mountApp()
    expect(wrapper.find('.app-topbar').exists()).toBe(false)

    const auth = useAuthStore()
    auth.user = { userId: 'u-2', username: 'auth', maskedDisplayName: 'A. U.' }
    auth.session = { sessionId: 's-2', userId: 'u-2' }
    auth.isLocked = false
    await flushPromises()

    expect(wrapper.find('.app-topbar').exists()).toBe(true)
    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain('Diagrams')
    expect(wrapper.text()).toContain('Library')
    wrapper.unmount()
  })

  it('updates document data-theme reactively when the preferences store theme changes', async () => {
    const { wrapper } = await mountApp()
    const prefs = usePreferencesStore()

    prefs.setTheme('dark')
    await flushPromises()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    prefs.setTheme('light')
    await flushPromises()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    wrapper.unmount()
  })

  it('renders toasts pushed into the real UI store inside ToastContainer', async () => {
    const { wrapper } = await mountApp()
    const ui = useUIStore()
    ui.showToast('Hello from app test', 'success', 0)
    await flushPromises()
    expect(wrapper.text()).toContain('Hello from app test')
    wrapper.unmount()
  })

  it('renders the current router-view content inside main.app-content', async () => {
    const { wrapper, router } = await mountApp()
    await router.push('/library')
    await flushPromises()
    expect(wrapper.find('main.app-content').text()).toContain('Library Route')
    wrapper.unmount()
  })
})
