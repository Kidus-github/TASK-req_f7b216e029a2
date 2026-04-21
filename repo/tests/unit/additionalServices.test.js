import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { auditService } from '@/services/auditService'
import { canvasService } from '@/services/canvasService'
import { concurrencyService } from '@/services/concurrencyService'
import { diagramService } from '@/services/diagramService'
import { inspectionService } from '@/services/inspectionService'
import { publishService } from '@/services/publishService'
import { traceabilityService } from '@/services/traceabilityService'

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
  await clearDB()
})

describe('auditService', () => {
  it('logs an event with sensible defaults', async () => {
    const event = await auditService.log({ actionType: 'test_action' })
    expect(event.actionType).toBe('test_action')
    expect(event.entityType).toBe('system')
    expect(event.entityId).toBeNull()
    expect(event.actedAt).toBeTruthy()
  })

  it('returns events scoped to a single entity', async () => {
    await auditService.log({ entityType: 'diagram', entityId: 'd-1', actionType: 'a' })
    await auditService.log({ entityType: 'diagram', entityId: 'd-1', actionType: 'b' })
    await auditService.log({ entityType: 'diagram', entityId: 'd-2', actionType: 'c' })
    const events = await auditService.getByEntity('diagram', 'd-1')
    expect(events.map((e) => e.actionType).sort()).toEqual(['a', 'b'])
  })

  it('returns events scoped to an actor', async () => {
    await auditService.log({ actionType: 'x', actedByUserId: 'u-1' })
    await auditService.log({ actionType: 'y', actedByUserId: 'u-1' })
    await auditService.log({ actionType: 'z', actedByUserId: 'u-2' })
    const u1Events = await auditService.getByActor('u-1')
    expect(u1Events.map((e) => e.actionType).sort()).toEqual(['x', 'y'])
  })

  it('getRecent returns events sorted descending and capped to limit', async () => {
    for (let i = 0; i < 5; i++) {
      await auditService.log({ actionType: `a-${i}`, actedByUserId: 'u' })
      await new Promise((r) => setTimeout(r, 2))
    }
    const recent = await auditService.getRecent(3)
    expect(recent).toHaveLength(3)
    expect(recent[0].actionType).toBe('a-4')
  })
})

