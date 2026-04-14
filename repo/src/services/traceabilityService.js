import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { auditService } from './auditService'

const TYPE_PREFIX = { start: 'S', end: 'E', decision: 'D', action: 'A', note: 'N' }

export const traceabilityService = {
  async generateCodes(diagramId, nodeIds, actedByUserId) {
    const db = await getDB()
    const nodes = await db.getAllFromIndex('nodes', 'by-diagram', diagramId)
    const existing = await db.getAllFromIndex('traceability', 'by-diagram', diagramId)

    // Determine diagram sequence number
    let diagramSeq = null
    if (existing.length > 0) {
      const match = existing[0].traceabilityCode.match(/^SOP-(\d{3})-/)
      if (match) diagramSeq = parseInt(match[1], 10)
    }
    if (diagramSeq === null) {
      const allDiagrams = await db.getAll('diagrams')
      diagramSeq = allDiagrams.length
    }
    const seqStr = String(diagramSeq).padStart(3, '0')

    // Count existing codes by type
    const typeCounts = {}
    for (const a of existing) {
      const m = a.traceabilityCode.match(/-([SEDAN])(\d+)$/)
      if (m) {
        const prefix = m[1]
        const num = parseInt(m[2], 10)
        typeCounts[prefix] = Math.max(typeCounts[prefix] || 0, num)
      }
    }

    const selectedNodes = nodes.filter((n) => nodeIds.includes(n.nodeId))
    const existingNodeIds = new Set(existing.map((a) => a.nodeId))
    const ts = getTimestamp()
    const newAssignments = []

    for (const node of selectedNodes) {
      if (existingNodeIds.has(node.nodeId)) continue

      const prefix = TYPE_PREFIX[node.type] || 'A'
      typeCounts[prefix] = (typeCounts[prefix] || 0) + 1
      const code = `SOP-${seqStr}-${prefix}${typeCounts[prefix]}`

      const assignment = {
        assignmentId: generateId(),
        diagramId,
        nodeId: node.nodeId,
        traceabilityCode: code,
        sequenceNumber: typeCounts[prefix],
        createdAt: ts.iso,
        createdByUserId: actedByUserId,
      }
      await db.put('traceability', assignment)

      // Update node
      node.traceabilityCode = code
      await db.put('nodes', node)

      newAssignments.push(assignment)
    }

    await auditService.log({
      entityType: 'diagram',
      entityId: diagramId,
      actionType: 'traceability_generated',
      afterSummary: { count: newAssignments.length },
      actedByUserId,
    })

    return newAssignments
  },

  async regenerateCodes(diagramId, actedByUserId) {
    const db = await getDB()
    const existing = await db.getAllFromIndex('traceability', 'by-diagram', diagramId)

    // Delete all existing
    const tx = db.transaction(['traceability', 'nodes'], 'readwrite')
    for (const a of existing) {
      await tx.objectStore('traceability').delete(a.assignmentId)
      const node = await tx.objectStore('nodes').get(a.nodeId)
      if (node) {
        node.traceabilityCode = null
        await tx.objectStore('nodes').put(node)
      }
    }
    await tx.done

    // Re-generate for all previously traced nodes
    const nodeIds = existing.map((a) => a.nodeId)
    const result = await this.generateCodes(diagramId, nodeIds, actedByUserId)

    await auditService.log({
      entityType: 'diagram',
      entityId: diagramId,
      actionType: 'traceability_regenerated',
      afterSummary: { count: result.length },
      actedByUserId,
    })

    return result
  },

  async getAssignments(diagramId) {
    const db = await getDB()
    return db.getAllFromIndex('traceability', 'by-diagram', diagramId)
  },

  validateCode(code) {
    return /^SOP-\d{3}-[SEDAN]\d+$/.test(code)
  },
}
