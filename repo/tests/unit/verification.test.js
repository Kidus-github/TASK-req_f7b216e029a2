import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { traceabilityService } from '@/services/traceabilityService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'

const OWNER = 'test-owner'

beforeEach(async () => {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of ['diagrams', 'nodes', 'edges', 'traceability', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch { /* */ }
  }
})

describe('traceability code generation', () => {
  it('generates codes for selected nodes', async () => {
    const d = await diagramService.create({ title: 'Traceable', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(d.diagramId, { type: 'start', name: 'Begin', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(d.diagramId, { type: 'action', name: 'Do', x: 100, y: 0 }, OWNER)

    const assignments = await traceabilityService.generateCodes(
      d.diagramId,
      [n1.nodeId, n2.nodeId],
      OWNER
    )

    expect(assignments.length).toBe(2)
    const codes = assignments.map((a) => a.traceabilityCode)
    expect(codes.some((c) => /^SOP-\d{3}-S1$/.test(c))).toBe(true)
    expect(codes.some((c) => /^SOP-\d{3}-A1$/.test(c))).toBe(true)
  })

  it('does not duplicate codes for already-traced nodes', async () => {
    const d = await diagramService.create({ title: 'NoDupe', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(d.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, OWNER)

    await traceabilityService.generateCodes(d.diagramId, [n1.nodeId], OWNER)
    const second = await traceabilityService.generateCodes(d.diagramId, [n1.nodeId], OWNER)

    expect(second.length).toBe(0)
  })
})

describe('verification workflow', () => {
  it('validates correct code format', () => {
    expect(traceabilityService.validateCode('SOP-001-A1')).toBe(true)
    expect(traceabilityService.validateCode('SOP-042-D3')).toBe(true)
    expect(traceabilityService.validateCode('SOP-100-S12')).toBe(true)
  })

  it('rejects invalid code format', () => {
    expect(traceabilityService.validateCode('')).toBe(false)
    expect(traceabilityService.validateCode('SOP-1-A1')).toBe(false)
    expect(traceabilityService.validateCode('INVALID')).toBe(false)
    expect(traceabilityService.validateCode('SOP-001-X1')).toBe(false)
  })

  it('getAssignments returns generated codes for lookup', async () => {
    const d = await diagramService.create({ title: 'Verify', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(d.diagramId, { type: 'action', name: 'Step', x: 0, y: 0 }, OWNER)

    await traceabilityService.generateCodes(d.diagramId, [n1.nodeId], OWNER)
    const assignments = await traceabilityService.getAssignments(d.diagramId)

    expect(assignments.length).toBe(1)
    expect(assignments[0].nodeId).toBe(n1.nodeId)
    expect(traceabilityService.validateCode(assignments[0].traceabilityCode)).toBe(true)
  })

  it('code lookup matches the correct node (simulated verification)', async () => {
    const d = await diagramService.create({ title: 'Lookup', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(d.diagramId, { type: 'start', name: 'A', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(d.diagramId, { type: 'end', name: 'B', x: 100, y: 0 }, OWNER)

    await traceabilityService.generateCodes(d.diagramId, [n1.nodeId, n2.nodeId], OWNER)
    const assignments = await traceabilityService.getAssignments(d.diagramId)

    const codeForN1 = assignments.find((a) => a.nodeId === n1.nodeId)?.traceabilityCode
    const matches = assignments.filter((a) => a.traceabilityCode === codeForN1)
    expect(matches.length).toBe(1)
    expect(matches[0].nodeId).toBe(n1.nodeId)
  })

  it('no-match returns empty result', async () => {
    const d = await diagramService.create({ title: 'NoMatch', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, OWNER)
    await traceabilityService.generateCodes(d.diagramId, [], OWNER)
    const assignments = await traceabilityService.getAssignments(d.diagramId)

    const matches = assignments.filter((a) => a.traceabilityCode === 'SOP-999-Z1')
    expect(matches.length).toBe(0)
  })
})
