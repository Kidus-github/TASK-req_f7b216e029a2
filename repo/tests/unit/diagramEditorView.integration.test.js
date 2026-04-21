import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useDiagramStore } from '@/stores/diagrams'
import { useHistoryStore } from '@/stores/history'
import { usePreferencesStore } from '@/stores/preferences'
import { useUIStore } from '@/stores/ui'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { versionService } from '@/services/versionService'

// No SvgCanvas mock. No vue-router mock. All real children, real stores, real services.
// Low-level pointer/DataTransfer interactions live in tests/e2e/canvasInteractions.spec.js
// where Playwright provides a real browser. Here we cover everything a jsdom-level
// mount can reach without simulating browser primitives.

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

async function seedDiagramWithNodes(ownerUserId = 'test-user', title = 'Seeded Editor Diagram') {
  const diagram = await diagramService.create({
    title,
    description: 'Used in editor integration test',
    ownerUserId,
  })
  const start = await canvasService.addNode(diagram.diagramId, {
    type: 'start', name: 'Start', x: 40, y: 40,
  }, ownerUserId)
  const end = await canvasService.addNode(diagram.diagramId, {
    type: 'end', name: 'End', x: 400, y: 40,
  }, ownerUserId)
  await canvasService.addEdge(diagram.diagramId, {
    sourceNodeId: start.nodeId,
    targetNodeId: end.nodeId,
  })
  return { diagram, startNode: start, endNode: end }
}

async function mountEditorRouted(diagramId, personaName) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const auth = useAuthStore()
  auth.user = { userId: 'test-user', username: 'editor', maskedDisplayName: 'E***' }
  auth.session = { sessionId: 'session-1' }
  auth.encryptionKey = 'fake-key'

  const prefs = usePreferencesStore()
  prefs.setPersona(personaName)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Dashboard', component: { template: '<div>Dash</div>' } },
      { path: '/diagrams', name: 'Diagrams', component: { template: '<div>Diagrams</div>' } },
      {
        path: '/diagrams/:id',
        name: 'DiagramEditor',
        component: () => import('@/views/DiagramEditorView.vue'),
      },
    ],
  })
  await router.push(`/diagrams/${diagramId}`)
  await router.isReady()

  const { default: DiagramEditorView } = await import('@/views/DiagramEditorView.vue')

  const wrapper = mount(DiagramEditorView, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })

  return { wrapper, pinia, router }
}

