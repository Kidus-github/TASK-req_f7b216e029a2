import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const diagramsState = {
  selectedNodeIds: [],
  selectedEdgeIds: [],
  currentNodes: [],
  currentEdges: [],
}

vi.mock('@/stores/diagrams', () => ({
  useDiagramStore: () => diagramsState,
}))

vi.mock('@/services/canvasService', () => ({
  canvasService: {
    VALID_STATUS_STYLES: ['default', 'draft', 'approved', 'warning', 'blocked'],
  },
}))

import InspectorDrawer from '../src/components/diagrams/InspectorDrawer.vue'

function makeNode(overrides = {}) {
  return {
    nodeId: 'node-1',
    name: 'Test Node',
    shortDescription: 'A description',
    ownerTag: 'owner-a',
    departmentTag: 'dept-b',
    color: '#ff0000',
    icon: 'check',
    statusStyle: 'draft',
    imageId: null,
    imageAlt: '',
    embeddedImageName: '',
    type: 'process',
    x: 100,
    y: 200,
    width: 150,
    height: 80,
    ...overrides,
  }
}

function makeEdge(overrides = {}) {
  return {
    edgeId: 'edge-1',
    label: 'Test Edge',
    routingMode: 'orthogonal',
    arrowed: true,
    ...overrides,
  }
}

function resetState() {
  diagramsState.selectedNodeIds = []
  diagramsState.selectedEdgeIds = []
  diagramsState.currentNodes = []
  diagramsState.currentEdges = []
}

