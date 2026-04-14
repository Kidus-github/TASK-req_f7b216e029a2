import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { auditService } from './auditService'

const MAX_NODES = 500
const MAX_EDGES = 800
const VALID_NODE_TYPES = ['start', 'end', 'decision', 'action', 'note']
const VALID_ROUTING_MODES = ['orthogonal', 'curve']
const VALID_STATUS_STYLES = ['default', 'draft', 'approved', 'warning', 'blocked']

export const canvasService = {
  async addNode(diagramId, nodeData, actedByUserId) {
    const db = await getDB()

    const existingNodes = await db.getAllFromIndex('nodes', 'by-diagram', diagramId)
    if (existingNodes.length >= MAX_NODES) {
      throw new Error(`Maximum ${MAX_NODES} nodes per diagram reached.`)
    }

    if (!VALID_NODE_TYPES.includes(nodeData.type)) {
      throw new Error(`Invalid node type: ${nodeData.type}`)
    }
    if (!nodeData.name || nodeData.name.trim().length === 0) {
      throw new Error('Node name is required.')
    }
    if (nodeData.name.length > 120) throw new Error('Node name must be at most 120 characters.')
    if (nodeData.shortDescription && nodeData.shortDescription.length > 280) {
      throw new Error('Short description must be at most 280 characters.')
    }
    if (nodeData.ownerTag && nodeData.ownerTag.length > 80) {
      throw new Error('Owner tag must be at most 80 characters.')
    }
    if (nodeData.departmentTag && nodeData.departmentTag.length > 80) {
      throw new Error('Department tag must be at most 80 characters.')
    }

    const ts = getTimestamp()
    const node = {
      nodeId: generateId(),
      diagramId,
      type: nodeData.type,
      name: nodeData.name.trim(),
      shortDescription: nodeData.shortDescription || '',
      ownerTag: nodeData.ownerTag || '',
      departmentTag: nodeData.departmentTag || '',
      color: nodeData.color || getDefaultColor(nodeData.type),
      icon: nodeData.icon || '',
      statusStyle: VALID_STATUS_STYLES.includes(nodeData.statusStyle) ? nodeData.statusStyle : 'default',
      imageId: nodeData.imageId || null,
      imageAlt: nodeData.imageAlt || '',
      x: nodeData.x ?? 100,
      y: nodeData.y ?? 100,
      width: nodeData.width ?? getDefaultWidth(nodeData.type),
      height: nodeData.height ?? getDefaultHeight(nodeData.type),
      traceabilityCode: null,
      createdAt: ts.iso,
      updatedAt: ts.iso,
    }

    await db.put('nodes', node)
    return node
  },

  async updateNode(nodeId, updates) {
    const db = await getDB()
    const node = await db.get('nodes', nodeId)
    if (!node) throw new Error('Node not found.')

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) throw new Error('Node name is required.')
      if (updates.name.length > 120) throw new Error('Node name must be at most 120 characters.')
      node.name = updates.name.trim()
    }
    if (updates.shortDescription !== undefined) {
      if (updates.shortDescription && updates.shortDescription.length > 280) {
        throw new Error('Short description must be at most 280 characters.')
      }
      node.shortDescription = updates.shortDescription
    }
    if (updates.ownerTag !== undefined) {
      if (updates.ownerTag && updates.ownerTag.length > 80) {
        throw new Error('Owner tag must be at most 80 characters.')
      }
      node.ownerTag = updates.ownerTag
    }
    if (updates.departmentTag !== undefined) {
      if (updates.departmentTag && updates.departmentTag.length > 80) {
        throw new Error('Department tag must be at most 80 characters.')
      }
      node.departmentTag = updates.departmentTag
    }
    if (updates.color !== undefined) node.color = updates.color
    if (updates.icon !== undefined) node.icon = updates.icon
    if (updates.statusStyle !== undefined) {
      node.statusStyle = VALID_STATUS_STYLES.includes(updates.statusStyle) ? updates.statusStyle : 'default'
    }
    if (updates.imageId !== undefined) node.imageId = updates.imageId
    if (updates.imageAlt !== undefined) node.imageAlt = updates.imageAlt
    if (updates.x !== undefined) node.x = updates.x
    if (updates.y !== undefined) node.y = updates.y
    if (updates.width !== undefined) node.width = updates.width
    if (updates.height !== undefined) node.height = updates.height

    node.updatedAt = getTimestamp().iso
    await db.put('nodes', node)
    return node
  },

  async deleteNode(nodeId, diagramId, actedByUserId) {
    const db = await getDB()
    const node = await db.get('nodes', nodeId)
    if (!node) throw new Error('Node not found.')

    // Find connected edges
    const allEdges = await db.getAllFromIndex('edges', 'by-diagram', diagramId)
    const connectedEdges = allEdges.filter(
      (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId
    )

    // Atomic deletion: node + all connected edges
    const tx = db.transaction(['nodes', 'edges'], 'readwrite')
    await tx.objectStore('nodes').delete(nodeId)
    for (const edge of connectedEdges) {
      await tx.objectStore('edges').delete(edge.edgeId)
    }
    await tx.done

    return { deletedNode: node, deletedEdges: connectedEdges }
  },

  async addEdge(diagramId, edgeData) {
    const db = await getDB()

    const existingEdges = await db.getAllFromIndex('edges', 'by-diagram', diagramId)
    if (existingEdges.length >= MAX_EDGES) {
      throw new Error(`Maximum ${MAX_EDGES} edges per diagram reached.`)
    }

    // Validate source and target exist in same diagram
    const sourceNode = await db.get('nodes', edgeData.sourceNodeId)
    const targetNode = await db.get('nodes', edgeData.targetNodeId)

    if (!sourceNode || sourceNode.diagramId !== diagramId) {
      throw new Error('Source node not found in this diagram.')
    }
    if (!targetNode || targetNode.diagramId !== diagramId) {
      throw new Error('Target node not found in this diagram.')
    }

    // No self-loops
    if (edgeData.sourceNodeId === edgeData.targetNodeId) {
      throw new Error('Self-loop edges are not allowed.')
    }

    // No duplicate exact source-target-label
    const label = (edgeData.label || '').trim()
    const duplicate = existingEdges.find(
      (e) =>
        e.sourceNodeId === edgeData.sourceNodeId &&
        e.targetNodeId === edgeData.targetNodeId &&
        (e.label || '').trim() === label
    )
    if (duplicate) {
      throw new Error('Duplicate edge already exists with the same source, target, and label.')
    }

    const ts = getTimestamp()
    const edge = {
      edgeId: generateId(),
      diagramId,
      sourceNodeId: edgeData.sourceNodeId,
      targetNodeId: edgeData.targetNodeId,
      routingMode: VALID_ROUTING_MODES.includes(edgeData.routingMode) ? edgeData.routingMode : 'orthogonal',
      arrowed: edgeData.arrowed !== false,
      label: label || '',
      createdAt: ts.iso,
      updatedAt: ts.iso,
    }

    await db.put('edges', edge)
    return edge
  },

  async updateEdge(edgeId, updates) {
    const db = await getDB()
    const edge = await db.get('edges', edgeId)
    if (!edge) throw new Error('Edge not found.')

    if (updates.routingMode !== undefined && VALID_ROUTING_MODES.includes(updates.routingMode)) {
      edge.routingMode = updates.routingMode
    }
    if (updates.arrowed !== undefined) edge.arrowed = updates.arrowed
    if (updates.label !== undefined) edge.label = updates.label

    edge.updatedAt = getTimestamp().iso
    await db.put('edges', edge)
    return edge
  },

  async deleteEdge(edgeId) {
    const db = await getDB()
    const edge = await db.get('edges', edgeId)
    if (!edge) throw new Error('Edge not found.')
    await db.delete('edges', edgeId)
    return edge
  },

  async getNodes(diagramId) {
    const db = await getDB()
    return db.getAllFromIndex('nodes', 'by-diagram', diagramId)
  },

  async getEdges(diagramId) {
    const db = await getDB()
    return db.getAllFromIndex('edges', 'by-diagram', diagramId)
  },

  MAX_NODES,
  MAX_EDGES,
  VALID_STATUS_STYLES,
}

function getDefaultColor(type) {
  const colors = {
    start: '#22c55e',
    end: '#ef4444',
    decision: '#f59e0b',
    action: '#3b82f6',
    note: '#8b5cf6',
  }
  return colors[type] || '#6b7280'
}

function getDefaultWidth(type) {
  return type === 'note' ? 180 : 160
}

function getDefaultHeight(type) {
  return type === 'decision' ? 100 : 80
}
