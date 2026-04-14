import { getDB } from '@/db/schema'

export const publishService = {
  async validateForPublish(diagramId) {
    const db = await getDB()
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) return [{ code: 'NOT_FOUND', message: 'Diagram not found.' }]

    const errors = []

    // Title present
    if (!diagram.title || diagram.title.trim().length === 0) {
      errors.push({ code: 'NO_TITLE', message: 'Diagram title is required.' })
    }

    const nodes = await db.getAllFromIndex('nodes', 'by-diagram', diagramId)
    const edges = await db.getAllFromIndex('edges', 'by-diagram', diagramId)

    // At least 1 node
    if (nodes.length === 0) {
      errors.push({ code: 'NO_NODES', message: 'At least one node is required.' })
    }

    // At least 1 Start node
    if (!nodes.some((n) => n.type === 'start')) {
      errors.push({ code: 'NO_START', message: 'At least one Start node is required.' })
    }

    // At least 1 End node
    if (!nodes.some((n) => n.type === 'end')) {
      errors.push({ code: 'NO_END', message: 'At least one End node is required.' })
    }

    // All edges reference valid nodes
    const nodeIds = new Set(nodes.map((n) => n.nodeId))
    for (const edge of edges) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        errors.push({
          code: 'DANGLING_EDGE',
          message: `Edge references missing source node: ${edge.sourceNodeId.slice(0, 8)}...`,
        })
      }
      if (!nodeIds.has(edge.targetNodeId)) {
        errors.push({
          code: 'DANGLING_EDGE',
          message: `Edge references missing target node: ${edge.targetNodeId.slice(0, 8)}...`,
        })
      }
    }

    // No isolated non-Note nodes
    const connectedIds = new Set()
    for (const e of edges) {
      connectedIds.add(e.sourceNodeId)
      connectedIds.add(e.targetNodeId)
    }
    for (const node of nodes) {
      if (node.type !== 'note' && !connectedIds.has(node.nodeId)) {
        errors.push({
          code: 'ISOLATED_NODE',
          message: `Node "${node.name}" is isolated (not connected to any edge).`,
        })
      }
    }

    // No duplicate traceability codes
    const traceability = await db.getAllFromIndex('traceability', 'by-diagram', diagramId)
    const codes = new Set()
    for (const t of traceability) {
      if (codes.has(t.traceabilityCode)) {
        errors.push({
          code: 'DUPLICATE_CODE',
          message: `Duplicate traceability code: ${t.traceabilityCode}`,
        })
      }
      codes.add(t.traceabilityCode)
    }

    // Current version must be saved (not dirty)
    // This check is done at the UI level since we can't check Pinia from here

    return errors
  },
}
