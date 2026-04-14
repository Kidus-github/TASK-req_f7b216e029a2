import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { auditService } from './auditService'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_RECORDS = 1000
const VALID_NODE_TYPES = ['start', 'end', 'decision', 'action', 'note']

export const importService = {
  async importJSON(file, targetDiagramId, actedByUserId) {
    const jobId = generateId()
    const db = await getDB()
    const ts = getTimestamp()

    const job = {
      importJobId: jobId,
      fileName: file.name,
      startedAt: ts.iso,
      completedAt: null,
      status: 'pending',
      summaryCounts: {},
      errorCount: 0,
      createdByUserId: actedByUserId,
    }
    await db.put('importJobs', job)

    // Phase 1: Parse and validate
    job.status = 'validating'
    await db.put('importJobs', job)

    if (file.size > MAX_FILE_SIZE) {
      return this._failJob(db, job, [{ code: 'FILE_TOO_LARGE', message: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit.`, severity: 'error' }])
    }

    let data
    try {
      const text = await file.text()
      data = JSON.parse(text)
    } catch (e) {
      return this._failJob(db, job, [{ code: 'INVALID_JSON', message: 'File is not valid JSON.', severity: 'error' }])
    }

    const nodes = data.nodes || []
    const edges = data.edges || []

    if (nodes.length + edges.length > MAX_RECORDS) {
      return this._failJob(db, job, [{
        code: 'TOO_MANY_RECORDS',
        message: `Import contains ${nodes.length + edges.length} records, exceeding the ${MAX_RECORDS} limit.`,
        severity: 'error',
      }])
    }

    const errors = []
    const warnings = []

    // Validate nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      if (!n.nodeId) errors.push({ code: 'MISSING_FIELD', message: 'Missing nodeId.', context: { jsonPath: `$.nodes[${i}].nodeId`, field: 'nodeId' }, severity: 'error' })
      if (!n.type || !VALID_NODE_TYPES.includes(n.type)) errors.push({ code: 'INVALID_TYPE', message: `Invalid node type: ${n.type}`, context: { jsonPath: `$.nodes[${i}].type`, field: 'type' }, severity: 'error' })
      if (!n.name || n.name.trim().length === 0) errors.push({ code: 'MISSING_FIELD', message: 'Missing node name.', context: { jsonPath: `$.nodes[${i}].name`, field: 'name' }, severity: 'error' })
    }

    // Validate edges
    const nodeIdSet = new Set(nodes.map((n) => n.nodeId))
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]
      if (!e.sourceNodeId) errors.push({ code: 'MISSING_FIELD', message: 'Missing sourceNodeId.', context: { jsonPath: `$.edges[${i}].sourceNodeId`, field: 'sourceNodeId' }, severity: 'error' })
      if (!e.targetNodeId) errors.push({ code: 'MISSING_FIELD', message: 'Missing targetNodeId.', context: { jsonPath: `$.edges[${i}].targetNodeId`, field: 'targetNodeId' }, severity: 'error' })
      if (e.sourceNodeId && !nodeIdSet.has(e.sourceNodeId)) {
        errors.push({ code: 'IMPORT_DANGLING_EDGE', message: 'Source node not found in import.', context: { jsonPath: `$.edges[${i}].sourceNodeId`, field: 'sourceNodeId' }, severity: 'error' })
      }
      if (e.targetNodeId && !nodeIdSet.has(e.targetNodeId)) {
        errors.push({ code: 'IMPORT_DANGLING_EDGE', message: 'Target node not found in import.', context: { jsonPath: `$.edges[${i}].targetNodeId`, field: 'targetNodeId' }, severity: 'error' })
      }
    }

    if (errors.length > 0) {
      return this._failJob(db, job, errors)
    }

    // Phase 2: Dedup
    const dedupMap = new Map() // key -> canonical nodeId
    const dedupNodes = []
    let dupeCount = 0

    for (const n of nodes) {
      const key = `${n.name.trim().toLowerCase()}|${n.type.toLowerCase()}`
      if (dedupMap.has(key)) {
        dupeCount++
        warnings.push({ code: 'DUPLICATE_MERGED', message: `Duplicate node "${n.name}" (${n.type}) merged.`, severity: 'warning' })
        dedupMap.set(n.nodeId, dedupMap.get(key))
      } else {
        dedupMap.set(key, n.nodeId)
        dedupMap.set(n.nodeId, n.nodeId)
        dedupNodes.push(n)
      }
    }

    // Remap edges
    const dedupEdges = []
    const edgeKeys = new Set()
    for (const e of edges) {
      const src = dedupMap.get(e.sourceNodeId) || e.sourceNodeId
      const tgt = dedupMap.get(e.targetNodeId) || e.targetNodeId
      const label = (e.label || '').trim()
      const eKey = `${src}|${tgt}|${label}`
      if (edgeKeys.has(eKey)) {
        warnings.push({ code: 'DUPLICATE_EDGE_MERGED', message: 'Duplicate edge removed.', severity: 'warning' })
        continue
      }
      edgeKeys.add(eKey)
      dedupEdges.push({ ...e, sourceNodeId: src, targetNodeId: tgt })
    }

    // Check capacity
    const existingNodes = await db.getAllFromIndex('nodes', 'by-diagram', targetDiagramId)
    const existingEdges = await db.getAllFromIndex('edges', 'by-diagram', targetDiagramId)
    if (existingNodes.length + dedupNodes.length > 500) {
      return this._failJob(db, job, [{ code: 'NODE_CAP', message: `Import would exceed 500 node limit (current: ${existingNodes.length}, importing: ${dedupNodes.length}).`, severity: 'error' }])
    }
    if (existingEdges.length + dedupEdges.length > 800) {
      return this._failJob(db, job, [{ code: 'EDGE_CAP', message: `Import would exceed 800 edge limit.`, severity: 'error' }])
    }

    // Phase 3: Apply in single transaction
    try {
      const tx = db.transaction(['nodes', 'edges', 'importJobs'], 'readwrite')
      for (const n of dedupNodes) {
        const newId = generateId()
        const oldId = n.nodeId
        // Remap
        for (const e of dedupEdges) {
          if (e.sourceNodeId === oldId) e.sourceNodeId = newId
          if (e.targetNodeId === oldId) e.targetNodeId = newId
        }
        await tx.objectStore('nodes').put({
          nodeId: newId,
          diagramId: targetDiagramId,
          type: n.type,
          name: n.name.trim(),
          shortDescription: n.shortDescription || '',
          ownerTag: n.ownerTag || '',
          departmentTag: n.departmentTag || '',
          color: n.color || '#6b7280',
          icon: n.icon || '',
          statusStyle: n.statusStyle || 'default',
          x: n.x ?? 100,
          y: n.y ?? 100,
          width: n.width ?? 160,
          height: n.height ?? 80,
          traceabilityCode: null,
          createdAt: ts.iso,
          updatedAt: ts.iso,
        })
      }

      for (const e of dedupEdges) {
        await tx.objectStore('edges').put({
          edgeId: generateId(),
          diagramId: targetDiagramId,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          routingMode: e.routingMode || 'orthogonal',
          arrowed: e.arrowed !== false,
          label: e.label || '',
          createdAt: ts.iso,
          updatedAt: ts.iso,
        })
      }

      job.status = warnings.length > 0 ? 'partial_success' : 'completed'
      job.completedAt = getTimestamp().iso
      job.summaryCounts = { nodes: dedupNodes.length, edges: dedupEdges.length, duplicatesRemoved: dupeCount }
      job.errorCount = warnings.length
      await tx.objectStore('importJobs').put(job)
      await tx.done
    } catch (e) {
      return this._failJob(db, job, [{ code: 'TX_FAILED', message: `Transaction failed: ${e.message}`, severity: 'error' }])
    }

    // Log errors/warnings
    for (const w of warnings) {
      await db.put('importErrors', {
        importErrorId: generateId(),
        importJobId: jobId,
        jsonPath: w.context?.jsonPath || null,
        rowIndex: null,
        fieldName: w.context?.field || null,
        message: w.message,
        severity: w.severity,
      })
    }

    await auditService.log({
      entityType: 'diagram',
      entityId: targetDiagramId,
      actionType: 'import_completed',
      afterSummary: job.summaryCounts,
      actedByUserId,
    })

    return { job, errors: [], warnings }
  },

  async _failJob(db, job, errors) {
    job.status = 'failed'
    job.completedAt = getTimestamp().iso
    job.errorCount = errors.length
    await db.put('importJobs', job)

    for (const err of errors) {
      await db.put('importErrors', {
        importErrorId: generateId(),
        importJobId: job.importJobId,
        jsonPath: err.context?.jsonPath || null,
        rowIndex: null,
        fieldName: err.context?.field || null,
        message: err.message,
        severity: err.severity || 'error',
      })
    }

    return { job, errors, warnings: [] }
  },

  async getImportErrors(jobId) {
    const db = await getDB()
    return db.getAllFromIndex('importErrors', 'by-job', jobId)
  },

  summarizeIssueForToast(issue) {
    if (!issue) return 'Import failed.'
    const path = issue.context?.jsonPath || issue.jsonPath
    const field = issue.context?.field || issue.fieldName
    if (path && field) {
      return `Import issue at ${path} (${field}): ${issue.message}`
    }
    if (path) {
      return `Import issue at ${path}: ${issue.message}`
    }
    return issue.message || 'Import failed.'
  },
}
