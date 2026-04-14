import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'

export const inspectionService = {
  async createInspection(diagramId, diagramVersionNumber, ownerUserId, summary) {
    const db = await getDB()
    const ts = getTimestamp()
    const inspection = {
      inspectionId: generateId(),
      diagramId,
      diagramVersionNumber,
      ownerUserId,
      createdByUserId: ownerUserId,
      createdAt: ts.iso,
      summary: summary || '',
      status: 'open',
    }
    await db.put('inspections', inspection)
    return inspection
  },

  async completeInspection(inspectionId) {
    const db = await getDB()
    const insp = await db.get('inspections', inspectionId)
    if (!insp) throw new Error('Inspection not found.')
    if (insp.status !== 'open') throw new Error('Only open inspections can be completed.')
    insp.status = 'completed'
    await db.put('inspections', insp)
    return insp
  },

  async supersedeInspection(inspectionId) {
    const db = await getDB()
    const insp = await db.get('inspections', inspectionId)
    if (!insp) throw new Error('Inspection not found.')
    if (insp.status === 'superseded') throw new Error('Already superseded.')
    insp.status = 'superseded'
    await db.put('inspections', insp)
    return insp
  },

  async addResult(inspectionId, resultData) {
    if (!resultData.reviewerName || resultData.reviewerName.trim().length === 0) {
      throw new Error('Reviewer name is required.')
    }
    if (resultData.reviewerName.length > 120) {
      throw new Error('Reviewer name must be at most 120 characters.')
    }
    if (!['pass', 'fail'].includes(resultData.result)) {
      throw new Error('Result must be "pass" or "fail".')
    }
    if (resultData.result === 'fail' && (!resultData.notes || resultData.notes.trim().length === 0)) {
      throw new Error('Notes are required when result is fail.')
    }

    const db = await getDB()
    const ts = getTimestamp()
    const result = {
      resultId: generateId(),
      inspectionId,
      nodeId: resultData.nodeId || null,
      traceabilityCode: resultData.traceabilityCode || null,
      result: resultData.result,
      notes: resultData.notes || '',
      timestamp: ts.iso,
      timestampOffset: ts.offset,
      reviewerName: resultData.reviewerName.trim(),
      reviewerUserId: resultData.reviewerUserId || null,
    }

    if (!result.nodeId && !result.traceabilityCode) {
      throw new Error('Either nodeId or traceabilityCode is required.')
    }

    await db.put('inspectionResults', result)
    return result
  },

  async getInspections(diagramId) {
    const db = await getDB()
    const all = await db.getAllFromIndex('inspections', 'by-diagram', diagramId)
    all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    return all
  },

  async getResults(inspectionId) {
    const db = await getDB()
    return db.getAllFromIndex('inspectionResults', 'by-inspection', inspectionId)
  },

  async getInspectionStats(diagramId) {
    const inspections = await this.getInspections(diagramId)
    const db = await getDB()
    let pass = 0
    let fail = 0
    for (const insp of inspections) {
      const results = await db.getAllFromIndex('inspectionResults', 'by-inspection', insp.inspectionId)
      for (const r of results) {
        if (r.result === 'pass') pass++
        else fail++
      }
    }
    return { total: inspections.length, pass, fail }
  },
}
