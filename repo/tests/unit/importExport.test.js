import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { importService } from '@/services/importService'
import { exportService } from '@/services/exportService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'

// jsdom File/Blob polyfill helper - Blob.size is readonly, so use a wrapper
function makeFile(content, name) {
  return {
    name: name || 'test.json',
    size: content.length,
    text: () => Promise.resolve(content),
  }
}

const OWNER = 'test-owner'

beforeEach(async () => {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of ['diagrams', 'nodes', 'edges', 'importJobs', 'importErrors', 'auditEvents',
    'snapshots', 'traceability', 'inspections', 'publishEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch { /* */ }
  }
})

describe('import service', () => {
  it('imports valid JSON with nodes and edges', async () => {
    const d = await diagramService.create({ title: 'Import Target', ownerUserId: OWNER })
    const json = JSON.stringify({
      nodes: [
        { nodeId: 'n1', type: 'start', name: 'Start', x: 0, y: 0 },
        { nodeId: 'n2', type: 'end', name: 'End', x: 100, y: 0 },
      ],
      edges: [
        { sourceNodeId: 'n1', targetNodeId: 'n2' },
      ],
    })
    const file = makeFile(json, 'test.json')
    const result = await importService.importJSON(file, d.diagramId, OWNER)
    expect(result.job.status).toMatch(/completed|partial_success/)
    expect(result.job.summaryCounts.nodes).toBe(2)
    expect(result.job.summaryCounts.edges).toBe(1)
  })

  it('rejects file with invalid JSON', async () => {
    const d = await diagramService.create({ title: 'Target', ownerUserId: OWNER })
    const file = makeFile('not json', 'bad.json')
    const result = await importService.importJSON(file, d.diagramId, OWNER)
    expect(result.job.status).toBe('failed')
    expect(result.errors.some(e => e.code === 'INVALID_JSON')).toBe(true)
  })

  it('rejects nodes with missing required fields', async () => {
    const d = await diagramService.create({ title: 'Target', ownerUserId: OWNER })
    const json = JSON.stringify({
      nodes: [{ type: 'start', name: 'No ID' }],
      edges: [],
    })
    const file = makeFile(json, 'missing.json')
    const result = await importService.importJSON(file, d.diagramId, OWNER)
    expect(result.job.status).toBe('failed')
    expect(result.errors.some(e => e.code === 'MISSING_FIELD')).toBe(true)
  })

  it('rejects dangling edge references', async () => {
    const d = await diagramService.create({ title: 'Target', ownerUserId: OWNER })
    const json = JSON.stringify({
      nodes: [{ nodeId: 'n1', type: 'start', name: 'S' }],
      edges: [{ sourceNodeId: 'n1', targetNodeId: 'n999' }],
    })
    const file = makeFile(json, 'dangling.json')
    const result = await importService.importJSON(file, d.diagramId, OWNER)
    expect(result.job.status).toBe('failed')
    expect(result.errors.some(e => e.code === 'IMPORT_DANGLING_EDGE')).toBe(true)
  })

  it('handles duplicate nodes by merging', async () => {
    const d = await diagramService.create({ title: 'Dedup', ownerUserId: OWNER })
    const json = JSON.stringify({
      nodes: [
        { nodeId: 'a', type: 'action', name: 'Task' },
        { nodeId: 'b', type: 'action', name: 'Task' },
        { nodeId: 'c', type: 'end', name: 'End' },
      ],
      edges: [
        { sourceNodeId: 'a', targetNodeId: 'c' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
      ],
    })
    const file = makeFile(json, 'dupes.json')
    const result = await importService.importJSON(file, d.diagramId, OWNER)
    expect(result.job.summaryCounts.duplicatesRemoved).toBe(1)
  })

  it('summarizes import issues with exact path and field context', () => {
    const message = importService.summarizeIssueForToast({
      message: 'Missing nodeId.',
      context: {
        jsonPath: '$.nodes[0].nodeId',
        field: 'nodeId',
      },
    })

    expect(message).toContain('$.nodes[0].nodeId')
    expect(message).toContain('nodeId')
  })
})

describe('export service', () => {
  it('exports diagram as JSON with schema version and checksum', async () => {
    const d = await diagramService.create({ title: 'Export Me', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, OWNER)
    const json = await exportService.exportJSON(d.diagramId)
    const data = JSON.parse(json)
    expect(data.schemaVersion).toBe(1)
    expect(data.checksum).toBeTruthy()
    expect(data.diagram.title).toBe('Export Me')
    expect(data.nodes.length).toBe(1)
  })

  it('slugify produces URL-safe strings', () => {
    expect(exportService.slugify('My SOP Flow!')).toBe('my-sop-flow')
    expect(exportService.slugify('  Hello World  ')).toBe('hello-world')
  })

  it('exports node icon, status, and image metadata', async () => {
    const d = await diagramService.create({ title: 'Styled', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, {
      type: 'action',
      name: 'Styled Step',
      icon: 'shield',
      statusStyle: 'approved',
      imageId: 'img-1',
      imageAlt: 'step',
      x: 0,
      y: 0,
    }, OWNER)

    const { getDB } = await import('@/db/schema')
    const db = await getDB()
    await db.put('embeddedImages', {
      imageId: 'img-1',
      diagramId: d.diagramId,
      fileName: 'step.png',
      mimeType: 'image/png',
      byteSize: 120,
      dataUrl: 'data:image/png;base64,AA==',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUserId: OWNER,
    })

    const json = await exportService.exportJSON(d.diagramId)
    const data = JSON.parse(json)
    expect(data.nodes[0].icon).toBe('shield')
    expect(data.nodes[0].statusStyle).toBe('approved')
    expect(data.nodes[0].imageId).toBe('img-1')
    expect(data.embeddedImages.length).toBe(1)
  })
})
