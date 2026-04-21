import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { versionService, computeRevisionHash } from '@/services/versionService'

const OWNER = 'version-owner'

async function resetDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of [
    'diagrams',
    'nodes',
    'edges',
    'snapshots',
    'traceability',
    'embeddedImages',
    'inspections',
    'inspectionResults',
    'auditEvents',
  ]) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch {
      // ignore
    }
  }
}

beforeEach(async () => {
  await resetDB()
})

describe('versionService.createSnapshot', () => {
  it('persists a snapshot, increments the diagram version, and updates the revision hash', async () => {
    const diagram = await diagramService.create({ title: 'VS base', ownerUserId: OWNER })
    await canvasService.addNode(diagram.diagramId, { type: 'action', name: 'A', x: 0, y: 0 }, OWNER)

    const before = await versionService.getCurrentVersionInfo(diagram.diagramId)
    const { snapshot, diagram: updated } = await versionService.createSnapshot(diagram.diagramId, 'initial', OWNER)

    expect(snapshot.diagramId).toBe(diagram.diagramId)
    expect(snapshot.versionNumber).toBe(before.versionNumber + 1)
    expect(snapshot.snapshotReason).toBe('initial')
    expect(snapshot.createdByUserId).toBe(OWNER)
    expect(updated.currentVersionNumber).toBe(snapshot.versionNumber)
    expect(updated.currentRevisionHash).toBeTypeOf('string')
    expect(updated.currentRevisionHash.length).toBeGreaterThan(0)

    const payload = JSON.parse(snapshot.snapshotPayload)
    expect(payload.diagram.title).toBe('VS base')
    expect(payload.nodes).toHaveLength(1)
    expect(Array.isArray(payload.edges)).toBe(true)
    expect(Array.isArray(payload.traceability)).toBe(true)
    expect(Array.isArray(payload.embeddedImages)).toBe(true)
    expect(Array.isArray(payload.inspections)).toBe(true)
    expect(Array.isArray(payload.inspectionResults)).toBe(true)
  })

  it('throws when the diagram does not exist', async () => {
    await expect(versionService.createSnapshot('missing-id', 'x', OWNER)).rejects.toThrow(/not found/i)
  })
})

describe('versionService.pruneSnapshots', () => {
  it('caps the retained snapshot history at MAX_SNAPSHOTS, keeping only the newest versions', async () => {
    expect(versionService.MAX_SNAPSHOTS).toBe(20)

    const diagram = await diagramService.create({ title: 'Prune me', ownerUserId: OWNER })
    const total = versionService.MAX_SNAPSHOTS + 5

    for (let i = 0; i < total; i++) {
      await versionService.createSnapshot(diagram.diagramId, `snap-${i}`, OWNER)
    }

    const snapshots = await versionService.getSnapshots(diagram.diagramId)
    expect(snapshots).toHaveLength(versionService.MAX_SNAPSHOTS)

    // Newest first
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i - 1].versionNumber).toBeGreaterThan(snapshots[i].versionNumber)
    }

    // Diagrams are created with currentVersionNumber=1, so the first snapshot is v2.
    // After `total` snapshots and pruning, the oldest retained is:
    //   newest (total + 1) - MAX_SNAPSHOTS + 1 == total - MAX_SNAPSHOTS + 2
    const oldestRetained = snapshots[snapshots.length - 1].versionNumber
    expect(oldestRetained).toBe(total - versionService.MAX_SNAPSHOTS + 2)
  })

  it('is a no-op when snapshot count is under the cap', async () => {
    const diagram = await diagramService.create({ title: 'Small history', ownerUserId: OWNER })
    await versionService.createSnapshot(diagram.diagramId, 'a', OWNER)
    await versionService.createSnapshot(diagram.diagramId, 'b', OWNER)

    await versionService.pruneSnapshots(diagram.diagramId)
    const snapshots = await versionService.getSnapshots(diagram.diagramId)
    expect(snapshots).toHaveLength(2)
  })
})

