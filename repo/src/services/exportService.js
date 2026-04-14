import { getDB } from '@/db/schema'

const PNG_MAX_EDGE = 8000

export const exportService = {
  async exportJSON(diagramId) {
    const db = await getDB()
    const diagram = await db.get('diagrams', diagramId)
    if (!diagram) throw new Error('Diagram not found.')

    const nodes = await db.getAllFromIndex('nodes', 'by-diagram', diagramId)
    const edges = await db.getAllFromIndex('edges', 'by-diagram', diagramId)
    const traceability = await db.getAllFromIndex('traceability', 'by-diagram', diagramId)
    const inspections = await db.getAllFromIndex('inspections', 'by-diagram', diagramId)

    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      diagram: {
        diagramId: diagram.diagramId,
        title: diagram.title,
        description: diagram.description,
        status: diagram.status,
        currentVersionNumber: diagram.currentVersionNumber,
      },
      nodes: nodes.map((n) => ({
        nodeId: n.nodeId,
        type: n.type,
        name: n.name,
        shortDescription: n.shortDescription,
        ownerTag: n.ownerTag,
        departmentTag: n.departmentTag,
        color: n.color,
        icon: n.icon,
        statusStyle: n.statusStyle,
        imageId: n.imageId || null,
        imageAlt: n.imageAlt || '',
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        traceabilityCode: n.traceabilityCode,
      })),
      edges: edges.map((e) => ({
        edgeId: e.edgeId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        routingMode: e.routingMode,
        arrowed: e.arrowed,
        label: e.label,
      })),
      traceability: traceability.map((t) => ({
        traceabilityCode: t.traceabilityCode,
        nodeId: t.nodeId,
      })),
      inspectionSummary: {
        count: inspections.length,
      },
      embeddedImages: (await db.getAllFromIndex('embeddedImages', 'by-diagram', diagramId)).map((image) => ({
        imageId: image.imageId,
        fileName: image.fileName,
        mimeType: image.mimeType,
        byteSize: image.byteSize,
      })),
    }

    const json = JSON.stringify(payload, null, 2)
    let hash = 5381
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) + hash + json.charCodeAt(i)) & 0xffffffff
    }
    payload.checksum = hash.toString(16)

    return JSON.stringify(payload, null, 2)
  },

  exportSVG(svgElement) {
    if (!svgElement) throw new Error('No SVG element provided.')
    const clone = svgElement.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const serializer = new XMLSerializer()
    return serializer.serializeToString(clone)
  },

  async exportPNG(svgElement, scale = 1) {
    if (!svgElement) throw new Error('No SVG element provided.')

    const svgData = this.exportSVG(svgElement)
    const rect = svgElement.getBoundingClientRect()

    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/pngExportWorker.js', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (e) => {
        worker.terminate()
        if (e.data.ok) {
          const blob = new Blob([e.data.buffer], { type: 'image/png' })
          resolve(blob)
        } else {
          reject(new Error(e.data.error || 'PNG export failed.'))
        }
      }

      worker.onerror = (err) => {
        worker.terminate()
        reject(new Error('PNG export worker error: ' + (err.message || 'unknown')))
      }

      worker.postMessage({
        svgData,
        width: rect.width,
        height: rect.height,
        scale,
      })
    })
  },

  downloadFile(content, filename, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)
  },

  getTimestampSlug() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  },

  PNG_MAX_EDGE,
}
