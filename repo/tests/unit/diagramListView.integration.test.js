import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { diagramService } from '@/services/diagramService'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import DiagramListView from '@/views/DiagramListView.vue'

// Real router, real routes. Editor target is kept as a minimal component so navigation
// can resolve without pulling a large editor tree — this is a routing placeholder, not
// a component stub inside the system under test.
function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Dashboard</div>' } },
      { path: '/diagrams', name: 'Diagrams', component: DiagramListView },
      {
        path: '/diagrams/:id',
        name: 'DiagramEditor',
        component: { template: '<div class="editor-probe">Editor for {{ $route.params.id }}</div>' },
      },
    ],
  })
}

async function mountList({ user, persona = 'author', seed = [] } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  if (user) {
    const auth = useAuthStore()
    auth.user = user
    auth.session = { sessionId: `${user.userId}-session` }
  }
  const prefs = usePreferencesStore()
  prefs.setPersona(persona)

  // Seed diagrams BEFORE mount so the view's onMounted load picks them up
  for (const spec of seed) {
    await diagramService.create(spec)
  }

  const router = buildRouter()
  await router.push('/diagrams')
  await router.isReady()

  const wrapper = mount(DiagramListView, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router, pinia }
}

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await flushPromises()
    await new Promise((r) => setTimeout(r, 15))
  }
}

beforeEach(async () => {
  localStorage.clear()
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(store, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
})

describe('DiagramListView integration (real router, real ConfirmModal)', () => {
  it('disables creation for the Viewer persona and shows persona guidance', async () => {
    const user = { userId: 'viewer-user', username: 'viewer', maskedDisplayName: 'V***' }
    const { wrapper } = await mountList({
      user,
      persona: 'viewer',
      seed: [{ title: 'Existing Diagram', ownerUserId: user.userId }],
    })
    await flushPromises()

    expect(wrapper.text()).toContain('View diagrams with reduced edit affordances.')
    expect(wrapper.find('button.btn-primary').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('opens the creation modal for the Author persona', async () => {
    const user = { userId: 'author-user', username: 'author', maskedDisplayName: 'A***' }
    const { wrapper } = await mountList({ user, persona: 'author' })
    await flushPromises()

    await wrapper.find('button.btn-primary').trigger('click')
    expect(wrapper.text()).toContain('New Diagram')
    expect(wrapper.find('#new-title').exists()).toBe(true)
    wrapper.unmount()
  })

  it('creating a blank diagram persists to IndexedDB and navigates the real router to the editor route', async () => {
    const user = { userId: 'creator', username: 'creator', maskedDisplayName: 'C***' }
    const { wrapper, router } = await mountList({ user, persona: 'author' })
    await flushPromises()

    await wrapper.find('button.btn-primary').trigger('click')
    await wrapper.find('#new-title').setValue('Fresh Diagram')
    await wrapper.find('form').trigger('submit.prevent')

    await waitFor(() => router.currentRoute.value.path.startsWith('/diagrams/') && router.currentRoute.value.path !== '/diagrams')
    expect(router.currentRoute.value.path).toMatch(/^\/diagrams\//)

    const persisted = await diagramService.getByOwner('creator')
    expect(persisted.map((d) => d.title)).toContain('Fresh Diagram')
    wrapper.unmount()
  })

  it('rejects creation when title is empty and surfaces inline error; real router stays on /diagrams', async () => {
    const user = { userId: 'err-user', username: 'err', maskedDisplayName: 'E***' }
    const { wrapper, router } = await mountList({ user, persona: 'author' })
    await flushPromises()

    await wrapper.find('button.btn-primary').trigger('click')
    await wrapper.find('#new-title').setValue('   ')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Title is required.')
    expect(router.currentRoute.value.path).toBe('/diagrams')
    wrapper.unmount()
  })

  it('lists seeded diagrams and opens an entry through the Open button — real navigation', async () => {
    const user = { userId: 'list-user', username: 'list', maskedDisplayName: 'L***' }
    const { wrapper, router } = await mountList({
      user,
      persona: 'author',
      seed: [{ title: 'Alpha Existing', ownerUserId: user.userId }],
    })
    await waitFor(() => wrapper.text().includes('Alpha Existing'))

    const openBtn = wrapper.findAll('button').find((b) => b.text() === 'Open')
    expect(openBtn).toBeTruthy()
    const diagrams = await diagramService.getByOwner(user.userId)
    const diagram = diagrams.find((d) => d.title === 'Alpha Existing')

    await openBtn.trigger('click')
    await waitFor(() => router.currentRoute.value.path === `/diagrams/${diagram.diagramId}`)
    expect(router.currentRoute.value.path).toBe(`/diagrams/${diagram.diagramId}`)
    wrapper.unmount()
  })
})
