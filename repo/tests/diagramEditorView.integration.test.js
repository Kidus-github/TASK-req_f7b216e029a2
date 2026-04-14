import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const routerPush = vi.fn()
const routeState = vi.hoisted(() => ({ diagramId: 'diagram-1' }))
const prefsState = vi.hoisted(() => ({ activePersona: 'viewer', lastZoom: 100, gridEnabled: true }))
const diagramsState = vi.hoisted(() => ({
  currentDiagram: { diagramId: 'diagram-1', title: 'Editor Diagram', status: 'draft', currentVersionNumber: 1 },
  currentNodes: [],
  currentEdges: [],
  selectedNodeIds: [],
  selectedEdgeIds: [],
  isDirty: false,
}))

const openDiagram = vi.fn(async () => diagramsState.currentDiagram)
const closeDiagram = vi.fn()
const clearHistory = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({ push: routerPush }),
    useRoute: () => ({ params: { id: routeState.diagramId } }),
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    userId: 'user-1',
    displayName: 'R*** U***',
    user: { userId: 'user-1', isBlacklisted: false },
  }),
}))

vi.mock('@/stores/preferences', () => ({
  usePreferencesStore: () => ({
    ...prefsState,
    addRecentFile: vi.fn(),
  }),
}))

vi.mock('@/stores/diagrams', () => ({
  useDiagramStore: () => ({
    ...diagramsState,
    openDiagram,
    closeDiagram,
  }),
}))

vi.mock('@/stores/ui', () => ({
  useUIStore: () => ({
    showToast: vi.fn(),
  }),
}))

vi.mock('@/stores/history', () => ({
  useHistoryStore: () => ({
    entries: [],
    canUndo: false,
    canRedo: false,
    clear: clearHistory,
    undoAction: vi.fn(),
    redoAction: vi.fn(),
    pushEntry: vi.fn(),
  }),
}))

vi.mock('@/composables/useAutosave', () => ({
  useAutosave: () => ({
    autosaveStatus: 'saved',
    startAutosave: vi.fn(),
    stopAutosave: vi.fn(),
    manualSave: vi.fn(),
    setGestureActive: vi.fn(),
  }),
}))

vi.mock('@/composables/useConcurrency', () => ({
  useConcurrency: () => ({
    conflictState: null,
    concurrentTabWarning: false,
    init: vi.fn(),
    ignoreTemporarily: vi.fn(),
    refreshToLatest: vi.fn(),
    destroy: vi.fn(),
  }),
}))

async function mountEditor() {
  const { default: DiagramEditorView } = await import('../src/views/DiagramEditorView.vue')
  return mount(DiagramEditorView, {
    global: {
      stubs: {
        SvgCanvas: { template: '<div class="svg-canvas-stub">Canvas</div>' },
        NodeLibrary: { template: '<div class="node-library-stub">Node Library</div>' },
        InspectorDrawer: { template: '<div class="inspector-drawer-stub">Inspector</div>' },
        HistoryModal: true,
        ConfirmModal: true,
        ConflictBanner: true,
        VersionPanel: true,
        PublishModal: true,
        RetractModal: true,
        InspectionPanel: true,
        ImportModal: true,
        VerificationPanel: true,
      },
    },
  })
}

beforeEach(() => {
  routerPush.mockReset()
  openDiagram.mockClear()
  closeDiagram.mockClear()
  clearHistory.mockClear()
  prefsState.activePersona = 'viewer'
  prefsState.lastZoom = 100
  prefsState.gridEnabled = true
  diagramsState.currentDiagram = { diagramId: 'diagram-1', title: 'Editor Diagram', status: 'draft', currentVersionNumber: 1 }
  diagramsState.currentNodes = []
  diagramsState.currentEdges = []
  diagramsState.selectedNodeIds = []
  diagramsState.selectedEdgeIds = []
  diagramsState.isDirty = false
})

describe('DiagramEditorView integration', () => {
  it('renders read-only guidance for the Viewer persona', async () => {
    prefsState.activePersona = 'viewer'

    const wrapper = await mountEditor()
    await flushPromises()

    expect(openDiagram).toHaveBeenCalledWith('diagram-1')
    expect(wrapper.text()).toContain('Viewer Workspace')
    expect(wrapper.text()).toContain('Read-only viewing prompts are shown. Verification and export remain available.')
    expect(wrapper.text()).not.toContain('Node Library')
    expect(wrapper.text()).toContain('Verify')
    expect(wrapper.findAll('button').some((button) => button.text() === 'Save')).toBe(false)
  }, 10000)

  it('renders author editing affordances for the Author persona', async () => {
    prefsState.activePersona = 'author'
    diagramsState.isDirty = true

    const wrapper = await mountEditor()
    await flushPromises()

    expect(openDiagram).toHaveBeenCalledWith('diagram-1')
    expect(wrapper.text()).toContain('Editing tools are enabled for drafting and revisions.')
    expect(wrapper.text()).toContain('Node Library')
    expect(wrapper.text()).toContain('Import')
    expect(wrapper.text()).toContain('Trace')
    expect(wrapper.text()).toContain('Save')
  }, 10000)
})