describe('canvasService validation paths', () => {
  it('rejects nodes with invalid types', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    await expect(
      canvasService.addNode(d.diagramId, { type: 'banana', name: 'X' }, 'u')
    ).rejects.toThrow('Invalid node type: banana')
  })

  it('rejects empty node names', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    await expect(
      canvasService.addNode(d.diagramId, { type: 'action', name: '   ' }, 'u')
    ).rejects.toThrow('Node name is required.')
  })

  it('rejects oversized node names', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    await expect(
      canvasService.addNode(d.diagramId, { type: 'action', name: 'x'.repeat(121) }, 'u')
    ).rejects.toThrow('Node name must be at most 120 characters.')
  })

  it('updateNode validates fields and persists changes', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    const node = await canvasService.addNode(d.diagramId, { type: 'action', name: 'A' }, 'u')

    const updated = await canvasService.updateNode(node.nodeId, {
      name: 'B',
      shortDescription: 'desc',
      ownerTag: 'team',
      departmentTag: 'ops',
      x: 99, y: 88, width: 200, height: 150,
      color: '#000', icon: 'star', statusStyle: 'approved',
      imageId: null, imageAlt: 'alt',
    })
    expect(updated.name).toBe('B')
    expect(updated.shortDescription).toBe('desc')
    expect(updated.ownerTag).toBe('team')
    expect(updated.statusStyle).toBe('approved')
    expect(updated.x).toBe(99)
  })

  it('updateNode throws when missing', async () => {
    await expect(canvasService.updateNode('nope', { name: 'x' })).rejects.toThrow('Node not found.')
  })

  it('updateNode rejects empty name', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    const node = await canvasService.addNode(d.diagramId, { type: 'action', name: 'A' }, 'u')
    await expect(canvasService.updateNode(node.nodeId, { name: '   ' })).rejects.toThrow(
      'Node name is required.'
    )
  })

  it('addEdge rejects self-loops and duplicate edges', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    const a = await canvasService.addNode(d.diagramId, { type: 'start', name: 'A' }, 'u')
    const b = await canvasService.addNode(d.diagramId, { type: 'end', name: 'B' }, 'u')

    await expect(canvasService.addEdge(d.diagramId, { sourceNodeId: a.nodeId, targetNodeId: a.nodeId }))
      .rejects.toThrow('Self-loop edges are not allowed.')

    await canvasService.addEdge(d.diagramId, { sourceNodeId: a.nodeId, targetNodeId: b.nodeId })
    await expect(canvasService.addEdge(d.diagramId, { sourceNodeId: a.nodeId, targetNodeId: b.nodeId }))
      .rejects.toThrow('Duplicate edge already exists')
  })

  it('addEdge rejects when source/target node belongs to another diagram', async () => {
    const d1 = await diagramService.create({ title: 'D1', ownerUserId: 'u' })
    const d2 = await diagramService.create({ title: 'D2', ownerUserId: 'u' })
    const a = await canvasService.addNode(d1.diagramId, { type: 'start', name: 'A' }, 'u')
    const b = await canvasService.addNode(d2.diagramId, { type: 'end', name: 'B' }, 'u')
    await expect(
      canvasService.addEdge(d1.diagramId, { sourceNodeId: a.nodeId, targetNodeId: b.nodeId })
    ).rejects.toThrow('Target node not found in this diagram.')
  })

  it('updateEdge persists routingMode/label/arrowed and deleteEdge removes the row', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    const a = await canvasService.addNode(d.diagramId, { type: 'start', name: 'A' }, 'u')
    const b = await canvasService.addNode(d.diagramId, { type: 'end', name: 'B' }, 'u')
    const e = await canvasService.addEdge(d.diagramId, { sourceNodeId: a.nodeId, targetNodeId: b.nodeId })

    const upd = await canvasService.updateEdge(e.edgeId, { routingMode: 'curve', label: 'L', arrowed: false })
    expect(upd.routingMode).toBe('curve')
    expect(upd.label).toBe('L')
    expect(upd.arrowed).toBe(false)

    await canvasService.deleteEdge(e.edgeId)
    const remaining = await canvasService.getEdges(d.diagramId)
    expect(remaining).toEqual([])
  })

  it('deleteEdge throws when missing', async () => {
    await expect(canvasService.deleteEdge('nope')).rejects.toThrow('Edge not found.')
  })
})

describe('publishService.validateForPublish', () => {
  it('reports NOT_FOUND for missing diagrams', async () => {
    const errors = await publishService.validateForPublish('does-not-exist')
    expect(errors[0].code).toBe('NOT_FOUND')
  })

  it('reports NO_NODES, NO_START, NO_END for an empty diagram', async () => {
    const d = await diagramService.create({ title: 'Empty', ownerUserId: 'u' })
    const errors = await publishService.validateForPublish(d.diagramId)
    const codes = errors.map((e) => e.code).sort()
    expect(codes).toContain('NO_NODES')
    expect(codes).toContain('NO_START')
    expect(codes).toContain('NO_END')
  })

  it('reports ISOLATED_NODE for a connected start with an unrelated dangling action', async () => {
    const d = await diagramService.create({ title: 'Iso', ownerUserId: 'u' })
    const s = await canvasService.addNode(d.diagramId, { type: 'start', name: 'S' }, 'u')
    const e = await canvasService.addNode(d.diagramId, { type: 'end', name: 'E' }, 'u')
    await canvasService.addNode(d.diagramId, { type: 'action', name: 'Lonely' }, 'u')
    await canvasService.addEdge(d.diagramId, { sourceNodeId: s.nodeId, targetNodeId: e.nodeId })

    const errors = await publishService.validateForPublish(d.diagramId)
    expect(errors.some((err) => err.code === 'ISOLATED_NODE' && err.message.includes('Lonely'))).toBe(true)
  })

  it('returns no errors for a fully connected start->end diagram', async () => {
    const d = await diagramService.create({ title: 'OK', ownerUserId: 'u' })
    const s = await canvasService.addNode(d.diagramId, { type: 'start', name: 'S' }, 'u')
    const e = await canvasService.addNode(d.diagramId, { type: 'end', name: 'E' }, 'u')
    await canvasService.addEdge(d.diagramId, { sourceNodeId: s.nodeId, targetNodeId: e.nodeId })
    const errors = await publishService.validateForPublish(d.diagramId)
    expect(errors).toEqual([])
  })
})

