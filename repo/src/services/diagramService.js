import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { auditService } from './auditService'

const VALID_STATUSES = ['draft', 'published', 'retracted', 'archived']

const ALLOWED_TRANSITIONS = {
  draft: ['published', 'archived'],
  published: ['retracted', 'archived'],
  retracted: ['draft', 'published', 'archived'],
  archived: ['draft'],
}

export const diagramService = {
  async create({ title, description, ownerUserId }) {
    if (!title || title.trim().length === 0) throw new Error('Title is required.')
    if (title.length > 200) throw new Error('Title must be at most 200 characters.')
    if (description && description.length > 1000) throw new Error('Description too long.')

    const db = await getDB()
    const ts = getTimestamp()

    const diagram = {
      diagramId: generateId(),
      ownerUserId,
      visibilityScope: 'private_to_user',
      title: title.trim(),
      description: description || '',
      status: 'draft',
      templateSource: null,
      createdByUserId: ownerUserId,
      updatedByUserId: ownerUserId,
      createdAt: ts.iso,
      updatedAt: ts.iso,
      publishedAt: null,
      publishedByUserId: null,
      retractedAt: null,
      retractedByUserId: null,
      retractionReason: null,
      currentVersionNumber: 1,
      currentRevisionHash: null,
    }

    await db.put('diagrams', diagram)

    await auditService.log({
      entityType: 'diagram',
      entityId: diagram.diagramId,
      actionType: 'diagram_created',
      afterSummary: { title: diagram.title },
      actedByUserId: ownerUserId,
    })

    return diagram
  },

  async getById(diagramId) {
    const db = await getDB()
    return db.get('diagrams', diagramId)
  },

  async getByOwner(ownerUserId) {
    const db = await getDB()
    return db.getAllFromIndex('diagrams', 'by-owner', ownerUserId)
  },

  async getPublished() {
    const db = await getDB()
    return db.getAllFromIndex('diagrams', 'by-status', 'published')
  },

  async getAll() {
    const db = await getDB()
    return db.getAll('diagrams')
  },

  async update(diagramId, updates, actedByUserId) {
    const db = await getDB()
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) throw new Error('Diagram not found.')

    const before = { title: diagram.title, description: diagram.description }

    if (updates.title !== undefined) {
      if (!updates.title || updates.title.trim().length === 0) throw new Error('Title is required.')
      if (updates.title.length > 200) throw new Error('Title too long.')
      diagram.title = updates.title.trim()
    }
    if (updates.description !== undefined) {
      if (updates.description && updates.description.length > 1000) throw new Error('Description too long.')
      diagram.description = updates.description
    }

    diagram.updatedByUserId = actedByUserId
    diagram.updatedAt = getTimestamp().iso
    await db.put('diagrams', diagram)

    await auditService.log({
      entityType: 'diagram',
      entityId: diagramId,
      actionType: 'diagram_updated',
      beforeSummary: before,
      afterSummary: { title: diagram.title, description: diagram.description },
      actedByUserId,
    })

    return diagram
  },

  async transitionStatus(diagramId, newStatus, actedByUserId, reason) {
    const db = await getDB()
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) throw new Error('Diagram not found.')

    const allowed = ALLOWED_TRANSITIONS[diagram.status]
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(`Cannot transition from ${diagram.status} to ${newStatus}.`)
    }

    if (newStatus === 'retracted' && (!reason || reason.trim().length < 10)) {
      throw new Error('Retraction reason must be at least 10 characters.')
    }

    const before = { status: diagram.status }
    const ts = getTimestamp()

    diagram.status = newStatus
    diagram.updatedByUserId = actedByUserId
    diagram.updatedAt = ts.iso

    if (newStatus === 'published') {
      diagram.publishedAt = ts.iso
      diagram.publishedByUserId = actedByUserId
      diagram.visibilityScope = 'shared_local_library'
    } else if (newStatus === 'retracted') {
      diagram.retractedAt = ts.iso
      diagram.retractedByUserId = actedByUserId
      diagram.retractionReason = reason.trim()
      diagram.visibilityScope = 'private_to_user'
    } else if (newStatus === 'draft') {
      diagram.visibilityScope = 'private_to_user'
    }

    await db.put('diagrams', diagram)

    // Publish event record
    const pubEvent = {
      publishEventId: generateId(),
      diagramId,
      fromStatus: before.status,
      toStatus: newStatus,
      reason: reason || null,
      actedByUserId,
      actedAt: ts.iso,
    }
    await db.put('publishEvents', pubEvent)

    await auditService.log({
      entityType: 'diagram',
      entityId: diagramId,
      actionType: `diagram_${newStatus}`,
      beforeSummary: before,
      afterSummary: { status: newStatus, reason: reason || null },
      actedByUserId,
      reason,
    })

    return diagram
  },

  async deleteDiagram(diagramId, actedByUserId) {
    const db = await getDB()
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) throw new Error('Diagram not found.')

    const tx = db.transaction(
      [
        'diagrams',
        'nodes',
        'edges',
        'snapshots',
        'traceability',
        'embeddedImages',
        'inspections',
        'inspectionResults',
        'publishEvents',
        'retractionRecords',
      ],
      'readwrite',
    )

    // Delete nodes
    const nodes = await tx.objectStore('nodes').index('by-diagram').getAll(diagramId)
    for (const n of nodes) await tx.objectStore('nodes').delete(n.nodeId)

    // Delete edges
    const edges = await tx.objectStore('edges').index('by-diagram').getAll(diagramId)
    for (const e of edges) await tx.objectStore('edges').delete(e.edgeId)

    // Delete snapshots
    const snaps = await tx.objectStore('snapshots').index('by-diagram').getAll(diagramId)
    for (const s of snaps) await tx.objectStore('snapshots').delete(s.snapshotId)

    // Delete traceability
    const traces = await tx.objectStore('traceability').index('by-diagram').getAll(diagramId)
    for (const t of traces) await tx.objectStore('traceability').delete(t.assignmentId)

    // Delete embedded images
    const images = await tx.objectStore('embeddedImages').index('by-diagram').getAll(diagramId)
    for (const image of images) await tx.objectStore('embeddedImages').delete(image.imageId)

    // Delete inspections and their child results within the same transaction
    const inspections = await tx.objectStore('inspections').index('by-diagram').getAll(diagramId)
    for (const inspection of inspections) {
      const results = await tx
        .objectStore('inspectionResults')
        .index('by-inspection')
        .getAll(inspection.inspectionId)
      for (const r of results) await tx.objectStore('inspectionResults').delete(r.resultId)
      await tx.objectStore('inspections').delete(inspection.inspectionId)
    }

    // Delete publish events for this diagram
    const pubEvents = await tx.objectStore('publishEvents').index('by-diagram').getAll(diagramId)
    for (const ev of pubEvents) await tx.objectStore('publishEvents').delete(ev.publishEventId)

    // Delete retraction records for this diagram
    const retractions = await tx
      .objectStore('retractionRecords')
      .index('by-diagram')
      .getAll(diagramId)
    for (const r of retractions) await tx.objectStore('retractionRecords').delete(r.retractionId)

    await tx.objectStore('diagrams').delete(diagramId)
    await tx.done

    await auditService.log({
      entityType: 'diagram',
      entityId: diagramId,
      actionType: 'diagram_deleted',
      beforeSummary: { title: diagram.title, status: diagram.status },
      actedByUserId,
    })
  },

  async getNodes(diagramId) {
    const db = await getDB()
    return db.getAllFromIndex('nodes', 'by-diagram', diagramId)
  },

  async getEdges(diagramId) {
    const db = await getDB()
    return db.getAllFromIndex('edges', 'by-diagram', diagramId)
  },
}
