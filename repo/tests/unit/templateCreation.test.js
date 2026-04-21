import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { templateService, TEMPLATES } from '@/services/templateService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'

const OWNER = 'test-owner'

beforeEach(async () => {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of ['diagrams', 'nodes', 'edges', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch { /* */ }
  }
})

describe('templateService', () => {
  it('returns at least one template', () => {
    const all = templateService.getAll()
    expect(all.length).toBeGreaterThanOrEqual(1)
  })

  it('each template has id, name, description, nodes, edges', () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.id).toBeTruthy()
      expect(tpl.name).toBeTruthy()
      expect(tpl.description).toBeTruthy()
      expect(Array.isArray(tpl.nodes)).toBe(true)
      expect(Array.isArray(tpl.edges)).toBe(true)
      expect(tpl.nodes.length).toBeGreaterThan(0)
    }
  })

  it('getById returns correct template', () => {
    const tpl = templateService.getById('incident-response')
    expect(tpl).not.toBeNull()
    expect(tpl.name).toBe('Incident Response')
  })

  it('getById returns null for unknown id', () => {
    expect(templateService.getById('nonexistent')).toBeNull()
  })
})

describe('template-based diagram creation', () => {
  it('creates a blank diagram with no nodes', async () => {
    const d = await diagramService.create({ title: 'Blank', ownerUserId: OWNER })
    const nodes = await diagramService.getNodes(d.diagramId)
    expect(nodes.length).toBe(0)
  })

  it('creates a diagram from Incident Response template with correct node count', async () => {
    const tpl = templateService.getById('incident-response')
    const d = await diagramService.create({ title: tpl.name, ownerUserId: OWNER })

    const nodeIdMap = new Map()
    for (let i = 0; i < tpl.nodes.length; i++) {
      const tn = tpl.nodes[i]
      const node = await canvasService.addNode(d.diagramId, {
        type: tn.type,
        name: tn.name,
        x: tn.x || 0,
        y: tn.y || 0,
      }, OWNER)
      nodeIdMap.set(i, node.nodeId)
    }

    for (const te of tpl.edges) {
      await canvasService.addEdge(d.diagramId, {
        sourceNodeId: nodeIdMap.get(te.from),
        targetNodeId: nodeIdMap.get(te.to),
        label: te.label || '',
      })
    }

    const nodes = await diagramService.getNodes(d.diagramId)
    const edges = await diagramService.getEdges(d.diagramId)
    expect(nodes.length).toBe(tpl.nodes.length)
    expect(edges.length).toBe(tpl.edges.length)
    expect(nodes.some(n => n.type === 'start')).toBe(true)
    expect(nodes.some(n => n.type === 'end')).toBe(true)
  })

  it('creates diagram from Approval Chain template', async () => {
    const tpl = templateService.getById('approval-chain')
    const d = await diagramService.create({ title: tpl.name, ownerUserId: OWNER })

    const nodeIdMap = new Map()
    for (let i = 0; i < tpl.nodes.length; i++) {
      const node = await canvasService.addNode(d.diagramId, {
        type: tpl.nodes[i].type,
        name: tpl.nodes[i].name,
        x: tpl.nodes[i].x || 0,
        y: tpl.nodes[i].y || 0,
      }, OWNER)
      nodeIdMap.set(i, node.nodeId)
    }

    const nodes = await diagramService.getNodes(d.diagramId)
    expect(nodes.length).toBe(tpl.nodes.length)
    expect(nodes.find(n => n.name === 'Manager Review')).toBeTruthy()
  })
})