describe('inspectionService', () => {
  it('createInspection -> addResult -> completeInspection -> getInspectionStats', async () => {
    const d = await diagramService.create({ title: 'I', ownerUserId: 'u' })
    const node = await canvasService.addNode(d.diagramId, { type: 'action', name: 'A' }, 'u')
    const insp = await inspectionService.createInspection(d.diagramId, 1, 'u', 'Routine')
    expect(insp.status).toBe('open')
    const r = await inspectionService.addResult(insp.inspectionId, {
      reviewerName: 'Reviewer',
      result: 'pass',
      nodeId: node.nodeId,
    })
    expect(r.result).toBe('pass')

    const completed = await inspectionService.completeInspection(insp.inspectionId)
    expect(completed.status).toBe('completed')
    await expect(inspectionService.completeInspection(insp.inspectionId))
      .rejects.toThrow('Only open inspections can be completed.')

    const stats = await inspectionService.getInspectionStats(d.diagramId)
    expect(stats).toEqual({ total: 1, pass: 1, fail: 0 })
  })

  it('addResult validates reviewer name and result fields', async () => {
    const d = await diagramService.create({ title: 'V', ownerUserId: 'u' })
    const insp = await inspectionService.createInspection(d.diagramId, 1, 'u', '')
    await expect(
      inspectionService.addResult(insp.inspectionId, { reviewerName: '', result: 'pass', nodeId: 'n' })
    ).rejects.toThrow('Reviewer name is required.')
    await expect(
      inspectionService.addResult(insp.inspectionId, { reviewerName: 'R', result: 'maybe', nodeId: 'n' })
    ).rejects.toThrow('Result must be "pass" or "fail".')
    await expect(
      inspectionService.addResult(insp.inspectionId, { reviewerName: 'R', result: 'fail', nodeId: 'n' })
    ).rejects.toThrow('Notes are required when result is fail.')
    await expect(
      inspectionService.addResult(insp.inspectionId, { reviewerName: 'R', result: 'pass' })
    ).rejects.toThrow('Either nodeId or traceabilityCode is required.')
  })

  it('supersedeInspection flips status and rejects re-supersede', async () => {
    const d = await diagramService.create({ title: 'S', ownerUserId: 'u' })
    const insp = await inspectionService.createInspection(d.diagramId, 1, 'u', '')
    const sup = await inspectionService.supersedeInspection(insp.inspectionId)
    expect(sup.status).toBe('superseded')
    await expect(inspectionService.supersedeInspection(insp.inspectionId))
      .rejects.toThrow('Already superseded.')
  })

  it('completeInspection throws on missing inspection', async () => {
    await expect(inspectionService.completeInspection('nope')).rejects.toThrow('Inspection not found.')
  })
})

describe('traceabilityService', () => {
  it('generates codes for nodes and tracks them in the index', async () => {
    const d = await diagramService.create({ title: 'T', ownerUserId: 'u' })
    const a = await canvasService.addNode(d.diagramId, { type: 'start', name: 'A' }, 'u')
    const b = await canvasService.addNode(d.diagramId, { type: 'end', name: 'B' }, 'u')
    const assignments = await traceabilityService.generateCodes(d.diagramId, [a.nodeId, b.nodeId], 'u')
    expect(assignments).toHaveLength(2)
    expect(assignments.every((x) => x.traceabilityCode)).toBe(true)
  })
})

describe('concurrencyService', () => {
  it('checkConflict detects newer remote version', () => {
    expect(concurrencyService.checkConflict(1, 'h', 2, 'h2')).toBe('newer_version')
  })

  it('checkConflict detects same version with different hash', () => {
    expect(concurrencyService.checkConflict(2, 'a', 2, 'b')).toBe('hash_mismatch')
  })

  it('checkConflict returns null for matching version + hash', () => {
    expect(concurrencyService.checkConflict(2, 'a', 2, 'a')).toBeNull()
  })

  it('init/destroy without a BroadcastChannel polyfill is safe', () => {
    // jsdom may or may not have BroadcastChannel; both code paths should be no-ops or working
    expect(() => {
      concurrencyService.init()
      concurrencyService.destroy()
    }).not.toThrow()
  })
})
