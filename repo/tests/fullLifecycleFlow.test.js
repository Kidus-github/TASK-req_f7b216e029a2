import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { diagramService } from '../src/services/diagramService'
import { canvasService } from '../src/services/canvasService'
import { versionService } from '../src/services/versionService'
import { publishService } from '../src/services/publishService'
import { traceabilityService } from '../src/services/traceabilityService'
import { inspectionService } from '../src/services/inspectionService'
import { importService } from '../src/services/importService'

const OWNER = 'lifecycle-owner'

beforeEach(async () => {
  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  for (const store of [
    'diagrams', 'nodes', 'edges', 'snapshots', 'traceability',
    'embeddedImages', 'inspections', 'inspectionResults',
    'publishEvents', 'auditEvents', 'importJobs', 'importErrors',
  ]) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch { /* */ }
  }
})

describe('full diagram lifecycle: create -> edit -> version -> publish -> library', () => {
  it('published diagram appears in getPublished after valid publish', async () => {
    // 1. Create diagram
    const diagram = await diagramService.create({ title: 'Lifecycle SOP', ownerUserId: OWNER })
    expect(diagram.status).toBe('draft')

    // 2. Add nodes and edges
    const start = await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'Begin', x: 0, y: 0 }, OWNER)
    const action = await canvasService.addNode(diagram.diagramId, { type: 'action', name: 'Do Work', x: 200, y: 0 }, OWNER)
    const end = await canvasService.addNode(diagram.diagramId, { type: 'end', name: 'Done', x: 400, y: 0 }, OWNER)
    await canvasService.addEdge(diagram.diagramId, { sourceNodeId: start.nodeId, targetNodeId: action.nodeId })
    await canvasService.addEdge(diagram.diagramId, { sourceNodeId: action.nodeId, targetNodeId: end.nodeId })

    // 3. Validate for publish - should pass
    const errors = await publishService.validateForPublish(diagram.diagramId)
    expect(errors.length).toBe(0)

    // 4. Create version snapshot
    const { snapshot } = await versionService.createSnapshot(diagram.diagramId, 'pre-publish', OWNER)
    expect(snapshot.versionNumber).toBeGreaterThan(1)

    // 5. Publish
    const published = await diagramService.transitionStatus(diagram.diagramId, 'published', OWNER)
    expect(published.status).toBe('published')

    // 6. Verify it appears in the library
    const library = await diagramService.getPublished()
    expect(library.length).toBe(1)
    expect(library[0].diagramId).toBe(diagram.diagramId)
    expect(library[0].title).toBe('Lifecycle SOP')
  })
})

describe('full rollback lifecycle: edit -> version -> mutate -> rollback -> verify state', () => {
  it('rollback restores nodes, edges, and traceability codes to snapshot state', async () => {
    // 1. Create diagram with content
    const diagram = await diagramService.create({ title: 'Rollback Test', ownerUserId: OWNER })
    const n1 = await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'Step A', x: 0, y: 0 }, OWNER)
    const n2 = await canvasService.addNode(diagram.diagramId, { type: 'end', name: 'Step B', x: 200, y: 0 }, OWNER)
    await canvasService.addEdge(diagram.diagramId, { sourceNodeId: n1.nodeId, targetNodeId: n2.nodeId })

    // 2. Generate traceability codes
    await traceabilityService.generateCodes(diagram.diagramId, [n1.nodeId, n2.nodeId], OWNER)
    const codesBeforeSnapshot = await traceabilityService.getAssignments(diagram.diagramId)
    expect(codesBeforeSnapshot.length).toBe(2)

    // 3. Snapshot baseline
    const { snapshot: baseline } = await versionService.createSnapshot(diagram.diagramId, 'baseline', OWNER)

    // 4. Mutate: add a third node, delete traceability
    await canvasService.addNode(diagram.diagramId, { type: 'action', name: 'Step C', x: 400, y: 0 }, OWNER)
    const nodesAfterMutate = await canvasService.getNodes(diagram.diagramId)
    expect(nodesAfterMutate.length).toBe(3)

    // Delete traceability manually to simulate drift
    const { getDB } = await import('../src/db/schema')
    const db = await getDB()
    const assignments = await db.getAllFromIndex('traceability', 'by-diagram', diagram.diagramId)
    for (const a of assignments) {
      await db.delete('traceability', a.assignmentId)
    }
    const codesAfterDelete = await traceabilityService.getAssignments(diagram.diagramId)
    expect(codesAfterDelete.length).toBe(0)

    // 5. Rollback to baseline
    const result = await versionService.rollback(diagram.diagramId, baseline.snapshotId, OWNER)

    // 6. Verify restored state
    expect(result.nodes.length).toBe(2)
    expect(result.edges.length).toBe(1)
    expect(result.traceability.length).toBe(2)

    // Verify persisted state matches
    const restoredNodes = await canvasService.getNodes(diagram.diagramId)
    expect(restoredNodes.length).toBe(2)
    expect(restoredNodes.map(n => n.name).sort()).toEqual(['Step A', 'Step B'])

    const restoredCodes = await traceabilityService.getAssignments(diagram.diagramId)
    expect(restoredCodes.length).toBe(2)
  })
})

