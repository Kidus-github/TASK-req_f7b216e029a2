import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { diagramService } from '../src/services/diagramService'
import { useAuthStore } from '../src/stores/auth'
import { usePreferencesStore } from '../src/stores/preferences'
import DiagramListView from '../src/views/DiagramListView.vue'

const routerPush = vi.fn()
let pinia

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({ push: routerPush }),
  }
})

beforeEach(async () => {
  routerPush.mockReset()
  localStorage.clear()

  pinia = createPinia()
  setActivePinia(pinia)

  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  for (const store of ['diagrams', 'nodes', 'edges', 'snapshots', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch {
      // ignore
    }
  }
})

describe('DiagramListView integration', () => {
  it('disables creation for the Viewer persona and shows the persona guidance', async () => {
    const auth = useAuthStore()
    const prefs = usePreferencesStore()
    auth.user = { userId: 'viewer-user', username: 'viewer', maskedDisplayName: 'V***' }
    auth.session = { sessionId: 'session-1' }
    prefs.setPersona('viewer')

    await diagramService.create({ title: 'Existing Diagram', ownerUserId: auth.userId })

    const wrapper = mount(DiagramListView, {
      global: {
        plugins: [pinia],
        stubs: { ConfirmModal: true },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('View diagrams with reduced edit affordances.')
    expect(wrapper.find('button.btn-primary').attributes('disabled')).toBeDefined()
  })

  it('opens the creation modal for the Author persona', async () => {
    const auth = useAuthStore()
    const prefs = usePreferencesStore()
    auth.user = { userId: 'author-user', username: 'author', maskedDisplayName: 'A***' }
    auth.session = { sessionId: 'session-2' }
    prefs.setPersona('author')

    const wrapper = mount(DiagramListView, {
      global: {
        plugins: [pinia],
        stubs: { ConfirmModal: true },
      },
    })

    await flushPromises()
    await wrapper.find('button.btn-primary').trigger('click')

    expect(wrapper.text()).toContain('New Diagram')
    expect(wrapper.find('#new-title').exists()).toBe(true)
  })
})
