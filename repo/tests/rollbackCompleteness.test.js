import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { diagramService } from '../src/services/diagramService'
import { canvasService } from '../src/services/canvasService'
import { versionService } from '../src/services/versionService'
import { traceabilityService } from '../src/services/traceabilityService'
import { imageService } from '../src/services/imageService'
import { inspectionService } from '../src/services/inspectionService'

const OWNER = 'rollback-owner'

beforeEach(async () => {
  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  for (const store of ['diagrams', 'nodes', 'edges', 'snapshots', 'traceability', 'embeddedImages', 'inspections', 'inspectionResults', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch {
      // ignore
    }
  }

  global.FileReader = class {
    readAsDataURL(file) {
      this.result = `data:${file.type};base64,QUJD`
      if (this.onload) this.onload()
    }
  }
})

describe('version rollback completeness', () => {
  it('restores embedded images, traceability, and inspection records with the rolled-back snapshot', async () => {
    const diagram = await diagramService.create({ title: 'Rollback coverage', ownerUserId: OWNER })
    const node = await canvasService.addNode(diagram.diagramId, { type: 'action', name: 'Inspect step', x: 40, y: 60 }, OWNER)
    const image = await imageService.saveEmbeddedImage(diagram.diagramId, { name: 'step.png', type: 'image/png', size: 128 }, OWNER)
    await canvasService.updateNode(node.nodeId, { imageId: image.imageId, imageAlt: 'step.png' })

    const [assignment] = await traceabilityService.generateCodes(diagram.diagramId, [node.nodeId], OWNER)
    const inspection = await inspectionService.createInspection(diagram.diagramId, 1, OWNER, 'Initial review')
    await inspectionService.addResult(inspection.inspectionId, {
      nodeId: node.nodeId,
      traceabilityCode: assignment.traceabilityCode,
      result: 'pass',
      reviewerName: 'Reviewer One',
      reviewerUserId: OWNER,
      notes: 'Checked',
    })

    const { snapshot } = await versionService.createSnapshot(diagram.diagramId, 'baseline', OWNER)

    await canvasService.updateNode(node.nodeId, { imageId: null, imageAlt: '', traceabilityCode: null })
    await imageService.deleteImage(image.imageId, OWNER)

    const db = await (await import('../src/db/schema')).getDB()
    const assignments = await db.getAllFromIndex('traceability', 'by-diagram', diagram.diagramId)
    for (const entry of assignments) {
      await db.delete('traceability', entry.assignmentId)
    }
    const inspections = await db.getAllFromIndex('inspections', 'by-diagram', diagram.diagramId)
    for (const existing of inspections) {
      const results = await db.getAllFromIndex('inspectionResults', 'by-inspection', existing.inspectionId)
      for (const result of results) {
        await db.delete('inspectionResults', result.resultId)
      }
      await db.delete('inspections', existing.inspectionId)
    }

    const rollback = await versionService.rollback(diagram.diagramId, snapshot.snapshotId, OWNER)

    const restoredImages = await imageService.getImages(diagram.diagramId)
    const restoredAssignments = await traceabilityService.getAssignments(diagram.diagramId)
    const restoredInspections = await inspectionService.getInspections(diagram.diagramId)
    const restoredResults = await inspectionService.getResults(inspection.inspectionId)

    expect(rollback.embeddedImages).toHaveLength(1)
    expect(rollback.traceability).toHaveLength(1)
    expect(rollback.inspections).toHaveLength(1)
    expect(rollback.inspectionResults).toHaveLength(1)
    expect(restoredImages).toHaveLength(1)
    expect(restoredImages[0].imageId).toBe(image.imageId)
    expect(restoredAssignments).toHaveLength(1)
    expect(restoredAssignments[0].traceabilityCode).toBe(assignment.traceabilityCode)
    expect(restoredInspections).toHaveLength(1)
    expect(restoredInspections[0].inspectionId).toBe(inspection.inspectionId)
    expect(restoredResults).toHaveLength(1)
    expect(restoredResults[0].traceabilityCode).toBe(assignment.traceabilityCode)
  })
})
