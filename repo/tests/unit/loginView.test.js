import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/authService'
import LoginView from '@/views/LoginView.vue'

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

async function mountLogin({ lockQuery = false, preAuth = null } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (preAuth) {
    const auth = useAuthStore()
    Object.assign(auth, preAuth)
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Dash</div>' } },
      { path: '/login', component: LoginView },
      { path: '/register', component: { template: '<div>Register</div>' } },
    ],
  })
  await router.push(lockQuery ? '/login?locked=1' : '/login')
  await router.isReady()

  const wrapper = mount(LoginView, {
    global: { plugins: [pinia, router] },
  })
  return { wrapper, router, pinia }
}

beforeEach(async () => {
  localStorage.clear()
  await clearDB()
})

describe('LoginView', () => {
  it('shows "Sign In" heading and the register link by default', async () => {
    const { wrapper } = await mountLogin()
    expect(wrapper.get('h1').text()).toBe('Sign In')
    expect(wrapper.text()).toContain('FlowForge SOP Canvas')
    expect(wrapper.text()).toContain('Create one')
  })

  it('blocks submission when username is empty', async () => {
    const { wrapper } = await mountLogin()
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.text()).toContain('Username and password are required.')
  })

  it('blocks submission when password is empty', async () => {
    const { wrapper } = await mountLogin()
    await wrapper.get('#username').setValue('someone')
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.text()).toContain('Username and password are required.')
  })

  it('shows the login error when credentials are invalid', async () => {
    await authService.createUser({ username: 'reg-user', password: 'StrongPass123', realName: 'R' })
    const { wrapper } = await mountLogin()
    await wrapper.get('#username').setValue('reg-user')
    await wrapper.get('#password').setValue('wrong-password')
    await wrapper.find('form').trigger('submit.prevent')
    for (let i = 0; i < 40; i++) {
      if (wrapper.find('.form-error').exists()) break
      await flushPromises()
      await new Promise((r) => setTimeout(r, 15))
    }
    expect(wrapper.find('.form-error').text()).toMatch(/Invalid username or password/)
  })

  it('logs in successfully and navigates to /', async () => {
    await authService.createUser({ username: 'good-user', password: 'StrongPass123', realName: 'G' })
    const { wrapper, router } = await mountLogin()
    await wrapper.get('#username').setValue('good-user')
    await wrapper.get('#password').setValue('StrongPass123')
    await wrapper.find('form').trigger('submit.prevent')
    for (let i = 0; i < 40; i++) {
      if (router.currentRoute.value.path === '/') break
      await flushPromises()
      await new Promise((r) => setTimeout(r, 15))
    }
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('renders the lock screen variant when locked=1 and auth.isLocked is true', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    // create user and simulate a logged-in + locked session
    await authService.createUser({ username: 'lock-view', password: 'StrongPass123', realName: 'L' })
    const auth = useAuthStore()
    await auth.login('lock-view', 'StrongPass123')
    await auth.lock()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Dash</div>' } },
        { path: '/login', component: LoginView },
      ],
    })
    await router.push('/login?locked=1')
    await router.isReady()

    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })

    expect(wrapper.get('h1').text()).toBe('Session Locked')
    expect(wrapper.text()).toContain('Enter your password to unlock')
    expect(wrapper.text()).toContain('Sign out instead')

    // unlock path
    await wrapper.get('#password').setValue('StrongPass123')
    await wrapper.find('form').trigger('submit.prevent')
    for (let i = 0; i < 40; i++) {
      if (!auth.isLocked) break
      await flushPromises()
      await new Promise((r) => setTimeout(r, 15))
    }
    expect(auth.isLocked).toBe(false)
  })
})
