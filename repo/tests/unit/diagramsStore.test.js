import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useDiagramStore } from '@/stores/diagrams'
import { diagramService } from '@/services/diagramService'

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await clearDB()
})

describe('diagrams store', () => {
  it('starts with empty lists and no current selection', () => {
    const store = useDiagramStore()
    expect(store.diagrams).toEqual([])
    expect(store.currentDiagram).toBeNull()
    expect(store.currentNodes).toEqual([])
    expect(store.currentEdges).toEqual([])
    expect(store.selectedNodeIds).toEqual([])
    expect(store.selectedEdgeIds).toEqual([])
    expect(store.isDirty).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.draftDiagrams).toEqual([])
    expect(store.publishedDiagrams).toEqual([])
  })

  it('loadUserDiagrams populates diagrams for the given owner', async () => {
    await diagramService.create({ title: 'Mine A', ownerUserId: 'user-a' })
    await diagramService.create({ title: 'Mine B', ownerUserId: 'user-a' })
    await diagramService.create({ title: 'Other', ownerUserId: 'user-b' })

    const store = useDiagramStore()
    await store.loadUserDiagrams('user-a')

    expect(store.diagrams).toHaveLength(2)
    expect(store.diagrams.map((d) => d.title).sort()).toEqual(['Mine A', 'Mine B'])
  })

  it('createDiagram appends to the store list and persists', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Created', ownerUserId: 'u-1' })
    expect(store.diagrams).toHaveLength(1)
    expect(store.diagrams[0].diagramId).toBe(diagram.diagramId)
    expect(store.draftDiagrams).toHaveLength(1)
  })

  it('updateDiagram updates list entry and currentDiagram if it matches', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'First', ownerUserId: 'u-1' })
    store.currentDiagram = { ...diagram }

    const updated = await store.updateDiagram(diagram.diagramId, { title: 'Renamed' }, 'u-1')
    expect(updated.title).toBe('Renamed')
    expect(store.diagrams[0].title).toBe('Renamed')
    expect(store.currentDiagram.title).toBe('Renamed')
  })

  it('transitionStatus publishes a draft and updates state', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Pub', ownerUserId: 'u-1' })
    store.currentDiagram = { ...diagram }

    const pub = await store.transitionStatus(diagram.diagramId, 'published', 'u-1')
    expect(pub.status).toBe('published')
    expect(store.diagrams[0].status).toBe('published')
    expect(store.publishedDiagrams).toHaveLength(1)
    expect(store.draftDiagrams).toHaveLength(0)
  })

  it('openDiagram loads the diagram, its nodes, edges, and images', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Open Me', ownerUserId: 'u-1' })

    const { canvasService } = await import('@/services/canvasService')
    const node = await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'S', x: 10, y: 20 }, 'u-1')
    const node2 = await canvasService.addNode(diagram.diagramId, { type: 'end', name: 'E', x: 200, y: 20 }, 'u-1')
    await canvasService.addEdge(diagram.diagramId, { sourceNodeId: node.nodeId, targetNodeId: node2.nodeId })

    const opened = await store.openDiagram(diagram.diagramId)
    expect(opened.diagramId).toBe(diagram.diagramId)
    expect(store.currentDiagram.diagramId).toBe(diagram.diagramId)
    expect(store.currentNodes).toHaveLength(2)
    expect(store.currentEdges).toHaveLength(1)
  })

  it('deleteDiagram removes from list and resets current when it matches', async () => {
    const store = useDiagramStore()
    const a = await store.createDiagram({ title: 'A', ownerUserId: 'u-1' })
    const b = await store.createDiagram({ title: 'B', ownerUserId: 'u-1' })
    await store.openDiagram(a.diagramId)

    await store.deleteDiagram(a.diagramId, 'u-1')
    expect(store.diagrams.map((d) => d.title)).toEqual(['B'])
    expect(store.currentDiagram).toBeNull()
    expect(store.currentNodes).toEqual([])
    expect(store.currentEdges).toEqual([])
  })

  it('closeDiagram clears current state and selections', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'C', ownerUserId: 'u-1' })
    await store.openDiagram(diagram.diagramId)
    store.selectedNodeIds = ['n1']
    store.selectedEdgeIds = ['e1']
    store.isDirty = true

    store.closeDiagram()

    expect(store.currentDiagram).toBeNull()
    expect(store.currentNodes).toEqual([])
    expect(store.currentEdges).toEqual([])
    expect(store.selectedNodeIds).toEqual([])
    expect(store.selectedEdgeIds).toEqual([])
    expect(store.isDirty).toBe(false)
  })

  it('addNode appends a node, marks dirty, and is retrievable via the store', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Add', ownerUserId: 'u-1' })
    await store.openDiagram(diagram.diagramId)

    const node = await store.addNode({ type: 'action', name: 'Do Thing', x: 100, y: 100 }, 'u-1')
    expect(node.nodeId).toBeTruthy()
    expect(store.currentNodes).toHaveLength(1)
    expect(store.currentNodes[0].name).toBe('Do Thing')
    expect(store.isDirty).toBe(true)
  })

  it('addNode throws when no diagram is open', async () => {
    const store = useDiagramStore()
    await expect(
      store.addNode({ type: 'action', name: 'X', x: 0, y: 0 }, 'u-1')
    ).rejects.toThrow('No diagram open.')
  })

  it('selectNode single selection replaces, multi selection toggles', async () => {
    const store = useDiagramStore()
    store.selectNode('a')
    expect(store.selectedNodeIds).toEqual(['a'])

    store.selectNode('b')
    expect(store.selectedNodeIds).toEqual(['b'])

    store.selectNode('a', true)
    expect(store.selectedNodeIds).toEqual(['b', 'a'])

    // toggling off
    store.selectNode('a', true)
    expect(store.selectedNodeIds).toEqual(['b'])
  })

  it('selectEdge single selection clears node selection', async () => {
    const store = useDiagramStore()
    store.selectNode('n1')
    store.selectEdge('e1')
    expect(store.selectedEdgeIds).toEqual(['e1'])
    expect(store.selectedNodeIds).toEqual([])

    store.selectEdge('e2', true)
    expect(store.selectedEdgeIds).toEqual(['e1', 'e2'])
    store.selectEdge('e1', true)
    expect(store.selectedEdgeIds).toEqual(['e2'])
  })

  it('clearSelection wipes node and edge selection', () => {
    const store = useDiagramStore()
    store.selectedNodeIds = ['x']
    store.selectedEdgeIds = ['y']
    store.clearSelection()
    expect(store.selectedNodeIds).toEqual([])
    expect(store.selectedEdgeIds).toEqual([])
  })

  it('updateNodeLocal updates a node in place and marks dirty', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Local', ownerUserId: 'u-1' })
    await store.openDiagram(diagram.diagramId)
    const node = await store.addNode({ type: 'action', name: 'A', x: 0, y: 0 }, 'u-1')
    store.isDirty = false

    store.updateNodeLocal(node.nodeId, { x: 50 })
    expect(store.currentNodes[0].x).toBe(50)
    expect(store.isDirty).toBe(true)
  })

  it('selectNodesInRect selects nodes fully inside rect and excludes others', async () => {
    const store = useDiagramStore()
    store.currentNodes = [
      { nodeId: 'in', x: 10, y: 10, width: 20, height: 20 },
      { nodeId: 'out', x: 100, y: 100, width: 20, height: 20 },
    ]
    store.selectNodesInRect({ x: 0, y: 0, width: 50, height: 50 })
    expect(store.selectedNodeIds).toEqual(['in'])
  })

  it('loadPublishedDiagrams merges without duplicates', async () => {
    const store = useDiagramStore()
    const d1 = await store.createDiagram({ title: 'D1', ownerUserId: 'u-1' })
    await store.transitionStatus(d1.diagramId, 'published', 'u-1')

    store.diagrams = []
    await store.loadPublishedDiagrams()
    expect(store.diagrams).toHaveLength(1)

    await store.loadPublishedDiagrams()
    expect(store.diagrams).toHaveLength(1)
  })

  it('loadAllDiagrams pulls every diagram across owners', async () => {
    const store = useDiagramStore()
    await store.createDiagram({ title: 'A', ownerUserId: 'u-1' })
    await store.createDiagram({ title: 'B', ownerUserId: 'u-2' })
    store.diagrams = []
    await store.loadAllDiagrams()
    expect(store.diagrams.map((d) => d.title).sort()).toEqual(['A', 'B'])
  })

  it('addEdge / updateEdgeInStore / deleteEdgeFromStore / restoreEdge round-trip', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Edges', ownerUserId: 'u-1' })
    await store.openDiagram(diagram.diagramId)
    const a = await store.addNode({ type: 'start', name: 'A', x: 0, y: 0 }, 'u-1')
    const b = await store.addNode({ type: 'end', name: 'B', x: 100, y: 0 }, 'u-1')

    const edge = await store.addEdge({ sourceNodeId: a.nodeId, targetNodeId: b.nodeId })
    expect(store.currentEdges).toHaveLength(1)

    const updated = await store.updateEdgeInStore(edge.edgeId, { label: 'flow' })
    expect(updated.label).toBe('flow')
    expect(store.currentEdges[0].label).toBe('flow')

    const deleted = await store.deleteEdgeFromStore(edge.edgeId)
    expect(store.currentEdges).toHaveLength(0)
    expect(deleted.edgeId).toBe(edge.edgeId)

    await store.restoreEdge(deleted)
    expect(store.currentEdges).toHaveLength(1)
  })

  it('addEdge throws when no diagram is open', async () => {
    const store = useDiagramStore()
    await expect(
      store.addEdge({ sourceNodeId: 'a', targetNodeId: 'b' })
    ).rejects.toThrow('No diagram open.')
  })

  it('deleteNodeWithEdges removes connected edges and selections', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Del', ownerUserId: 'u-1' })
    await store.openDiagram(diagram.diagramId)
    const a = await store.addNode({ type: 'start', name: 'A', x: 0, y: 0 }, 'u-1')
    const b = await store.addNode({ type: 'end', name: 'B', x: 100, y: 0 }, 'u-1')
    await store.addEdge({ sourceNodeId: a.nodeId, targetNodeId: b.nodeId })

    store.selectedNodeIds = [a.nodeId]
    const result = await store.deleteNodeWithEdges(a.nodeId, 'u-1')
    expect(result.deletedEdges).toHaveLength(1)
    expect(store.currentNodes.map((n) => n.nodeId)).toEqual([b.nodeId])
    expect(store.currentEdges).toEqual([])
    expect(store.selectedNodeIds).toEqual([])
  })

  it('deleteNodeWithEdges throws when no diagram is open', async () => {
    const store = useDiagramStore()
    await expect(store.deleteNodeWithEdges('nope', 'u-1')).rejects.toThrow('No diagram open.')
  })

  it('restoreNodeWithEdges re-adds the node and its edges back to the store', async () => {
    const store = useDiagramStore()
    const diagram = await store.createDiagram({ title: 'Rest', ownerUserId: 'u-1' })
    await store.openDiagram(diagram.diagramId)
    const a = await store.addNode({ type: 'start', name: 'A', x: 0, y: 0 }, 'u-1')
    const b = await store.addNode({ type: 'end', name: 'B', x: 100, y: 0 }, 'u-1')
    const edge = await store.addEdge({ sourceNodeId: a.nodeId, targetNodeId: b.nodeId })

    const result = await store.deleteNodeWithEdges(a.nodeId, 'u-1')
    expect(store.currentNodes).toHaveLength(1)

    await store.restoreNodeWithEdges(result.deletedNode, result.deletedEdges)
    expect(store.currentNodes).toHaveLength(2)
    expect(store.currentEdges).toHaveLength(1)
  })
})
