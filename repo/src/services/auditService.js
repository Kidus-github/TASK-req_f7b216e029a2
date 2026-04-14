import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'

const MAX_AUDIT_EVENTS = 1000

export const auditService = {
  async log({ entityType, entityId, actionType, beforeSummary, afterSummary, actedByUserId, reason }) {
    const db = await getDB()
    const ts = getTimestamp()
    const event = {
      auditEventId: generateId(),
      entityType: entityType || 'system',
      entityId: entityId || null,
      actionType,
      beforeSummary: beforeSummary || null,
      afterSummary: afterSummary || null,
      actedByUserId: actedByUserId || null,
      actedAt: ts.iso,
      actedAtOffset: ts.offset,
      reason: reason || null,
    }
    await db.put('auditEvents', event)
    await this.pruneEvents()
    return event
  },

  async pruneEvents() {
    const db = await getDB()
    const all = await db.getAll('auditEvents')
    if (all.length <= MAX_AUDIT_EVENTS) return
    all.sort((a, b) => (a.actedAt > b.actedAt ? 1 : -1))
    const toDelete = all.slice(0, all.length - MAX_AUDIT_EVENTS)
    const tx = db.transaction('auditEvents', 'readwrite')
    for (const evt of toDelete) {
      await tx.store.delete(evt.auditEventId)
    }
    await tx.done
  },

  async getByEntity(entityType, entityId) {
    const db = await getDB()
    return db.getAllFromIndex('auditEvents', 'by-entity', [entityType, entityId])
  },

  async getByActor(userId) {
    const db = await getDB()
    return db.getAllFromIndex('auditEvents', 'by-actor', userId)
  },

  async getAll() {
    const db = await getDB()
    return db.getAll('auditEvents')
  },

  async getRecent(limit = 50) {
    const db = await getDB()
    const all = await db.getAll('auditEvents')
    all.sort((a, b) => (b.actedAt > a.actedAt ? 1 : -1))
    return all.slice(0, limit)
  },
}