async function waitForEditorReady(wrapper, { timeoutMs = 8000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!wrapper.text().includes('Loading diagram...')) return
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function waitFor(predicate, { timeoutMs = 8000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
}

// Intercept the DOM primitives used by exportService.downloadFile so we can read
// the actual bytes that would be delivered to the user. jsdom's Blob does not
// expose readable content through Blob.prototype.text(), so we additionally wrap
// the Blob constructor to retain the raw parts as they were supplied.
function captureDownloads() {
  const captures = []
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const OriginalBlob = globalThis.Blob

  class CapturingBlob {
    constructor(parts, options) {
      this.parts = parts
      this.type = options?.type || ''
      // Concatenate stringifiable parts so tests can read bytes directly.
      this._text = (parts || [])
        .map((p) => (typeof p === 'string' ? p : (p?.toString ? p.toString() : '')))
        .join('')
      this.size = this._text.length
    }
    text() {
      return Promise.resolve(this._text)
    }
    arrayBuffer() {
      return Promise.resolve(new TextEncoder().encode(this._text).buffer)
    }
  }

  globalThis.Blob = CapturingBlob
  URL.createObjectURL = (blob) => {
    captures.push(blob)
    return `blob:mock/${captures.length - 1}`
  }
  URL.revokeObjectURL = () => {}

  return {
    captures,
    restore() {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      globalThis.Blob = OriginalBlob
    },
  }
}

beforeEach(async () => {
  localStorage.clear()
  await clearDB()
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('DiagramEditorView integration (real Pinia + router + all real children)', () => {
  it('loads a real seeded diagram via the route param and renders the real toolbar + NodeLibrary + SvgCanvas', async () => {
    const { diagram } = await seedDiagramWithNodes()

    const { wrapper } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    expect(wrapper.text()).toContain('Seeded Editor Diagram')
    expect(wrapper.text()).toContain('draft')
    expect(wrapper.text()).toContain('Editing tools are enabled for drafting and revisions.')

    // Real NodeLibrary
    expect(wrapper.find('.node-library').exists()).toBe(true)
    expect(wrapper.text()).toContain('Node Library')
    const libNodes = wrapper.findAll('.lib-node')
    expect(libNodes.length).toBe(5)
    expect(libNodes[0].attributes('draggable')).toBe('true')

    expect(wrapper.text()).toMatch(/2\/500 nodes/)
    expect(wrapper.text()).toMatch(/1\/800 edges/)

    // Real SvgCanvas present — not a stub
    const svg = wrapper.find('svg.canvas-svg')
    expect(svg.exists()).toBe(true)
    // Real edges/nodes are rendered as children inside the transform group
    expect(wrapper.findAllComponents({ name: 'CanvasNode' }).length).toBe(2)
    expect(wrapper.findAllComponents({ name: 'CanvasEdge' }).length).toBe(1)
    wrapper.unmount()
  })

  it('viewer persona renders read-only workspace without Node Library or Save', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper } = await mountEditorRouted(diagram.diagramId, 'viewer')
    await waitForEditorReady(wrapper)

    expect(wrapper.text()).toContain('Read-only viewing prompts are shown. Verification and export remain available.')
    expect(wrapper.text()).toContain('Viewer Workspace')
    expect(wrapper.find('.node-library').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Save')).toBe(false)
    wrapper.unmount()
  })

  it('editing the diagram title through the toolbar persists via the real store and service', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    await wrapper.get('.toolbar-title').trigger('click')
    const input = wrapper.get('.toolbar-input')
    await input.setValue('Renamed Diagram')
    await input.trigger('keydown.enter')

    await waitFor(() => wrapper.find('.toolbar-title').exists() && wrapper.get('.toolbar-title').text() === 'Renamed Diagram')
    expect(wrapper.get('.toolbar-title').text()).toBe('Renamed Diagram')

    const persisted = await diagramService.getById(diagram.diagramId)
    expect(persisted.title).toBe('Renamed Diagram')
    wrapper.unmount()
  })

  it('toggling grid preference in the status bar writes through to the preferences store and localStorage', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const prefs = usePreferencesStore(pinia)
    const before = prefs.gridEnabled

    const toggle = wrapper.findAll('.status-toggle').find((b) => b.text() === 'Toggle Grid')
    await toggle.trigger('click')
    await flushPromises()

    expect(prefs.gridEnabled).toBe(!before)
    expect(JSON.parse(localStorage.getItem('ff_grid_enabled'))).toBe(!before)
    wrapper.unmount()
  })

  it('redirects to /diagrams when the diagram id does not exist', async () => {
    const { wrapper, router } = await mountEditorRouted('does-not-exist', 'author')
    await waitFor(() => router.currentRoute.value.path === '/diagrams')
    expect(router.currentRoute.value.path).toBe('/diagrams')
    wrapper.unmount()
  })

  it('author persona renders autosave status badge wired to the real store', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    expect(wrapper.text()).toContain('Saved')
    const diagrams = useDiagramStore(pinia)
    diagrams.isDirty = true
    await flushPromises()
    expect(wrapper.text()).toContain('Unsaved')
    wrapper.unmount()
  })

  it('manual Save fires a real version snapshot and clears the dirty flag', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const diagrams = useDiagramStore(pinia)
    diagrams.isDirty = true
    await flushPromises()

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveBtn.trigger('click')
    await waitFor(() => diagrams.isDirty === false)

    expect(diagrams.isDirty).toBe(false)
    const snapshots = await versionService.getSnapshots(diagram.diagramId)
    expect(snapshots.length).toBeGreaterThanOrEqual(1)
    expect(snapshots[0].snapshotReason).toBe('manual')
    const persisted = await diagramService.getById(diagram.diagramId)
    expect(persisted.currentVersionNumber).toBeGreaterThan(diagram.currentVersionNumber)
    wrapper.unmount()
  })

  it('publishing a draft diagram really flips status to published through versionService + diagram store', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const byText = (txt) => wrapper.findAll('button').find((b) => b.text() === txt)
    await byText('Publish').trigger('click')
    await waitFor(() => wrapper.text().includes('Ready to publish'))
    expect(wrapper.text()).toContain('All validation checks passed')

    const publishBtns = wrapper.findAll('button').filter((b) => b.text() === 'Publish')
    const modalPublishBtn = publishBtns[publishBtns.length - 1]
    expect(modalPublishBtn.attributes('disabled')).toBeUndefined()
    await modalPublishBtn.trigger('click')
    await waitFor(async () => {
      const d = await diagramService.getById(diagram.diagramId)
      return d.status === 'published'
    }, { timeoutMs: 10_000 })

    const persisted = await diagramService.getById(diagram.diagramId)
    expect(persisted.status).toBe('published')

    const diagrams = useDiagramStore(pinia)
    await waitFor(() => diagrams.currentDiagram?.status === 'published', { timeoutMs: 5000 })
    expect(diagrams.currentDiagram.status).toBe('published')

    const snaps = await versionService.getSnapshots(diagram.diagramId)
    expect(snaps.some((s) => s.snapshotReason === 'publish')).toBe(true)
    wrapper.unmount()
  })

  it('toolbar action buttons toggle the corresponding modal/panel flags', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const byText = (txt) => wrapper.findAll('button').find((b) => b.text() === txt)

    await byText('History (0)').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toMatch(/History|No actions yet/)

    await byText('Versions').trigger('click')
    await waitFor(() => wrapper.text().includes('Version History') || wrapper.text().includes('No versions'))
    expect(wrapper.text()).toMatch(/Version History|No versions/)

    await byText('Verify').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toMatch(/Verification|Checking/)
    wrapper.unmount()
  })

  it('JSON export downloads real file bytes captured via URL.createObjectURL — no service spy', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const download = captureDownloads()
    try {
      const jsonBtn = wrapper.findAll('button').find((b) => b.text() === 'JSON')
      await jsonBtn.trigger('click')
      await waitFor(() => download.captures.length > 0)

      expect(download.captures.length).toBe(1)
      const blob = download.captures[0]
      expect(blob.type).toBe('application/json')
      const text = await blob.text()
      const parsed = JSON.parse(text)
      expect(parsed.diagram.title).toBe('Seeded Editor Diagram')
      expect(parsed.nodes.length).toBe(2)
      expect(parsed.edges.length).toBe(1)
    } finally {
      download.restore()
    }
    wrapper.unmount()
  })

  it('Back button navigates to /diagrams via the real router', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, router } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const backBtn = wrapper.findAll('button').find((b) => b.text() === 'Back')
    await backBtn.trigger('click')
    await waitFor(() => router.currentRoute.value.path === '/diagrams')
    expect(router.currentRoute.value.path).toBe('/diagrams')
    wrapper.unmount()
  })

  it('real Trace generation writes traceability codes to IndexedDB', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const traceBtn = wrapper.findAll('button').find((b) => b.text() === 'Trace')
    await traceBtn.trigger('click')
    await waitFor(async () => {
      const nodes = await diagramService.getNodes(diagram.diagramId)
      return nodes.length > 0 && nodes.every((n) => n.traceabilityCode)
    }, { timeoutMs: 10_000 })

    const persistedNodes = await diagramService.getNodes(diagram.diagramId)
    expect(persistedNodes.every((n) => n.traceabilityCode)).toBe(true)
    expect(persistedNodes[0].traceabilityCode).toMatch(/SOP-/)
    wrapper.unmount()
  })

  it('reviewer persona cannot save or trace but keeps publish + read-only affordances', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper } = await mountEditorRouted(diagram.diagramId, 'reviewer')
    await waitForEditorReady(wrapper)

    const buttonTexts = wrapper.findAll('button').map((b) => b.text())
    expect(buttonTexts).toContain('Publish')
    expect(buttonTexts).not.toContain('Save')
    expect(buttonTexts).not.toContain('Trace')
    expect(wrapper.text()).toContain('Reviewer Workspace')
    wrapper.unmount()
  })

  it('undo/redo buttons reflect the real history store state after a title edit', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const history = useHistoryStore(pinia)
    const byText = (txt) => wrapper.findAll('button').find((b) => b.text() === txt)

    expect(byText('Undo').attributes('disabled')).toBeDefined()
    expect(byText('Redo').attributes('disabled')).toBeDefined()

    history.pushEntry({ label: 'noop', undo: async () => {}, redo: async () => {} })
    await flushPromises()

    expect(byText('Undo').attributes('disabled')).toBeUndefined()
    expect(byText('History (1)')).toBeTruthy()
    wrapper.unmount()
  })

  it('inspector update-node emit writes a real patch to the store and IndexedDB via the real InspectorDrawer', async () => {
    const { diagram, startNode } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const diagrams = useDiagramStore(pinia)
    diagrams.selectNode(startNode.nodeId)
    await flushPromises()

    const inspector = wrapper.findComponent({ name: 'InspectorDrawer' })
    expect(inspector.exists()).toBe(true)
    const nameInput = inspector.find('#insp-name')
    await nameInput.setValue('Renamed Start')
    await nameInput.trigger('change')

    await waitFor(async () => {
      const nodes = await diagramService.getNodes(diagram.diagramId)
      return nodes.find((n) => n.nodeId === startNode.nodeId)?.name === 'Renamed Start'
    })

    const history = useHistoryStore(pinia)
    expect(history.entries.some((e) => e.label.startsWith('Edit node'))).toBe(true)
    wrapper.unmount()
  })

  it('inspector delete-node flow opens the real ConfirmModal; confirming deletes from IndexedDB', async () => {
    const { diagram, startNode } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const diagrams = useDiagramStore(pinia)
    diagrams.selectNode(startNode.nodeId)
    await flushPromises()

    const inspector = wrapper.findComponent({ name: 'InspectorDrawer' })
    const deleteBtn = inspector.findAll('button').find((b) => b.text() === 'Delete Node')
    await deleteBtn.trigger('click')

    await waitFor(() => wrapper.findComponent({ name: 'ConfirmModal' }).exists())
    const confirmBtn = wrapper.findAll('.modal-actions button').find((b) => b.text() === 'Delete')
    await confirmBtn.trigger('click')

    await waitFor(async () => {
      const nodes = await diagramService.getNodes(diagram.diagramId)
      return !nodes.some((n) => n.nodeId === startNode.nodeId)
    })

    const remaining = await diagramService.getNodes(diagram.diagramId)
    expect(remaining.some((n) => n.nodeId === startNode.nodeId)).toBe(false)
    wrapper.unmount()
  })

  it('inspector delete-edge flow removes the edge and records a history entry — all real wiring', async () => {
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'author')
    await waitForEditorReady(wrapper)

    const diagrams = useDiagramStore(pinia)
    const edge = diagrams.currentEdges[0]
    diagrams.selectEdge(edge.edgeId)
    await flushPromises()

    const inspector = wrapper.findComponent({ name: 'InspectorDrawer' })
    const delBtn = inspector.findAll('button').find((b) => b.text() === 'Delete Edge')
    await delBtn.trigger('click')

    await waitFor(async () => {
      const edges = await diagramService.getEdges(diagram.diagramId)
      return edges.length === 0
    })

    const persistedEdges = await diagramService.getEdges(diagram.diagramId)
    expect(persistedEdges.length).toBe(0)

    const history = useHistoryStore(pinia)
    expect(history.entries.some((e) => e.label === 'Delete edge')).toBe(true)
    wrapper.unmount()
  })

  it('SVG export surfaces a toast when no canvas-svg is present for the viewer persona', async () => {
    // Viewer persona hides the canvas entirely — SVG export has nothing to serialize.
    const { diagram } = await seedDiagramWithNodes()
    const { wrapper, pinia } = await mountEditorRouted(diagram.diagramId, 'viewer')
    await waitForEditorReady(wrapper)

    const ui = useUIStore(pinia)
    const toastsBefore = ui.toasts.length
    const svgBtn = wrapper.findAll('button').find((b) => b.text() === 'SVG')
    await svgBtn.trigger('click')
    await waitFor(() => ui.toasts.length > toastsBefore)
    expect(ui.toasts.length).toBeGreaterThan(toastsBefore)
    wrapper.unmount()
  })
})

/*
 * Canvas drag/drop, node-to-node connect, node-move, and cross-tab concurrency flows
 * have been intentionally moved to Playwright — jsdom cannot faithfully dispatch
 * PointerEvents with a live DataTransfer or run two BroadcastChannel peers. See:
 *   tests/e2e/canvasInteractions.spec.js
 *   tests/e2e/concurrency.spec.js
 */
