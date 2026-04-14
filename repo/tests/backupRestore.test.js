import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { backupService } from '../src/services/backupService'
import { diagramService } from '../src/services/diagramService'
import { canvasService } from '../src/services/canvasService'
import { authService } from '../src/services/authService'

// jsdom File does not have .text(), so we create a helper
function makeFile(content, name) {
  const blob = new Blob([content], { type: 'application/json' })
  blob.name = name || 'backup.json'
  blob.text = () => Promise.resolve(content)
  return blob
}

const OWNER = 'test-owner'

beforeEach(async () => {
  const { getDB } = await import('../src/db/schema')
  const db = await getDB()
  const stores = ['diagrams', 'nodes', 'edges', 'snapshots', 'traceability',
    'inspections', 'inspectionResults', 'publishEvents', 'auditEvents',
    'importJobs', 'importErrors', 'sessions', 'encryptionMetadata', 'retractionRecords',
    'embeddedImages', 'users', 'userPreferences']
  for (const store of stores) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch {
      // store may not exist
    }
  }
})

describe('backup and restore', () => {
  it('createBackup returns valid JSON with checksum', async () => {
    await diagramService.create({ title: 'Test Diagram', ownerUserId: OWNER })
    await authService.createUser({ username: 'backup-user', password: 'password123' })
    const backup = await backupService.createBackup()
    const data = JSON.parse(backup)
    expect(data.backupVersion).toBe(1)
    expect(data.checksum).toBeTruthy()
    expect(data.diagrams.length).toBe(1)
    expect(data.users.length).toBe(1)
    expect(data.diagrams[0].title).toBe('Test Diagram')
  })

  it('backup includes nodes and edges', async () => {
    const d = await diagramService.create({ title: 'With Content', ownerUserId: OWNER })
    await canvasService.addNode(d.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, OWNER)
    await canvasService.addNode(d.diagramId, { type: 'end', name: 'E', x: 100, y: 0 }, OWNER)

    const backup = await backupService.createBackup()
    const data = JSON.parse(backup)
    expect(data.nodes.length).toBe(2)
  })

  it('restoreBackup replaces all data', async () => {
    await authService.createUser({ username: 'restore-user', password: 'password123' })
    await diagramService.create({ title: 'Before Restore', ownerUserId: OWNER })
    const backup = await backupService.createBackup()

    // Create another diagram after backup
    await diagramService.create({ title: 'After Backup', ownerUserId: OWNER })
    const before = await diagramService.getAll()
    expect(before.length).toBe(2)

    // Restore
    const file = makeFile(backup, 'backup.json')
    await backupService.restoreBackup(file, OWNER)

    const after = await diagramService.getAll()
    expect(after.length).toBe(1)
    expect(after[0].title).toBe('Before Restore')
    const users = await authService.getAllUsers()
    expect(users.length).toBe(1)
    expect(users[0].username).toBe('restore-user')
  })

  it('restores diagrams so they remain accessible to restored owners', async () => {
    const user = await authService.createUser({ username: 'owner-user', password: 'password123' })
    await diagramService.create({ title: 'Owned Draft', ownerUserId: user.userId })
    const backup = await backupService.createBackup()

    await backupService.deleteAllLocalData('DELETE ALL LOCAL FLOWFORGE DATA', OWNER)

    const file = makeFile(backup, 'owned-backup.json')
    const result = await backupService.restoreBackup(file, OWNER)

    expect(result.users).toBe(1)
    const restoredUsers = await authService.getAllUsers()
    expect(restoredUsers[0].userId).toBe(user.userId)
    const owned = await diagramService.getByOwner(user.userId)
    expect(owned.length).toBe(1)
    expect(owned[0].title).toBe('Owned Draft')
  })

  it('remaps ownership for legacy backups that do not contain users', async () => {
    const legacyBackup = JSON.stringify({
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      userPreferences: [],
      diagrams: [{
        diagramId: 'diagram-1',
        ownerUserId: 'legacy-owner',
        visibilityScope: 'private_to_user',
        title: 'Legacy Draft',
        description: '',
        status: 'draft',
        templateSource: null,
        createdByUserId: 'legacy-owner',
        updatedByUserId: 'legacy-owner',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: null,
        publishedByUserId: null,
        retractedAt: null,
        retractedByUserId: null,
        retractionReason: null,
        currentVersionNumber: 1,
        currentRevisionHash: null,
      }],
      nodes: [],
      edges: [],
      snapshots: [],
      traceability: [],
      inspections: [],
      inspectionResults: [],
      publishEvents: [],
      embeddedImages: [],
      importJobs: [],
      importErrors: [],
      retractionRecords: [],
      auditEvents: [],
    })
    const parsed = JSON.parse(legacyBackup)
    const checksumless = JSON.stringify(parsed)
    let hash = 5381
    for (let i = 0; i < checksumless.length; i++) {
      hash = ((hash << 5) + hash + checksumless.charCodeAt(i)) & 0xffffffff
    }
    parsed.checksum = hash.toString(16)

    const result = await backupService.restoreBackup(makeFile(JSON.stringify(parsed), 'legacy.json'), OWNER)
    expect(result.restoreMode).toBe('ownership_remapped')
    const owned = await diagramService.getByOwner(OWNER)
    expect(owned.length).toBe(1)
    expect(owned[0].title).toBe('Legacy Draft')
  })

  it('restoreBackup rejects invalid JSON', async () => {
    const file = makeFile('not json', 'bad.json')
    await expect(backupService.restoreBackup(file, OWNER)).rejects.toThrow('Invalid backup file format')
  })

  it('restoreBackup rejects missing schema version', async () => {
    const file = makeFile(JSON.stringify({ foo: 1 }), 'nover.json')
    await expect(backupService.restoreBackup(file, OWNER)).rejects.toThrow('missing schema version')
  })
})

describe('deleteAllLocalData', () => {
  it('rejects wrong confirmation phrase', async () => {
    await expect(
      backupService.deleteAllLocalData('wrong phrase', OWNER)
    ).rejects.toThrow('Confirmation phrase does not match')
  })

  it('clears all diagram data with correct phrase', async () => {
    await diagramService.create({ title: 'To Delete', ownerUserId: OWNER })
    const before = await diagramService.getAll()
    expect(before.length).toBe(1)

    await backupService.deleteAllLocalData('DELETE ALL LOCAL FLOWFORGE DATA', OWNER)

    const after = await diagramService.getAll()
    expect(after.length).toBe(0)
  })
})
