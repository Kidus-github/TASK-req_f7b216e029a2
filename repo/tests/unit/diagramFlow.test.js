import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { versionService } from '@/services/versionService'
import { publishService } from '@/services/publishService'

const OWNER = 'test-owner'

beforeEach(async () => {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of ['diagrams', 'nodes', 'edges', 'snapshots', 'traceability', 'publishEvents', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch { /* */ }
  }
})

describe('diagram CRUD', () => {
  it('creates a diagram in draft status', async () => {
    const d = await diagramService.create({ title: 'My SOP', ownerUserId: OWNER })
    expect(d.diagramId).toBeTruthy()
    expect(d.title).toBe('My SOP')
    expect(d.status).toBe('draft')
  })

  it('rejects empty title', async () => {
    await expect(diagramService.create({ title: '', ownerUserId: OWNER })).rejects.toThrow('Title is required')
  })

  it('updates diagram title', async () => {
    const d = await diagramService.create({ title: 'Old', ownerUserId: OWNER })
    const updated = await diagramService.update(d.diagramId, { title: 'New' }, OWNER)
    expect(updated.title).toBe('New')
  })

  it('retrieves diagram by ID', async () => {
    const d = await diagramService.create({ title: 'Find Me', ownerUserId: OWNER })
    const found = await diagramService.getById(d.diagramId)
    expect(found.title).toBe('Find Me')
  })

  it('deletes diagram and cascades to nodes/edges', async () => {
    const d = await diagramService.create({ title: 'Del', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, OWNER)
    await diagramService.deleteDiagram(d.diagramId, OWNER)
    const found = await diagramService.getById(d.diagramId)
    expect(found).toBeUndefined()
    const nodes = await diagramService.getNodes(d.diagramId)
    expect(nodes.length).toBe(0)
  })
})

describe('node and edge operations', () => {
  it('adds nodes up to cap', async () => {
    const d = await diagramService.create({ title: 'Nodes', ownerUserId: OWNER })
    const n = await canvasService.addNode(d.diagramId, { type: 'action', name: 'Step 1', x: 0, y: 0 }, OWNER)
    expect(n.nodeId).toBeTruthy()
    expect(n.type).toBe('action')
  })

  it('rejects invalid node type', async () => {
    const d = await diagramService.create({ title: 'BadType', ownerUserId: OWNER })
    await expect(
      canvasService.addNode(d.diagramId, { type: 'invalid', name: 'X', x: 0, y: 0 }, OWNER)
    ).rejects.toThrow('Invalid node type')
  })

  it('rejects self-loop edges', async () => {
    const d = await diagramService.create({ title: 'Loop', ownerUserId: OWNER })
    const n = await canvasService.addNode(d.diagramId, { type: 'action', name: 'A', x: 0, y: 0 }, OWNER)
    await expect(
      canvasService.addEdge(d.diagramId, { sourceNodeId: n.nodeId, targetNodeId: n.nodeId })
    ).rejects.toThrow('Self-loop')
  })

  it('creates edge between two nodes', async () => {
    const d = await diagramService.create({ title: 'Edge', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(d.diagramId, { type: 'start', name: 'A', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(d.diagramId, { type: 'end', name: 'B', x: 100, y: 0 }, OWNER)
    const edge = await canvasService.addEdge(d.diagramId, { sourceNodeId: n1.nodeId, targetNodeId: n2.nodeId })
    expect(edge.edgeId).toBeTruthy()
    expect(edge.routingMode).toBe('orthogonal')
  })

  it('deletes node and cascading edges atomically', async () => {
    const d = await diagramService.create({ title: 'Cascade', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(d.diagramId, { type: 'start', name: 'A', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(d.diagramId, { type: 'end', name: 'B', x: 100, y: 0 }, OWNER)
    await canvasService.addEdge(d.diagramId, { sourceNodeId: n1.nodeId, targetNodeId: n2.nodeId })

    const result = await canvasService.deleteNode(n1.nodeId, d.diagramId, OWNER)
    expect(result.deletedNode.nodeId).toBe(n1.nodeId)
    expect(result.deletedEdges.length).toBe(1)

    const remainingEdges = await canvasService.getEdges(d.diagramId)
    expect(remainingEdges.length).toBe(0)
  })
})

describe('versioning', () => {
  it('creates a snapshot and increments version', async () => {
    const d = await diagramService.create({ title: 'Versioned', ownerUserId: OWNER })
    const { snapshot, diagram } = await versionService.createSnapshot(d.diagramId, 'manual', OWNER)
    expect(snapshot.versionNumber).toBe(2)
    expect(diagram.currentVersionNumber).toBe(2)
  })

  it('rollback restores previous state as a new version', async () => {
    const d = await diagramService.create({ title: 'Rollback', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, { type: 'start', name: 'Before', x: 0, y: 0 }, OWNER)
    const { snapshot: snap1 } = await versionService.createSnapshot(d.diagramId, 'manual', OWNER)

    await canvasService.addNode(d.diagramId, { type: 'end', name: 'After', x: 100, y: 0 }, OWNER)
    await versionService.createSnapshot(d.diagramId, 'manual', OWNER)

    const result = await versionService.rollback(d.diagramId, snap1.snapshotId, OWNER)
    expect(result.nodes.length).toBe(1)
    expect(result.nodes[0].name).toBe('Before')
    expect(result.diagram.currentVersionNumber).toBeGreaterThan(2)
  })
})

describe('publish validation', () => {
  it('fails publish with no nodes', async () => {
    const d = await diagramService.create({ title: 'Empty', ownerUserId: OWNER })
    const errors = await publishService.validateForPublish(d.diagramId)
    expect(errors.some(e => e.code === 'NO_NODES')).toBe(true)
  })

  it('fails publish without start node', async () => {
    const d = await diagramService.create({ title: 'NoStart', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, { type: 'end', name: 'E', x: 0, y: 0 }, OWNER)
    const errors = await publishService.validateForPublish(d.diagramId)
    expect(errors.some(e => e.code === 'NO_START')).toBe(true)
  })

  it('fails publish without end node', async () => {
    const d = await diagramService.create({ title: 'NoEnd', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, OWNER)
    const errors = await publishService.validateForPublish(d.diagramId)
    expect(errors.some(e => e.code === 'NO_END')).toBe(true)
  })

  it('passes with valid connected start and end nodes', async () => {
    const d = await diagramService.create({ title: 'Valid', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(d.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(d.diagramId, { type: 'end', name: 'E', x: 100, y: 0 }, OWNER)
    await canvasService.addEdge(d.diagramId, { sourceNodeId: n1.nodeId, targetNodeId: n2.nodeId })
    const errors = await publishService.validateForPublish(d.diagramId)
    expect(errors.length).toBe(0)
  })
})

describe('lifecycle transitions', () => {
  it('transitions draft to published', async () => {
    const d = await diagramService.create({ title: 'Pub', ownerUserId: OWNER })
    const updated = await diagramService.transitionStatus(d.diagramId, 'published', OWNER)
    expect(updated.status).toBe('published')
  })

  it('rejects direct draft to retracted', async () => {
    const d = await diagramService.create({ title: 'Bad', ownerUserId: OWNER })
    await expect(
      diagramService.transitionStatus(d.diagramId, 'retracted', OWNER, 'some long reason here')
    ).rejects.toThrow('Cannot transition')
  })

  it('requires reason for retraction (min 10 chars)', async () => {
    const d = await diagramService.create({ title: 'Retract', ownerUserId: OWNER })
    await diagramService.transitionStatus(d.diagramId, 'published', OWNER)
    await expect(
      diagramService.transitionStatus(d.diagramId, 'retracted', OWNER, 'short')
    ).rejects.toThrow('at least 10')
  })

  it('retracts published diagram with valid reason', async () => {
    const d = await diagramService.create({ title: 'Retract OK', ownerUserId: OWNER })
    await diagramService.transitionStatus(d.diagramId, 'published', OWNER)
    const retracted = await diagramService.transitionStatus(
      d.diagramId, 'retracted', OWNER, 'This SOP is outdated and needs revision.'
    )
    expect(retracted.status).toBe('retracted')
    expect(retracted.retractionReason).toBeTruthy()
  })
})
