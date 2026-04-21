import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import DiagramListView from '@/views/DiagramListView.vue'
import ApprovedLibraryView from '@/views/ApprovedLibraryView.vue'
import DashboardView from '@/views/DashboardView.vue'
import DiagramEditorView from '@/views/DiagramEditorView.vue'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { authService } from '@/services/authService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { versionService } from '@/services/versionService'

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

function makeRouter(routes) {
  return createRouter({
    history: createMemoryHistory(),
    routes,
  })
}

async function signIn(pinia, username = 'persist-user') {
  const user = await authService.createUser({
    username,
    password: 'StrongPass123',
    realName: 'Persist User',
    organization: 'FlowForge',
  })
  const auth = useAuthStore(pinia)
  auth.user = user
  auth.session = { sessionId: `${username}-session` }
  auth.encryptionKey = 'fake-key'
  return user
}

async function seedDraft(ownerUserId, title) {
  const diagram = await diagramService.create({ title, description: title, ownerUserId })
  const start = await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'Start', x: 40, y: 40 }, ownerUserId)
  const end = await canvasService.addNode(diagram.diagramId, { type: 'end', name: 'End', x: 400, y: 40 }, ownerUserId)
  await canvasService.addEdge(diagram.diagramId, { sourceNodeId: start.nodeId, targetNodeId: end.nodeId })
  return diagram
}

async function seedPublished(ownerUserId, title) {
  const diagram = await seedDraft(ownerUserId, title)
  await versionService.createSnapshot(diagram.diagramId, 'publish', ownerUserId)
  await diagramService.transitionStatus(diagram.diagramId, 'published', ownerUserId)
  return diagram
}

async function waitFor(predicate, { timeoutMs = 4000 } = {}) {
  const start = Date.now()
  let iterations = 0
  while (Date.now() - start < timeoutMs) {
    iterations += 1
    try {
      if (await predicate()) return true
    } catch {
      // keep retrying
    }
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

beforeEach(async () => {
  localStorage.clear()
  await clearDB()
})

describe('Diagram list -> real store persistence', () => {
  it('creates a new blank diagram through the UI and the new row appears in IndexedDB', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const user = await signIn(pinia)

    const router = makeRouter([
      { path: '/diagrams', component: DiagramListView },
      { path: '/diagrams/:id', component: DiagramEditorView },
    ])
    await router.push('/diagrams')
    await router.isReady()

    const wrapper = mount(DiagramListView, {
      global: { plugins: [pinia, router] },
    })
    // Wait through the onMounted async for loadUserDiagrams to resolve.
    await new Promise((r) => setTimeout(r, 200))
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('No diagrams yet')

    await wrapper.get('button.btn-primary').trigger('click')
    await flushPromises()

    const titleInput = wrapper.get('#new-title')
    await titleInput.setValue('My New SOP')
    await wrapper.get('form').trigger('submit.prevent')

    await waitFor(async () => {
      const owned = await diagramService.getByOwner(user.userId)
      return owned.some((d) => d.title === 'My New SOP')
    })

    const diagramsInDb = await diagramService.getByOwner(user.userId)
    expect(diagramsInDb.find((d) => d.title === 'My New SOP')).toBeTruthy()
  })

  it('deleting a draft from the list removes it from IndexedDB', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const user = await signIn(pinia, 'delete-flow')
    const draft = await seedDraft(user.userId, 'Drafty')

    const router = makeRouter([
      { path: '/diagrams', component: DiagramListView },
    ])
    await router.push('/diagrams')
    await router.isReady()

    const wrapper = mount(DiagramListView, {
      global: { plugins: [pinia, router] },
    })
    await waitFor(() => wrapper.text().includes('Drafty'))

    expect(wrapper.text()).toContain('Drafty')

    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === 'Delete')
    expect(deleteBtn).toBeTruthy()
    await deleteBtn.trigger('click')
    await flushPromises()

    // Real ConfirmModal is now rendered
    const confirmBtn = wrapper.findAll('.modal-actions button').find((b) => b.text() === 'Delete')
    expect(confirmBtn).toBeTruthy()
    await confirmBtn.trigger('click')

    await waitFor(async () => {
      const d = await diagramService.getById(draft.diagramId)
      return !d
    })

    const persisted = await diagramService.getById(draft.diagramId)
    expect(persisted).toBeUndefined()
  })

  it('viewer persona disables diagram creation in the list view and shows a helpful prompt', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    await signIn(pinia, 'viewer-flow')
    const prefs = usePreferencesStore(pinia)
    prefs.setPersona('viewer')

    const router = makeRouter([{ path: '/diagrams', component: DiagramListView }])
    await router.push('/diagrams')
    await router.isReady()

    const wrapper = mount(DiagramListView, { global: { plugins: [pinia, router] } })
    await waitFor(() => !wrapper.text().includes('Loading...'))

    const newBtn = wrapper.get('button.btn-primary')
    expect(newBtn.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toMatch(/View diagrams|reduced edit/i)
  })
})