describe('versionService.getSnapshots', () => {
  it('returns snapshots for the requested diagram in descending version order and ignores others', async () => {
    const d1 = await diagramService.create({ title: 'D1', ownerUserId: OWNER })
    const d2 = await diagramService.create({ title: 'D2', ownerUserId: OWNER })

    await versionService.createSnapshot(d1.diagramId, 'd1-a', OWNER)
    await versionService.createSnapshot(d2.diagramId, 'd2-a', OWNER)
    await versionService.createSnapshot(d1.diagramId, 'd1-b', OWNER)

    const d1Snaps = await versionService.getSnapshots(d1.diagramId)
    const d2Snaps = await versionService.getSnapshots(d2.diagramId)

    expect(d1Snaps).toHaveLength(2)
    expect(d2Snaps).toHaveLength(1)
    expect(d1Snaps[0].versionNumber).toBeGreaterThan(d1Snaps[1].versionNumber)
    expect(d1Snaps.every((s) => s.diagramId === d1.diagramId)).toBe(true)
  })
})

describe('versionService.getCurrentVersionInfo', () => {
  it('returns the current version and revision hash for an existing diagram', async () => {
    const diagram = await diagramService.create({ title: 'Info', ownerUserId: OWNER })
    await versionService.createSnapshot(diagram.diagramId, 'r1', OWNER)

    const info = await versionService.getCurrentVersionInfo(diagram.diagramId)
    expect(info).not.toBeNull()
    expect(info.versionNumber).toBeGreaterThan(0)
    expect(typeof info.revisionHash).toBe('string')
  })

  it('returns null for an unknown diagram id', async () => {
    expect(await versionService.getCurrentVersionInfo('does-not-exist')).toBeNull()
  })
})

describe('versionService.rollback error paths', () => {
  it('throws when the snapshot does not belong to the target diagram', async () => {
    const d1 = await diagramService.create({ title: 'A', ownerUserId: OWNER })
    const d2 = await diagramService.create({ title: 'B', ownerUserId: OWNER })
    const { snapshot } = await versionService.createSnapshot(d1.diagramId, 'r', OWNER)

    await expect(versionService.rollback(d2.diagramId, snapshot.snapshotId, OWNER))
      .rejects.toThrow(/snapshot not found/i)
  })

  it('throws when the snapshot id does not exist', async () => {
    const diagram = await diagramService.create({ title: 'C', ownerUserId: OWNER })
    await expect(versionService.rollback(diagram.diagramId, 'missing-snap', OWNER))
      .rejects.toThrow(/snapshot not found/i)
  })
})

describe('computeRevisionHash', () => {
  const nodeA = { nodeId: 'n1', type: 'action', name: 'A', x: 0, y: 0, width: 10, height: 10 }
  const nodeB = { nodeId: 'n2', type: 'action', name: 'B', x: 1, y: 2, width: 10, height: 10 }
  const edgeAB = { edgeId: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', routingMode: 'straight', arrowed: true, label: '' }

  it('produces a stable hash regardless of input order', async () => {
    const h1 = computeRevisionHash([nodeA, nodeB], [edgeAB])
    const h2 = computeRevisionHash([nodeB, nodeA], [edgeAB])
    expect(h1).toBe(h2)
  })

  it('changes when node content changes', () => {
    const base = computeRevisionHash([nodeA], [])
    const mutated = computeRevisionHash([{ ...nodeA, name: 'A-edited' }], [])
    expect(mutated).not.toBe(base)
  })

  it('changes when edges change', () => {
    const withEdge = computeRevisionHash([nodeA, nodeB], [edgeAB])
    const withoutEdge = computeRevisionHash([nodeA, nodeB], [])
    expect(withEdge).not.toBe(withoutEdge)
  })

  it('ignores non-persisted/ephemeral fields on nodes', () => {
    const clean = computeRevisionHash([nodeA], [])
    const noisy = computeRevisionHash([{ ...nodeA, _selected: true, _dragging: true }], [])
    expect(clean).toBe(noisy)
  })

  it('returns a hex string', () => {
    expect(computeRevisionHash([nodeA], [])).toMatch(/^[0-9a-f]+$/)
  })
})
