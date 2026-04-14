import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SvgCanvas from '@/components/diagrams/SvgCanvas.vue'

const diagramsState = {
  currentNodes: [],
  currentEdges: [],
  selectedNodeIds: [],
  selectedEdgeIds: [],
  clearSelection: vi.fn(),
  selectNode: vi.fn(),
  selectEdge: vi.fn(),
  selectNodesInRect: vi.fn(),
  updateNodeLocal: vi.fn(),
}

const prefsState = {
  lastZoom: 100,
  gridEnabled: true,
}

vi.mock('@/stores/diagrams', () => ({
  useDiagramStore: () => diagramsState,
}))

vi.mock('@/stores/preferences', () => ({
  usePreferencesStore: () => prefsState,
}))

vi.mock('@/utils/alignment', () => ({
  computeAlignmentGuides: vi.fn(() => ({ guides: [], snappedX: null, snappedY: null })),
  applyAlignmentSnap: vi.fn((x, y) => ({ x, y })),
}))

function mountCanvas(props = {}) {
  return mount(SvgCanvas, {
    props: { highlightedNodeIds: [], editable: true, ...props },
    global: {
      stubs: {
        CanvasNode: true,
        CanvasEdge: true,
      },
    },
    attachTo: document.createElement('div'),
  })
}

describe('SvgCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    diagramsState.currentNodes = []
    diagramsState.currentEdges = []
    diagramsState.selectedNodeIds = []
    diagramsState.selectedEdgeIds = []
    prefsState.lastZoom = 100
    prefsState.gridEnabled = true
  })

  it('renders SVG element with canvas-svg class', () => {
    const wrapper = mountCanvas()
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.classes()).toContain('canvas-svg')
    wrapper.unmount()
  })

  it('renders grid pattern in defs', () => {
    const wrapper = mountCanvas()
    const pattern = wrapper.find('defs pattern#grid')
    expect(pattern.exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders background rect with grid fill when gridEnabled is true', () => {
    prefsState.gridEnabled = true
    const wrapper = mountCanvas()
    const bg = wrapper.find('rect.canvas-bg')
    expect(bg.exists()).toBe(true)
    expect(bg.attributes('fill')).toBe('url(#grid)')
    wrapper.unmount()
  })

  it('snapToGrid returns rounded value when grid is enabled', () => {
    prefsState.gridEnabled = true
    const wrapper = mountCanvas()
    const { snapToGrid } = wrapper.vm
    // GRID_SIZE = 20, so 33 rounds to 40
    expect(snapToGrid(33)).toBe(40)
    expect(snapToGrid(10)).toBe(20)
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(50)).toBe(60)
    wrapper.unmount()
  })

  it('snapToGrid returns raw value when grid is disabled', () => {
    prefsState.gridEnabled = false
    const wrapper = mountCanvas()
    const { snapToGrid } = wrapper.vm
    expect(snapToGrid(33)).toBe(33)
    expect(snapToGrid(17.5)).toBe(17.5)
    wrapper.unmount()
  })

  it('does not emit node-drop when editable is false', async () => {
    const wrapper = mountCanvas({ editable: false })
    const svg = wrapper.find('svg')

    const dropEvent = new Event('drop', { bubbles: true })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { getData: () => 'action' } })
    Object.defineProperty(dropEvent, 'clientX', { value: 200 })
    Object.defineProperty(dropEvent, 'clientY', { value: 200 })

    svg.element.dispatchEvent(dropEvent)

    expect(wrapper.emitted('node-drop')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits node-drop with snapped coordinates on drop event with valid node-type data', async () => {
    prefsState.gridEnabled = true
    const wrapper = mountCanvas({ editable: true })
    const svg = wrapper.find('svg')

    // Mock getBoundingClientRect for screenToCanvas
    svg.element.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    })

    const dropEvent = new Event('drop', { bubbles: true })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { getData: () => 'action' } })
    Object.defineProperty(dropEvent, 'clientX', { value: 200 })
    Object.defineProperty(dropEvent, 'clientY', { value: 200 })

    svg.element.dispatchEvent(dropEvent)

    const emitted = wrapper.emitted('node-drop')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toMatchObject({
      type: 'action',
      x: expect.any(Number),
      y: expect.any(Number),
    })
    // Values should be snapped to GRID_SIZE=20 multiples
    expect(emitted[0][0].x % 20).toBe(0)
    expect(emitted[0][0].y % 20).toBe(0)
    wrapper.unmount()
  })

  it('registers keydown listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const wrapper = mountCanvas()
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    addSpy.mockRestore()
    wrapper.unmount()
  })

  it('clears selection on Escape key', async () => {
    const wrapper = mountCanvas()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(diagramsState.clearSelection).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('renders CanvasEdge stubs for each edge in store', () => {
    diagramsState.currentEdges = [
      { edgeId: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' },
      { edgeId: 'e2', sourceNodeId: 'n2', targetNodeId: 'n3' },
    ]
    const wrapper = mountCanvas()
    const edges = wrapper.findAllComponents({ name: 'CanvasEdge' })
    expect(edges).toHaveLength(2)
    wrapper.unmount()
  })

  it('renders CanvasNode stubs for each node in store', () => {
    diagramsState.currentNodes = [
      { nodeId: 'n1', x: 0, y: 0, width: 100, height: 60 },
      { nodeId: 'n2', x: 200, y: 100, width: 100, height: 60 },
      { nodeId: 'n3', x: 400, y: 200, width: 100, height: 60 },
    ]
    const wrapper = mountCanvas()
    const nodes = wrapper.findAllComponents({ name: 'CanvasNode' })
    expect(nodes).toHaveLength(3)
    wrapper.unmount()
  })

  it('renders arrowhead marker in defs', () => {
    const wrapper = mountCanvas()
    const marker = wrapper.find('defs marker#arrowhead')
    expect(marker.exists()).toBe(true)
    const attrs = marker.attributes()
    const mw = attrs['markerWidth'] || attrs['markerwidth']
    const mh = attrs['markerHeight'] || attrs['markerheight']
    expect(mw).toBe('10')
    expect(mh).toBe('7')
    wrapper.unmount()
  })

  it('does not render connect preview line when not connecting', () => {
    const wrapper = mountCanvas()
    // The connect preview line has stroke-dasharray="6,3"
    const lines = wrapper.findAll('line')
    const previewLine = lines.filter(
      (l) => l.attributes('stroke-dasharray') === '6,3'
    )
    expect(previewLine).toHaveLength(0)
    wrapper.unmount()
  })
})
