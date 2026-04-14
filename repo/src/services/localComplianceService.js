import { getDB, getTimestamp } from '@/db/schema'

const DEFAULT_NOTE = {
  auditRetentionNotes: '',
  updatedAt: null,
  updatedByUserId: null,
}

export const localComplianceService = {
  async getAuditRetentionNote(userId) {
    const db = await getDB()
    const pref = await db.get('userPreferences', userId)
    return {
      ...DEFAULT_NOTE,
      ...(pref || {}),
    }
  },

  async saveAuditRetentionNote(userId, note, actedByUserId) {
    if (!userId) throw new Error('User is required.')
    if (typeof note !== 'string') throw new Error('Audit retention note must be text.')
    if (!note.trim()) throw new Error('Audit retention note is required.')
    if (note.length > 2000) throw new Error('Audit retention note must be at most 2000 characters.')

    const db = await getDB()
    const existing = (await db.get('userPreferences', userId)) || { userId }
    const ts = getTimestamp()
    const next = {
      ...existing,
      userId,
      auditRetentionNotes: note.trim(),
      updatedAt: ts.iso,
      updatedByUserId: actedByUserId || userId,
    }
    await db.put('userPreferences', next)
    return next
  },
}