describe('ApprovedLibraryView -> real published state', () => {
  it('lists only published diagrams from the real IndexedDB and opens them by route', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const user = await signIn(pinia, 'lib-owner')
    await seedDraft(user.userId, 'Invisible Draft')
    const published = await seedPublished(user.userId, 'Visible Publication')

    const router = makeRouter([
      { path: '/library', component: ApprovedLibraryView },
      { path: '/diagrams/:id', component: DiagramEditorView },
    ])
    await router.push('/library')
    await router.isReady()

    const wrapper = mount(ApprovedLibraryView, { global: { plugins: [pinia, router] } })
    await waitFor(() => wrapper.text().includes('Visible Publication'))

    expect(wrapper.text()).toContain('Approved Library')
    expect(wrapper.text()).toContain('Visible Publication')
    expect(wrapper.text()).not.toContain('Invisible Draft')

    const viewBtn = wrapper.findAll('button').find((b) => b.text() === 'View')
    expect(viewBtn).toBeTruthy()
    await viewBtn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(`/diagrams/${published.diagramId}`)
  })
})

describe('Dashboard persistence', () => {
  it('DashboardView counts reflect real diagrams in IndexedDB', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const user = await signIn(pinia, 'dash-user')
    await seedDraft(user.userId, 'Dash Draft 1')
    await seedDraft(user.userId, 'Dash Draft 2')
    await seedPublished(user.userId, 'Dash Pub 1')

    const router = makeRouter([
      { path: '/', component: DashboardView },
      { path: '/diagrams/:id', component: DiagramEditorView },
      { path: '/diagrams', component: DiagramListView },
    ])
    await router.push('/')
    await router.isReady()

    const wrapper = mount(DashboardView, { global: { plugins: [pinia, router] } })

    // Wait for all three diagrams to surface in counters
    await waitFor(() => /[3]\s*Total/.test(wrapper.text()) || wrapper.text().includes('3Total Diagrams'))

    expect(wrapper.text()).toContain('Dashboard')
    expect(wrapper.text()).toContain('Total Diagrams')
    expect(wrapper.text()).toContain('3Total Diagrams')
    expect(wrapper.text()).toContain('2Drafts')
    expect(wrapper.text()).toContain('1Published')
  })
})

describe('Preferences persistence across remounts', () => {
  it('gridEnabled, theme, and persona choice are rehydrated from localStorage on a fresh Pinia', async () => {
    localStorage.setItem('ff_grid_enabled', 'false')
    localStorage.setItem('ff_theme', '"dark"')
    localStorage.setItem('ff_active_persona', '"reviewer"')

    const pinia = createPinia()
    setActivePinia(pinia)
    const prefs = usePreferencesStore(pinia)

    expect(prefs.gridEnabled).toBe(false)
    expect(prefs.theme).toBe('dark')
    expect(prefs.activePersona).toBe('reviewer')
  })

  it('saving a persona through the store writes it through to localStorage synchronously', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const prefs = usePreferencesStore(pinia)
    prefs.setPersona('viewer')
    await flushPromises()
    expect(JSON.parse(localStorage.getItem('ff_active_persona'))).toBe('viewer')
  })

  it('recentFiles persist across fresh Pinia instances', async () => {
    const pinia1 = createPinia()
    setActivePinia(pinia1)
    const prefs1 = usePreferencesStore(pinia1)
    prefs1.addRecentFile('abc-1', 'Diagram One')
    await flushPromises()

    const pinia2 = createPinia()
    setActivePinia(pinia2)
    const prefs2 = usePreferencesStore(pinia2)
    expect(prefs2.recentFiles[0]).toMatchObject({ diagramId: 'abc-1', title: 'Diagram One' })
  })
})