describe('InspectorDrawer', () => {
  beforeEach(() => {
    resetState()
  })

  // 1. Empty state
  it('shows empty state message when nothing selected', () => {
    const wrapper = mount(InspectorDrawer)
    expect(wrapper.text()).toContain('Select a node or edge to edit properties.')
  })

  // 2. Multi-select count
  it('shows multi-select count when multiple items selected', async () => {
    diagramsState.selectedNodeIds = ['node-1', 'node-2']
    diagramsState.currentNodes = [makeNode({ nodeId: 'node-1' }), makeNode({ nodeId: 'node-2' })]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()
    expect(wrapper.text()).toContain('2 items selected.')
  })

  it('shows multi-select count when nodes and edges both selected', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.selectedEdgeIds = ['edge-1']
    diagramsState.currentNodes = [makeNode()]
    diagramsState.currentEdges = [makeEdge()]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()
    expect(wrapper.text()).toContain('2 items selected.')
  })

  // 3. Single node inspector
  it('shows node inspector when single node selected', async () => {
    const node = makeNode()
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [node]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const nameInput = wrapper.find('#insp-name')
    expect(nameInput.exists()).toBe(true)
    expect(nameInput.element.value).toBe('Test Node')

    const descInput = wrapper.find('#insp-desc')
    expect(descInput.exists()).toBe(true)
    expect(descInput.element.value).toBe('A description')
  })

  // 4. Single edge inspector
  it('shows edge inspector when single edge selected', async () => {
    const edge = makeEdge()
    diagramsState.selectedEdgeIds = ['edge-1']
    diagramsState.currentEdges = [edge]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const labelInput = wrapper.find('#insp-edge-label')
    expect(labelInput.exists()).toBe(true)
    expect(labelInput.element.value).toBe('Test Edge')
  })

  // 5. Disables inputs when editable=false
  it('disables inputs when editable is false', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [makeNode()]

    const wrapper = mount(InspectorDrawer, { props: { editable: false } })
    await flushPromises()

    expect(wrapper.find('#insp-name').element.disabled).toBe(true)
    expect(wrapper.find('#insp-desc').element.disabled).toBe(true)
    expect(wrapper.find('#insp-owner').element.disabled).toBe(true)
    expect(wrapper.find('#insp-dept').element.disabled).toBe(true)
    expect(wrapper.find('#insp-color').element.disabled).toBe(true)
    expect(wrapper.find('#insp-icon').element.disabled).toBe(true)
    expect(wrapper.find('#insp-status').element.disabled).toBe(true)
  })

  // 6. Hides delete button when canDelete=false
  it('hides delete button when canDelete is false', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [makeNode()]

    const wrapper = mount(InspectorDrawer, { props: { canDelete: false } })
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').filter((b) => b.text() === 'Delete Node')
    expect(deleteBtn.length).toBe(0)
  })

  // 7. Shows delete button when canDelete=true
  it('shows delete button when canDelete is true', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [makeNode()]

    const wrapper = mount(InspectorDrawer, { props: { canDelete: true } })
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').filter((b) => b.text() === 'Delete Node')
    expect(deleteBtn.length).toBe(1)
  })

  // 8. Emits update-node on name input change
  it('emits update-node on name input change', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [makeNode()]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const nameInput = wrapper.find('#insp-name')
    await nameInput.setValue('Updated Name')
    await nameInput.trigger('change')

    expect(wrapper.emitted('update-node')).toBeTruthy()
    expect(wrapper.emitted('update-node')[0][0]).toEqual({
      nodeId: 'node-1',
      updates: { name: 'Updated Name' },
    })
  })

  // 9. Emits update-edge on label input change
  it('emits update-edge on label input change', async () => {
    diagramsState.selectedEdgeIds = ['edge-1']
    diagramsState.currentEdges = [makeEdge()]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const labelInput = wrapper.find('#insp-edge-label')
    await labelInput.setValue('Updated Label')
    await labelInput.trigger('change')

    expect(wrapper.emitted('update-edge')).toBeTruthy()
    expect(wrapper.emitted('update-edge')[0][0]).toEqual({
      edgeId: 'edge-1',
      updates: { label: 'Updated Label' },
    })
  })

  // 10. Emits delete-node on delete button click
  it('emits delete-node on delete button click', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [makeNode()]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === 'Delete Node')
    await deleteBtn.trigger('click')

    expect(wrapper.emitted('delete-node')).toBeTruthy()
    expect(wrapper.emitted('delete-node')[0][0]).toBe('node-1')
  })

  // 11. Emits delete-edge on delete button click
  it('emits delete-edge on delete button click', async () => {
    diagramsState.selectedEdgeIds = ['edge-1']
    diagramsState.currentEdges = [makeEdge()]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === 'Delete Edge')
    await deleteBtn.trigger('click')

    expect(wrapper.emitted('delete-edge')).toBeTruthy()
    expect(wrapper.emitted('delete-edge')[0][0]).toBe('edge-1')
  })

  // 12. Shows correct persona label in guidance text
  it('shows correct persona label in guidance text', () => {
    const wrapper = mount(InspectorDrawer, { props: { personaLabel: 'Reviewer' } })
    expect(wrapper.text()).toContain('Reviewer editing controls are active.')
  })

  it('shows read-only persona guidance when not editable', () => {
    const wrapper = mount(InspectorDrawer, { props: { personaLabel: 'Reviewer', editable: false } })
    expect(wrapper.text()).toContain('Reviewer view keeps editing controls read-only.')
  })

  // 13. Shows node type badge
  it('shows node type badge', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [makeNode({ type: 'process' })]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const badge = wrapper.find('.type-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('PROCESS')
  })

  // 14. Shows position and size info
  it('shows position and size info', async () => {
    diagramsState.selectedNodeIds = ['node-1']
    diagramsState.currentNodes = [makeNode({ x: 123.7, y: 456.2, width: 150, height: 80 })]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    expect(wrapper.text()).toContain('124, 456')
    expect(wrapper.text()).toContain('150 x 80')
  })

  // 15. Shows routing mode buttons for edge
  it('shows routing mode buttons for edge', async () => {
    diagramsState.selectedEdgeIds = ['edge-1']
    diagramsState.currentEdges = [makeEdge()]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const orthBtn = buttons.find((b) => b.text() === 'Orthogonal')
    const curveBtn = buttons.find((b) => b.text() === 'Curve')

    expect(orthBtn).toBeTruthy()
    expect(curveBtn).toBeTruthy()
  })

  // 16. Shows arrowed checkbox for edge
  it('shows arrowed checkbox for edge', async () => {
    diagramsState.selectedEdgeIds = ['edge-1']
    diagramsState.currentEdges = [makeEdge({ arrowed: true })]

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const checkbox = wrapper.find('input[type="checkbox"]')
    expect(checkbox.exists()).toBe(true)
    expect(checkbox.element.checked).toBe(true)
    expect(wrapper.text()).toContain('Show arrowhead')
  })
})
