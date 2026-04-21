import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { flushPromises, mount } from '@vue/test-utils'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import DashboardView from '@/views/DashboardView.vue'
import ApprovedLibraryView from '@/views/ApprovedLibraryView.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import ToastContainer from '@/components/common/ToastContainer.vue'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { useUIStore } from '@/stores/ui'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { versionService } from '@/services/versionService'
import { createTestPinia, createTestRouter, createUserSession, resetDatabase } from './helpers/testHarness'

async function mountWithAppContext(component, initialPath = '/', beforeMount) {
  const pinia = createTestPinia()
  const router = createTestRouter()
  await router.push(initialPath)
  await router.isReady()
  if (beforeMount) {
    await beforeMount({ pinia, router })
  }

  const wrapper = mount(component, {
    global: {
      plugins: [pinia, router],
    },
  })

  await flushPromises()
  return { wrapper, router, pinia }
}

async function createDiagramFixture(ownerUserId, title, status = 'draft') {
  const diagram = await diagramService.create({
    title,
    description: `${title} description`,
    ownerUserId,
  })

  const start = await canvasService.addNode(
    diagram.diagramId,
    { type: 'start', name: `${title} Start`, x: 120, y: 100 },
    ownerUserId
  )
  const end = await canvasService.addNode(
    diagram.diagramId,
    { type: 'end', name: `${title} End`, x: 380, y: 100 },
    ownerUserId
  )
  await canvasService.addEdge(diagram.diagramId, {
    sourceNodeId: start.nodeId,
    targetNodeId: end.nodeId,
    label: 'Complete',
  })

  if (status === 'published') {
    await versionService.createSnapshot(diagram.diagramId, 'publish', ownerUserId)
    await diagramService.transitionStatus(diagram.diagramId, 'published', ownerUserId)
  }

  return diagram
}

beforeEach(async () => {
  localStorage.clear()
  await resetDatabase()
})

async function waitFor(predicate, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
}

describe('LoginView', () => {
  it('shows validation feedback and exposes the register link', async () => {
    const { wrapper } = await mountWithAppContext(LoginView, '/login')

    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Username and password are required.')
    expect(wrapper.text()).toContain('Create one')
  })
})

describe('RegisterView', () => {
  it('validates mismatched passwords in the real form component', async () => {
    const { wrapper } = await mountWithAppContext(RegisterView, '/register')

    await wrapper.get('#reg-username').setValue('new-register-user')
    await wrapper.get('#reg-password').setValue('NewPass123!')
    await wrapper.get('#reg-confirm').setValue('DifferentPass123!')
    await wrapper.get('#reg-realname').setValue('New Register User')
    await wrapper.get('#reg-org').setValue('FlowForge')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Passwords do not match.')
    expect(wrapper.text()).toContain('Already have an account?')
  })
})

describe('DashboardView', () => {
  it('renders stats and opens a recent diagram entry', async () => {
    const account = await createUserSession({ username: 'dashboard-user' })
    const draft = await createDiagramFixture(account.user.userId, 'Dashboard Draft', 'draft')
    await createDiagramFixture(account.user.userId, 'Dashboard Published', 'published')
    const { wrapper, router, pinia } = await mountWithAppContext(DashboardView, '/', async ({ pinia }) => {
      const auth = useAuthStore(pinia)
      const prefs = usePreferencesStore(pinia)
      auth.user = account.user
      auth.session = account.session
      prefs.addRecentFile(draft.diagramId, draft.title)
    })

    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain('Total Diagrams')
    expect(wrapper.text()).toContain('Dashboard Draft')

    await wrapper.get('div[style*="cursor: pointer"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(`/diagrams/${draft.diagramId}`)
  }, 15000)
})

describe('ApprovedLibraryView', () => {
  it('loads published diagrams and routes to the selected entry', async () => {
    const account = await createUserSession({ username: 'library-user' })
    const published = await createDiagramFixture(account.user.userId, 'Published Library Diagram', 'published')

    const { wrapper, router } = await mountWithAppContext(ApprovedLibraryView, '/library')

    await flushPromises()
    expect(wrapper.text()).toContain('Approved Library')
    expect(wrapper.text()).toContain('Published Library Diagram')

    await wrapper.get('tbody .btn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(`/diagrams/${published.diagramId}`)
  })
})

describe('AppTopbar', () => {
  it('renders persona and user state and toggles the theme control', async () => {
    const account = await createUserSession({ username: 'topbar-user' })
    const { wrapper, pinia } = await mountWithAppContext(AppTopbar, '/', async ({ pinia }) => {
      const auth = useAuthStore(pinia)
      auth.user = {
        ...account.user,
        isRiskTagged: true,
        isBlacklisted: true,
      }
      auth.session = account.session
    })
    const auth = useAuthStore(pinia)
    const prefs = usePreferencesStore(pinia)

    await flushPromises()
    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain('Risk Tagged')
    expect(wrapper.text()).toContain('Blacklist Label')

    const toggleButton = wrapper.get('button[aria-label]')
    await toggleButton.trigger('click')
    expect(prefs.theme).toBe('dark')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('locks the current session and logs out to the login route through the real auth store', async () => {
    const account = await createUserSession({ username: 'topbar-session-user' })
    const { wrapper, router, pinia } = await mountWithAppContext(AppTopbar, '/', async ({ pinia }) => {
      const auth = useAuthStore(pinia)
      await auth.login(account.user.username, account.password)
    })
    const auth = useAuthStore(pinia)

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.isLocked).toBe(false)

    const buttons = wrapper.findAll('button')
    const lockButton = buttons.find((button) => button.text() === 'Lock')
    const logoutButton = buttons.find((button) => button.text() === 'Logout')

    await lockButton.trigger('click')
    await waitFor(() => auth.isLocked === true)
    expect(auth.isLocked).toBe(true)
    expect(auth.isAuthenticated).toBe(false)

    await auth.unlock(account.password)
    await waitFor(() => auth.isAuthenticated === true)
    expect(auth.isAuthenticated).toBe(true)

    await logoutButton.trigger('click')
    await waitFor(() => auth.isAuthenticated === false && router.currentRoute.value.fullPath === '/login')
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})

describe('ToastContainer', () => {
  it('renders active toasts and dismisses them on click', async () => {
    const { wrapper } = await mountWithAppContext(ToastContainer, '/')
    const ui = useUIStore()

    ui.showToast('Saved successfully.', 'success', 0)
    await flushPromises()

    expect(wrapper.text()).toContain('Saved successfully.')
    await wrapper.get('.toast').trigger('click')
    expect(ui.toasts).toHaveLength(0)
  })
})
