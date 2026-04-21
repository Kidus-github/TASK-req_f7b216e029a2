import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDiagramStore } from '@/stores/diagrams'
import { usePreferencesStore } from '@/stores/preferences'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { versionService } from '@/services/versionService'

// Drive the full editor shell through two successive mounts to prove that edits
// made in the first session are recovered when we remount cleanly — the
// strongest evidence that persistence glue between stores, services and views
// actually works end to end.

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

async function seed() {
  const d = await diagramService.create({
    title: 'Persistence Diagram',
    ownerUserId: 'test-user',
  })
  const s = await canvasService.addNode(d.diagramId, { type: 'start', name: 'Start', x: 20, y: 20 }, 'test-user')
  const e = await canvasService.addNode(d.diagramId, { type: 'end', name: 'End', x: 400, y: 20 }, 'test-user')
  await canvasService.addEdge(d.diagramId, { sourceNodeId: s.nodeId, targetNodeId: e.nodeId })
  return { diagram: d, startNode: s, endNode: e }
}

async function mountEditor(diagramId) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const auth = useAuthStore()
  auth.user = { userId: 'test-user', username: 'persist', maskedDisplayName: 'P***' }
  auth.session = { sessionId: 's' }
  auth.encryptionKey = 'k'

  const prefs = usePreferencesStore()
  prefs.setPersona('author')

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/diagrams', name: 'Diagrams', component: { template: '<div>L</div>' } },
      { path: '/diagrams/:id', name: 'DiagramEditor', component: () => import('@/views/DiagramEditorView.vue') },
    ],
  })
  await router.push(`/diagrams/${diagramId}`)
  await router.isReady()

  const { default: DiagramEditorView } = await import('@/views/DiagramEditorView.vue')
  const wrapper = mount(DiagramEditorView, {
    global: {
      plugins: [pinia, router],
    },
    attachTo: document.body,
  })

  // Wait for editor to finish loading
  for (let i = 0; i < 40; i++) {
    if (!wrapper.text().includes('Loading diagram...')) break
    await flushPromises()
    await new Promise((r) => setTimeout(r, 20))
  }

  return { wrapper, pinia, router }
}

beforeEach(async () => {
  localStorage.clear()
  await clearDB()
  document.body.innerHTML = ''
})

describe('Editor persistence across remount (real stores + real services)', () => {
  it('renaming in one session shows up after a fresh mount', async () => {
    const { diagram } = await seed()
    const first = await mountEditor(diagram.diagramId)

    await first.wrapper.get('.toolbar-title').trigger('click')
    await first.wrapper.get('.toolbar-input').setValue('Renamed Persist')
    await first.wrapper.get('.toolbar-input').trigger('keydown.enter')
    for (let i = 0; i < 20; i++) {
      await flushPromises()
      const p = await diagramService.getById(diagram.diagramId)
      if (p.title === 'Renamed Persist') break
      await new Promise((r) => setTimeout(r, 10))
    }

    first.wrapper.unmount()

    const second = await mountEditor(diagram.diagramId)
    expect(second.wrapper.get('.toolbar-title').text()).toBe('Renamed Persist')
    second.wrapper.unmount()
  })

  it('manual Save writes a real snapshot and the version number survives remount', async () => {
    const { diagram } = await seed()
    const first = await mountEditor(diagram.diagramId)

    // Make a real edit — add a node via canvasService (simulating a user action)
    const diagrams = useDiagramStore(first.pinia)
    await diagrams.addNode({ type: 'action', name: 'Review', x: 200, y: 200 }, 'test-user')
    await flushPromises()
    expect(diagrams.isDirty).toBe(true)

    const saveBtn = first.wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveBtn.trigger('click')
    // wait for save to clear dirty
    for (let i = 0; i < 30; i++) {
      await flushPromises()
      if (diagrams.isDirty === false) break
      await new Promise((r) => setTimeout(r, 20))
    }

    expect(diagrams.isDirty).toBe(false)

    const snapsAfterSave = await versionService.getSnapshots(diagram.diagramId)
    expect(snapsAfterSave.some((s) => s.snapshotReason === 'manual')).toBe(true)

    const persistedDiagram = await diagramService.getById(diagram.diagramId)
    const oldVersion = diagram.currentVersionNumber
    expect(persistedDiagram.currentVersionNumber).toBeGreaterThan(oldVersion)

    first.wrapper.unmount()

    // Remount — the added node is persisted in IndexedDB
    const second = await mountEditor(diagram.diagramId)
    const diagrams2 = useDiagramStore(second.pinia)
    expect(diagrams2.currentNodes.some((n) => n.name === 'Review')).toBe(true)
    second.wrapper.unmount()
  })

  it('toggling grid preference persists to localStorage and is rehydrated on remount', async () => {
    const { diagram } = await seed()
    const first = await mountEditor(diagram.diagramId)
    const prefs1 = usePreferencesStore(first.pinia)
    const original = prefs1.gridEnabled

    const toggle = first.wrapper.findAll('.status-toggle').find((b) => b.text() === 'Toggle Grid')
    await toggle.trigger('click')
    await flushPromises()
    expect(prefs1.gridEnabled).toBe(!original)

    first.wrapper.unmount()

    const second = await mountEditor(diagram.diagramId)
    const prefs2 = usePreferencesStore(second.pinia)
    expect(prefs2.gridEnabled).toBe(!original)
    second.wrapper.unmount()
  })
})
