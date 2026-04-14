import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { auditService } from './auditService'

const MAX_SNAPSHOTS = 20

export const versionService = {
  async createSnapshot(diagramId, reason, actedByUserId) {
    const db = await getDB()
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) throw new Error('Diagram not found.')

    const state = await loadDiagramSnapshotState(db, diagramId)

    const payload = {
      diagram: { title: diagram.title, description: diagram.description, status: diagram.status },
      nodes: state.nodes.map((node) => ({ ...node })),
      edges: state.edges.map((edge) => ({ ...edge })),
      traceability: state.traceability.map((assignment) => ({ ...assignment })),
      embeddedImages: state.embeddedImages.map((image) => ({ ...image })),
      inspections: state.inspections.map((inspection) => ({ ...inspection })),
      inspectionResults: state.inspectionResults.map((result) => ({ ...result })),
    }

    const revisionHash = computeRevisionHash(state.nodes, state.edges)
    const ts = getTimestamp()

    const snapshot = {
      snapshotId: generateId(),
      diagramId,
      versionNumber: diagram.currentVersionNumber + 1,
      snapshotPayload: JSON.stringify(payload),
      snapshotPayloadEncryptionRef: null,
      snapshotReason: reason,
      createdAt: ts.iso,
      createdByUserId: actedByUserId,
    }

    // Update diagram version
    diagram.currentVersionNumber = snapshot.versionNumber
    diagram.currentRevisionHash = revisionHash
    diagram.updatedAt = ts.iso
    diagram.updatedByUserId = actedByUserId

    const tx = db.transaction(['snapshots', 'diagrams'], 'readwrite')
    await tx.objectStore('snapshots').put(snapshot)
    await tx.objectStore('diagrams').put(diagram)
    await tx.done

    // Prune old snapshots
    await this.pruneSnapshots(diagramId)

    return { snapshot, diagram }
  },

  async pruneSnapshots(diagramId) {
    const db = await getDB()
    const all = await db.getAllFromIndex('snapshots', 'by-diagram', diagramId)
    if (all.length <= MAX_SNAPSHOTS) return

    all.sort((a, b) => a.versionNumber - b.versionNumber)
    const toDelete = all.slice(0, all.length - MAX_SNAPSHOTS)
    const tx = db.transaction('snapshots', 'readwrite')
    for (const snap of toDelete) {
      await tx.store.delete(snap.snapshotId)
    }
    await tx.done
  },

  async getSnapshots(diagramId) {
    const db = await getDB()
    const all = await db.getAllFromIndex('snapshots', 'by-diagram', diagramId)
    all.sort((a, b) => b.versionNumber - a.versionNumber)
    return all
  },

  async rollback(diagramId, snapshotId, actedByUserId) {
    const db = await getDB()
    const snapshot = await db.get('snapshots', snapshotId)
    if (!snapshot || snapshot.diagramId !== diagramId) {
      throw new Error('Snapshot not found for this diagram.')
    }

    const payload = JSON.parse(snapshot.snapshotPayload)
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) throw new Error('Diagram not found.')

    const ts = getTimestamp()
    const snapshotState = {
      nodes: payload.nodes || [],
      edges: payload.edges || [],
      traceability: payload.traceability || [],
      embeddedImages: payload.embeddedImages || [],
      inspections: payload.inspections || [],
      inspectionResults: payload.inspectionResults || [],
    }

    // Replace all diagram-owned persisted state atomically.
    const tx = db.transaction(
      ['nodes', 'edges', 'traceability', 'embeddedImages', 'inspections', 'inspectionResults', 'diagrams', 'snapshots'],
      'readwrite'
    )

    // Clear existing diagram state.
    const existingNodes = await tx.objectStore('nodes').index('by-diagram').getAll(diagramId)
    for (const n of existingNodes) await tx.objectStore('nodes').delete(n.nodeId)

    const existingEdges = await tx.objectStore('edges').index('by-diagram').getAll(diagramId)
    for (const e of existingEdges) await tx.objectStore('edges').delete(e.edgeId)

    const existingAssignments = await tx.objectStore('traceability').index('by-diagram').getAll(diagramId)
    for (const assignment of existingAssignments) {
      await tx.objectStore('traceability').delete(assignment.assignmentId)
    }

    const existingImages = await tx.objectStore('embeddedImages').index('by-diagram').getAll(diagramId)
    for (const image of existingImages) await tx.objectStore('embeddedImages').delete(image.imageId)

    const existingInspections = await tx.objectStore('inspections').index('by-diagram').getAll(diagramId)
    for (const inspection of existingInspections) {
      const existingResults = await tx.objectStore('inspectionResults').index('by-inspection').getAll(inspection.inspectionId)
      for (const result of existingResults) {
        await tx.objectStore('inspectionResults').delete(result.resultId)
      }
      await tx.objectStore('inspections').delete(inspection.inspectionId)
    }

    // Restore from snapshot
    for (const node of snapshotState.nodes) {
      await tx.objectStore('nodes').put(node)
    }
    for (const edge of snapshotState.edges) {
      await tx.objectStore('edges').put(edge)
    }
    for (const assignment of snapshotState.traceability) {
      await tx.objectStore('traceability').put(assignment)
    }
    for (const image of snapshotState.embeddedImages) {
      await tx.objectStore('embeddedImages').put(image)
    }
    for (const inspection of snapshotState.inspections) {
      await tx.objectStore('inspections').put(inspection)
    }
    for (const result of snapshotState.inspectionResults) {
      await tx.objectStore('inspectionResults').put(result)
    }

    // Update diagram
    diagram.title = payload.diagram.title
    diagram.description = payload.diagram.description
    diagram.status = payload.diagram.status
    diagram.currentVersionNumber += 1
    diagram.currentRevisionHash = computeRevisionHash(snapshotState.nodes, snapshotState.edges)
    diagram.updatedAt = ts.iso
    diagram.updatedByUserId = actedByUserId
    await tx.objectStore('diagrams').put(diagram)

    // Create a rollback snapshot
    const rollbackSnap = {
      snapshotId: generateId(),
      diagramId,
      versionNumber: diagram.currentVersionNumber,
      snapshotPayload: snapshot.snapshotPayload,
      snapshotPayloadEncryptionRef: null,
      snapshotReason: 'rollback',
      createdAt: ts.iso,
      createdByUserId: actedByUserId,
    }
    await tx.objectStore('snapshots').put(rollbackSnap)
    await tx.done

    await auditService.log({
      entityType: 'diagram',
      entityId: diagramId,
      actionType: 'diagram_rollback',
      afterSummary: { restoredVersion: snapshot.versionNumber, newVersion: diagram.currentVersionNumber },
      actedByUserId,
    })

    await this.pruneSnapshots(diagramId)

    return {
      diagram,
      nodes: snapshotState.nodes,
      edges: snapshotState.edges,
      traceability: snapshotState.traceability,
      embeddedImages: snapshotState.embeddedImages,
      inspections: snapshotState.inspections,
      inspectionResults: snapshotState.inspectionResults,
    }
  },

  async getCurrentVersionInfo(diagramId) {
    const db = await getDB()
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) return null
    return {
      versionNumber: diagram.currentVersionNumber,
      revisionHash: diagram.currentRevisionHash,
    }
  },

  MAX_SNAPSHOTS,
}