describe('import error flow: invalid file produces detailed errors', () => {
  it('returns exact JSON path errors for dangling edge references', async () => {
    const diagram = await diagramService.create({ title: 'Import Target', ownerUserId: OWNER })
    const json = JSON.stringify({
      nodes: [{ nodeId: 'n1', type: 'start', name: 'Begin' }],
      edges: [{ sourceNodeId: 'n1', targetNodeId: 'nonexistent' }],
    })
    const file = { name: 'bad.json', size: json.length, text: () => Promise.resolve(json) }

    const result = await importService.importJSON(file, diagram.diagramId, OWNER)

    expect(result.job.status).toBe('failed')
    expect(result.errors.length).toBeGreaterThan(0)

    const danglingError = result.errors.find(e => e.code === 'IMPORT_DANGLING_EDGE')
    expect(danglingError).toBeTruthy()
    expect(danglingError.context.jsonPath).toContain('$.edges[0]')
    expect(danglingError.context.field).toBe('targetNodeId')
  })

  it('returns errors for missing required fields with exact paths', async () => {
    const diagram = await diagramService.create({ title: 'Import Target 2', ownerUserId: OWNER })
    const json = JSON.stringify({
      nodes: [
        { type: 'start', name: 'No ID' },
        { nodeId: 'n2', name: 'No Type' },
      ],
      edges: [],
    })
    const file = { name: 'missing.json', size: json.length, text: () => Promise.resolve(json) }

    const result = await importService.importJSON(file, diagram.diagramId, OWNER)

    expect(result.job.status).toBe('failed')
    expect(result.errors.some(e => e.context?.jsonPath === '$.nodes[0].nodeId')).toBe(true)
    expect(result.errors.some(e => e.context?.jsonPath === '$.nodes[1].type')).toBe(true)
  })
})

describe('inspection lifecycle within diagram flow', () => {
  it('creates inspection, adds pass/fail results, and completes', async () => {
    const diagram = await diagramService.create({ title: 'Inspected SOP', ownerUserId: OWNER })
    const node = await canvasService.addNode(diagram.diagramId, { type: 'action', name: 'Check Step', x: 0, y: 0 }, OWNER)

    const inspection = await inspectionService.createInspection(diagram.diagramId, 1, OWNER, 'Safety review')
    expect(inspection.status).toBe('open')

    await inspectionService.addResult(inspection.inspectionId, {
      nodeId: node.nodeId,
      result: 'pass',
      reviewerName: 'Inspector Alice',
      reviewerUserId: OWNER,
      notes: 'Verified correct.',
    })

    await inspectionService.addResult(inspection.inspectionId, {
      nodeId: node.nodeId,
      result: 'fail',
      reviewerName: 'Inspector Bob',
      reviewerUserId: OWNER,
      notes: 'Missing safety guard documentation.',
    })

    const results = await inspectionService.getResults(inspection.inspectionId)
    expect(results.length).toBe(2)
    expect(results.filter(r => r.result === 'pass').length).toBe(1)
    expect(results.filter(r => r.result === 'fail').length).toBe(1)

    const completed = await inspectionService.completeInspection(inspection.inspectionId)
    expect(completed.status).toBe('completed')

    // Completed inspection cannot be re-completed
    await expect(inspectionService.completeInspection(inspection.inspectionId))
      .rejects.toThrow('Only open inspections')
  })
})
