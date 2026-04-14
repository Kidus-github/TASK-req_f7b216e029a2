import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { localComplianceService } from '../src/services/localComplianceService'

beforeEach(async () => {
  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  const tx = db.transaction('userPreferences', 'readwrite')
  await tx.store.clear()
  await tx.done
})

describe('localComplianceService', () => {
  it('persists and reloads audit retention notes by user', async () => {
    const saved = await localComplianceService.saveAuditRetentionNote(
      'user-1',
      'Retain local audit events for 12 months on this workstation.',
      'user-1'
    )

    expect(saved.auditRetentionNotes).toContain('12 months')
    expect(saved.updatedAt).toBeTruthy()

    const loaded = await localComplianceService.getAuditRetentionNote('user-1')
    expect(loaded.auditRetentionNotes).toContain('12 months')
    expect(loaded.updatedByUserId).toBe('user-1')
  })

  it('rejects empty retention notes', async () => {
    await expect(
      localComplianceService.saveAuditRetentionNote('user-1', '   ', 'user-1')
    ).rejects.toThrow('Audit retention note is required')
  })
})
