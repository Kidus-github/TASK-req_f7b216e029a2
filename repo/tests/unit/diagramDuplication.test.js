import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'

const OWNER = 'test-owner-id'

beforeEach(async () => {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of ['diagrams', 'nodes', 'edges', 'snapshots', 'traceability', 'publishEvents']) {
    const tx = db.transaction(store, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
})

describe('diagram deep duplication', () => {
  it('creates a new diagram with copied title', async () => {
    const original = await diagramService.create({ title: 'Original Flow', ownerUserId: OWNER })
    const copy = await diagramService.create({
      title: original.title + ' (copy)',
      description: original.description,
      ownerUserId: OWNER,
    })
    expect(copy.title).toBe('Original Flow (copy)')
    expect(copy.diagramId).not.toBe(original.diagramId)
    expect(copy.status).toBe('draft')
  })

  it('can clone nodes with new IDs into the new diagram', async () => {
    const original = await diagramService.create({ title: 'Source', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(original.diagramId, { type: 'start', name: 'Begin', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(original.diagramId, { type: 'end', name: 'Finish', x: 200, y: 0 }, OWNER)

    // Simulate duplication by creating new diagram and cloning nodes
    const copy = await diagramService.create({ title: 'Source (copy)', ownerUserId: OWNER })
    const { getDB } = await import('@/db/schema')
    const { generateId } = await import('@/utils/id')
    const db = await getDB()

    const oldToNew = new Map()
    for (const node of [n1, n2]) {
      const newId = generateId()
      oldToNew.set(node.nodeId, newId)
      await db.put('nodes', {
        ...node,
        nodeId: newId,
        diagramId: copy.diagramId,
        traceabilityCode: null,
      })
    }

    const copyNodes = await diagramService.getNodes(copy.diagramId)
    expect(copyNodes.length).toBe(2)
    expect(copyNodes.find(n => n.name === 'Begin')).toBeTruthy()
    expect(copyNodes.find(n => n.name === 'Finish')).toBeTruthy()
    // IDs must differ from originals
    const copyIds = new Set(copyNodes.map(n => n.nodeId))
    expect(copyIds.has(n1.nodeId)).toBe(false)
    expect(copyIds.has(n2.nodeId)).toBe(false)
  })

  it('can clone edges with remapped node IDs', async () => {
    const original = await diagramService.create({ title: 'WithEdges', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(original.diagramId, { type: 'start', name: 'A', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(original.diagramId, { type: 'end', name: 'B', x: 100, y: 0 }, OWNER)
    const edge = await canvasService.addEdge(original.diagramId, { sourceNodeId: n1.nodeId, targetNodeId: n2.nodeId })

    const copy = await diagramService.create({ title: 'WithEdges (copy)', ownerUserId: OWNER })
    const { getDB } = await import('@/db/schema')
    const { generateId } = await import('@/utils/id')
    const db = await getDB()

    const oldToNew = new Map()
    for (const node of [n1, n2]) {
      const newId = generateId()
      oldToNew.set(node.nodeId, newId)
      await db.put('nodes', { ...node, nodeId: newId, diagramId: copy.diagramId })
    }

    await db.put('edges', {
      ...edge,
      edgeId: generateId(),
      diagramId: copy.diagramId,
      sourceNodeId: oldToNew.get(edge.sourceNodeId),
      targetNodeId: oldToNew.get(edge.targetNodeId),
    })

    const copyEdges = await diagramService.getEdges(copy.diagramId)
    expect(copyEdges.length).toBe(1)
    expect(copyEdges[0].edgeId).not.toBe(edge.edgeId)
    expect(copyEdges[0].sourceNodeId).toBe(oldToNew.get(n1.nodeId))
    expect(copyEdges[0].targetNodeId).toBe(oldToNew.get(n2.nodeId))
  })
})
