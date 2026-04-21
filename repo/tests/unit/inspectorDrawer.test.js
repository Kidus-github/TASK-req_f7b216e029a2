import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import InspectorDrawer from '@/components/diagrams/InspectorDrawer.vue'
import { useDiagramStore } from '@/stores/diagrams'
import { canvasService } from '@/services/canvasService'
import { diagramService } from '@/services/diagramService'
import { resetDatabase } from './helpers/testHarness'

const OWNER = 'user-1'

async function seedDiagramWithNodeAndEdge() {
  const diagram = await diagramService.create({ title: 'Inspector', ownerUserId: OWNER })
  const node = await canvasService.addNode(
    diagram.diagramId,
    { type: 'action', name: 'Test Node', shortDescription: 'A description', x: 100, y: 200, width: 150, height: 80, color: '#ff0000', icon: 'check', statusStyle: 'draft', ownerTag: 'owner-a', departmentTag: 'dept-b' },
    OWNER
  )
  const secondNode = await canvasService.addNode(
    diagram.diagramId,
    { type: 'end', name: 'End Node', x: 400, y: 200 },
    OWNER
  )
  const edge = await canvasService.addEdge(diagram.diagramId, {
    sourceNodeId: node.nodeId,
    targetNodeId: secondNode.nodeId,
    label: 'Test Edge',
    routingMode: 'orthogonal',
    arrowed: true,
  })
  return { diagram, node, secondNode, edge }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await resetDatabase()
})

describe('InspectorDrawer (integration with real Pinia store and real canvasService)', () => {
  it('shows empty state message when nothing selected', () => {
    const wrapper = mount(InspectorDrawer)
    expect(wrapper.text()).toContain('Select a node or edge to edit properties.')
  })

  it('shows multi-select count when multiple items selected in the real store', async () => {
    const { diagram, node, secondNode } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)
    store.selectNode(secondNode.nodeId, true)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()
    expect(wrapper.text()).toContain('2 items selected.')
  })

  it('hydrates node form fields from the real store when a single node is selected', async () => {
    const { diagram, node } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    expect(wrapper.find('#insp-name').element.value).toBe('Test Node')
    expect(wrapper.find('#insp-desc').element.value).toBe('A description')
    expect(wrapper.find('#insp-owner').element.value).toBe('owner-a')
    expect(wrapper.find('#insp-dept').element.value).toBe('dept-b')
    expect(wrapper.find('.type-badge').text()).toBe('ACTION')
    expect(wrapper.text()).toContain('100, 200')
    expect(wrapper.text()).toContain('150 x 80')
  })

  it('renders status options from the real canvasService.VALID_STATUS_STYLES constant', async () => {
    const { diagram, node } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const statusOptions = wrapper.findAll('#insp-status option').map((o) => o.attributes('value'))
    expect(statusOptions).toEqual(canvasService.VALID_STATUS_STYLES)
  })

  it('hydrates edge form fields when a single edge is selected', async () => {
    const { diagram, edge } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectEdge(edge.edgeId)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    expect(wrapper.find('#insp-edge-label').element.value).toBe('Test Edge')
    expect(wrapper.find('input[type="checkbox"]').element.checked).toBe(true)
  })

  it('disables all editable inputs when editable is false', async () => {
    const { diagram, node } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    const wrapper = mount(InspectorDrawer, { props: { editable: false } })
    await flushPromises()

    for (const id of ['#insp-name', '#insp-desc', '#insp-owner', '#insp-dept', '#insp-color', '#insp-icon', '#insp-status']) {
      expect(wrapper.find(id).element.disabled).toBe(true)
    }
  })

  it('hides Delete Node button when canDelete is false', async () => {
    const { diagram, node } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    const wrapper = mount(InspectorDrawer, { props: { canDelete: false } })
    await flushPromises()
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Delete Node')).toHaveLength(0)
  })

  it('emits update-node with the right payload when the name input changes', async () => {
    const { diagram, node } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const nameInput = wrapper.find('#insp-name')
    await nameInput.setValue('Renamed')
    await nameInput.trigger('change')

    expect(wrapper.emitted('update-node')[0][0]).toEqual({
      nodeId: node.nodeId,
      updates: { name: 'Renamed' },
    })
  })

  it('emits update-edge when the edge label input changes', async () => {
    const { diagram, edge } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectEdge(edge.edgeId)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const labelInput = wrapper.find('#insp-edge-label')
    await labelInput.setValue('Next Step')
    await labelInput.trigger('change')

    expect(wrapper.emitted('update-edge')[0][0]).toEqual({
      edgeId: edge.edgeId,
      updates: { label: 'Next Step' },
    })
  })

  it('emits delete-node and delete-edge with the selection from the real store', async () => {
    const { diagram, node, edge } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    let wrapper = mount(InspectorDrawer)
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Delete Node').trigger('click')
    expect(wrapper.emitted('delete-node')[0][0]).toBe(node.nodeId)

    store.selectEdge(edge.edgeId)
    wrapper = mount(InspectorDrawer)
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Delete Edge').trigger('click')
    expect(wrapper.emitted('delete-edge')[0][0]).toBe(edge.edgeId)
  })

  it('applies persona labels in the guidance text', async () => {
    let wrapper = mount(InspectorDrawer, { props: { personaLabel: 'Reviewer' } })
    expect(wrapper.text()).toContain('Reviewer editing controls are active.')

    wrapper = mount(InspectorDrawer, { props: { personaLabel: 'Reviewer', editable: false } })
    expect(wrapper.text()).toContain('Reviewer view keeps editing controls read-only.')
  })

  it('renders a Remove Image button and emits remove-image for the selected node when an image is attached', async () => {
    const { diagram, node } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    // Attach an image id directly to the persisted node so the drawer sees it.
    await canvasService.updateNode(node.nodeId, { imageId: 'img-1', embeddedImageName: 'sketch.png' }, OWNER)
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()
    const removeBtn = wrapper.findAll('button').find((b) => b.text() === 'Remove Image')
    expect(removeBtn).toBeTruthy()
    await removeBtn.trigger('click')
    expect(wrapper.emitted('remove-image')[0][0]).toBe(node.nodeId)
  })

  it('hides Remove Image button when editable is false even if an image is attached', async () => {
    const { diagram, node } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await canvasService.updateNode(node.nodeId, { imageId: 'img-2', embeddedImageName: 'other.png' }, OWNER)
    await store.openDiagram(diagram.diagramId)
    store.selectNode(node.nodeId)

    const wrapper = mount(InspectorDrawer, { props: { editable: false } })
    await flushPromises()
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Remove Image')).toHaveLength(0)
  })

  it('toggles routing-mode buttons by flipping edgeForm.routingMode', async () => {
    const { diagram, edge } = await seedDiagramWithNodeAndEdge()
    const store = useDiagramStore()
    await store.openDiagram(diagram.diagramId)
    store.selectEdge(edge.edgeId)

    const wrapper = mount(InspectorDrawer)
    await flushPromises()

    const curveBtn = wrapper.findAll('button').find((b) => b.text() === 'Curve')
    await curveBtn.trigger('click')
    expect(wrapper.emitted('update-edge')[0][0]).toEqual({
      edgeId: edge.edgeId,
      updates: { routingMode: 'curve' },
    })
  })
})
