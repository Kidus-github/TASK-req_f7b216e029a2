import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { auditService } from './auditService'
import { versionService } from './versionService'

export const backupService = {
  async createBackup() {
    const db = await getDB()
    const data = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      users: await db.getAll('users'),
      userPreferences: await db.getAll('userPreferences'),
      diagrams: await db.getAll('diagrams'),
      nodes: await db.getAll('nodes'),
      edges: await db.getAll('edges'),
      snapshots: await db.getAll('snapshots'),
      traceability: await db.getAll('traceability'),
      inspections: await db.getAll('inspections'),
      inspectionResults: await db.getAll('inspectionResults'),
      publishEvents: await db.getAll('publishEvents'),
      embeddedImages: await db.getAll('embeddedImages'),
      importJobs: await db.getAll('importJobs'),
      importErrors: await db.getAll('importErrors'),
      retractionRecords: await db.getAll('retractionRecords'),
      auditEvents: await db.getAll('auditEvents'),
    }

    // Compute checksum
    const json = JSON.stringify(data)
    let hash = 5381
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) + hash + json.charCodeAt(i)) & 0xffffffff
    }
    data.checksum = hash.toString(16)

    return JSON.stringify(data, null, 2)
  },

  async restoreBackup(file, actedByUserId) {
    if (!file) throw new Error('No file provided.')

    const text = await file.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('Invalid backup file format.')
    }

    if (!data.backupVersion) {
      throw new Error('Invalid backup file: missing schema version.')
    }

    // Validate checksum
    const savedChecksum = data.checksum
    delete data.checksum
    const json = JSON.stringify(data)
    let hash = 5381
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) + hash + json.charCodeAt(i)) & 0xffffffff
    }
    if (savedChecksum && hash.toString(16) !== savedChecksum) {
      throw new Error('Backup file checksum mismatch. File may be corrupted.')
    }

    const db = await getDB()
    const normalized = normalizeBackupForRestore(data, actedByUserId)

    // Create safety snapshot for all current diagrams
    const currentDiagrams = await db.getAll('diagrams')
    for (const d of currentDiagrams) {
      try {
        await versionService.createSnapshot(d.diagramId, 'backup_restore_safety', actedByUserId)
      } catch {
        // Best effort
      }
    }

    // Restore in transaction. Sessions and encryption metadata are not restored so users must sign in again.
    const stores = [
      'users',
      'userPreferences',
      'diagrams',
      'nodes',
      'edges',
      'snapshots',
      'traceability',
      'inspections',
      'inspectionResults',
      'publishEvents',
      'embeddedImages',
      'importJobs',
      'importErrors',
      'retractionRecords',
      'auditEvents',
    ]
    const tx = db.transaction(stores, 'readwrite')

    try {
      // Clear existing data
      for (const store of stores) {
        const allKeys = await tx.objectStore(store).getAllKeys()
        for (const key of allKeys) {
          await tx.objectStore(store).delete(key)
        }
      }

      // Write backup data
      if (normalized.users) for (const user of normalized.users) await tx.objectStore('users').put(user)
      if (normalized.userPreferences) for (const pref of normalized.userPreferences) await tx.objectStore('userPreferences').put(pref)
      if (normalized.diagrams) for (const d of normalized.diagrams) await tx.objectStore('diagrams').put(d)
      if (normalized.nodes) for (const n of normalized.nodes) await tx.objectStore('nodes').put(n)
      if (normalized.edges) for (const e of normalized.edges) await tx.objectStore('edges').put(e)
      if (normalized.snapshots) for (const s of normalized.snapshots) await tx.objectStore('snapshots').put(s)
      if (normalized.traceability) for (const t of normalized.traceability) await tx.objectStore('traceability').put(t)
      if (normalized.inspections) for (const i of normalized.inspections) await tx.objectStore('inspections').put(i)
      if (normalized.inspectionResults) for (const r of normalized.inspectionResults) await tx.objectStore('inspectionResults').put(r)
      if (normalized.publishEvents) for (const p of normalized.publishEvents) await tx.objectStore('publishEvents').put(p)
      if (normalized.embeddedImages) for (const image of normalized.embeddedImages) await tx.objectStore('embeddedImages').put(image)
      if (normalized.importJobs) for (const job of normalized.importJobs) await tx.objectStore('importJobs').put(job)
      if (normalized.importErrors) for (const err of normalized.importErrors) await tx.objectStore('importErrors').put(err)
      if (normalized.retractionRecords) for (const record of normalized.retractionRecords) await tx.objectStore('retractionRecords').put(record)
      if (normalized.auditEvents) for (const audit of normalized.auditEvents) await tx.objectStore('auditEvents').put(audit)

      await tx.done
    } catch (e) {
      throw new Error(`Restore failed: ${e.message}. Previous data may need to be re-restored.`)
    }

    await auditService.log({
      entityType: 'system',
      entityId: null,
      actionType: 'backup_restored',
      afterSummary: {
        fileName: file.name,
        diagrams: normalized.diagrams?.length || 0,
        users: normalized.users?.length || 0,
        ownershipMode: normalized.restoreMode,
      },
      actedByUserId,
    })

    return {
      diagrams: normalized.diagrams?.length || 0,
      users: normalized.users?.length || 0,
      restoreMode: normalized.restoreMode,
    }
  },

  async deleteAllLocalData(confirmPhrase, actedByUserId) {
    if (confirmPhrase !== 'DELETE ALL LOCAL FLOWFORGE DATA') {
      throw new Error('Confirmation phrase does not match.')
    }

    await auditService.log({
      entityType: 'system',
      entityId: null,
      actionType: 'delete_all_local_data',
      actedByUserId,
    })

    const db = await getDB()
    const stores = [
      'users',
      'userPreferences',
      'diagrams', 'nodes', 'edges', 'snapshots', 'traceability',
      'inspections', 'inspectionResults', 'publishEvents', 'embeddedImages',
      'importJobs', 'importErrors', 'sessions', 'encryptionMetadata', 'retractionRecords', 'auditEvents',
    ]

    const tx = db.transaction(stores, 'readwrite')
    for (const store of stores) {
      await tx.objectStore(store).clear()
    }
    await tx.done

    // Clear localStorage preferences
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('ff_'))
    for (const k of keys) localStorage.removeItem(k)
  },
}

function normalizeBackupForRestore(data, actedByUserId) {
  const hasUsers = Array.isArray(data.users) && data.users.length > 0
  if (hasUsers) {
    return {
      ...data,
      restoreMode: 'restored_users',
    }
  }

  const remapUserId = actedByUserId || null
  const remapDiagram = (diagram) => ({
    ...diagram,
    ownerUserId: remapUserId,
    createdByUserId: diagram.createdByUserId || remapUserId,
    updatedByUserId: remapUserId,
    publishedByUserId: diagram.publishedByUserId || null,
    retractedByUserId: diagram.retractedByUserId || null,
  })

  return {
    ...data,
    users: [],
    userPreferences: [],
    diagrams: (data.diagrams || []).map(remapDiagram),
    inspections: (data.inspections || []).map((inspection) => ({
      ...inspection,
      ownerUserId: remapUserId,
      createdByUserId: remapUserId,
    })),
    publishEvents: (data.publishEvents || []).map((event) => ({
      ...event,
      actedByUserId: event.actedByUserId || remapUserId,
    })),
    auditEvents: (data.auditEvents || []).map((event) => ({
      ...event,
      actedByUserId: event.actedByUserId || remapUserId,
    })),
    restoreMode: 'ownership_remapped',
  }
}