function computeRevisionHash(nodes, edges) {
  const sortedNodes = [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId))
  const sortedEdges = [...edges].sort((a, b) => a.edgeId.localeCompare(b.edgeId))

  const canonical = JSON.stringify({
    nodes: sortedNodes.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      name: n.name,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      shortDescription: n.shortDescription,
      ownerTag: n.ownerTag,
      departmentTag: n.departmentTag,
      color: n.color,
      icon: n.icon,
      statusStyle: n.statusStyle,
      imageId: n.imageId,
      imageAlt: n.imageAlt,
      traceabilityCode: n.traceabilityCode,
    })),
    edges: sortedEdges.map((e) => ({
      edgeId: e.edgeId,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      routingMode: e.routingMode,
      arrowed: e.arrowed,
      label: e.label,
    })),
  })

  // Simple hash (djb2) for deterministic local comparison
  let hash = 5381
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(i)) & 0xffffffff
  }
  return hash.toString(16)
}

async function loadDiagramSnapshotState(db, diagramId) {
  const nodes = await db.getAllFromIndex('nodes', 'by-diagram', diagramId)
  const edges = await db.getAllFromIndex('edges', 'by-diagram', diagramId)
  const traceability = await db.getAllFromIndex('traceability', 'by-diagram', diagramId)
  const embeddedImages = await db.getAllFromIndex('embeddedImages', 'by-diagram', diagramId)
  const inspections = await db.getAllFromIndex('inspections', 'by-diagram', diagramId)
  const inspectionResults = []

  for (const inspection of inspections) {
    const results = await db.getAllFromIndex('inspectionResults', 'by-inspection', inspection.inspectionId)
    inspectionResults.push(...results)
  }

  return {
    nodes,
    edges,
    traceability,
    embeddedImages,
    inspections,
    inspectionResults,
  }
}

export { computeRevisionHash }
