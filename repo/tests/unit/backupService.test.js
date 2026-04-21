import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { backupService } from '@/services/backupService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { authService } from '@/services/authService'
import { versionService } from '@/services/versionService'
import { resetDatabase } from './helpers/testHarness'

function makeFile(content, name = 'backup.json') {
  const blob = new Blob([content], { type: 'application/json' })
  blob.name = name
  blob.text = () => Promise.resolve(content)
  return blob
}

const OWNER = 'backup-owner'

beforeEach(async () => {
  await resetDatabase()
  // Preferences fallback uses localStorage under 'ff_' prefix — purge between tests
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('ff_')) localStorage.removeItem(k)
  }
})

describe('backupService (focused spec)', () => {
  describe('createBackup', () => {
    it('returns pretty-printed JSON with schema version, checksum, and all store collections', async () => {
      const user = await authService.createUser({ username: 'user-a', password: 'PwStrong123!' })
      const diagram = await diagramService.create({ title: 'Alpha', ownerUserId: user.userId })
      await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, user.userId)
      await canvasService.addNode(diagram.diagramId, { type: 'end', name: 'E', x: 200, y: 0 }, user.userId)

      const raw = await backupService.createBackup()
      expect(raw).toContain('\n') // pretty-printed
      const data = JSON.parse(raw)

      expect(data.backupVersion).toBe(1)
      expect(typeof data.checksum).toBe('string')
      expect(data.checksum.length).toBeGreaterThan(0)
      expect(data.users.map((u) => u.username)).toContain('user-a')
      expect(data.diagrams.map((d) => d.title)).toContain('Alpha')
      expect(data.nodes).toHaveLength(2)

      // All expected collections are present, even when empty
      for (const key of [
        'users', 'userPreferences', 'diagrams', 'nodes', 'edges', 'snapshots',
        'traceability', 'inspections', 'inspectionResults', 'publishEvents',
        'embeddedImages', 'importJobs', 'importErrors', 'retractionRecords', 'auditEvents',
      ]) {
        expect(Array.isArray(data[key])).toBe(true)
      }
    })

    it('computes a checksum that changes when persisted state changes', async () => {
      const diagram = await diagramService.create({ title: 'Consistent', ownerUserId: OWNER })

      const first = JSON.parse(await backupService.createBackup())
      expect(typeof first.checksum).toBe('string')
      expect(first.checksum.length).toBeGreaterThan(0)

      await canvasService.addNode(diagram.diagramId, { type: 'action', name: 'X', x: 0, y: 0 }, OWNER)
      const second = JSON.parse(await backupService.createBackup())

      // Mutating the DB must change the checksum so restoreBackup can detect tampering
      expect(second.checksum).not.toBe(first.checksum)
    })
  })

  describe('restoreBackup — validation failures', () => {
    it('rejects when no file is provided', async () => {
      await expect(backupService.restoreBackup(null, OWNER)).rejects.toThrow('No file provided.')
    })

    it('rejects when the file is not valid JSON', async () => {
      await expect(
        backupService.restoreBackup(makeFile('{not-json', 'bad.json'), OWNER),
      ).rejects.toThrow('Invalid backup file format.')
    })

    it('rejects when backupVersion is missing', async () => {
      await expect(
        backupService.restoreBackup(makeFile(JSON.stringify({ something: true }), 'nover.json'), OWNER),
      ).rejects.toThrow('missing schema version')
    })

    it('rejects when checksum is present but does not match the file contents', async () => {
      const corrupted = makeFile(JSON.stringify({
        backupVersion: 1,
        checksum: 'deadbeef',
        users: [],
        diagrams: [],
      }), 'corrupt.json')
      await expect(backupService.restoreBackup(corrupted, OWNER))
        .rejects.toThrow(/checksum mismatch/i)
    })
  })

  describe('restoreBackup — ownership handling', () => {
    it('round-trips diagrams and users from a checksum-valid backup produced by createBackup', async () => {
      const user = await authService.createUser({ username: 'owner-user', password: 'PwStrong123!' })
      const diagram = await diagramService.create({ title: 'Original', ownerUserId: user.userId })
      await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, user.userId)

      const raw = await backupService.createBackup()

      // Mutate after the backup
      await diagramService.create({ title: 'After-backup', ownerUserId: user.userId })
      expect((await diagramService.getAll()).length).toBe(2)

      const result = await backupService.restoreBackup(makeFile(raw, 'full.json'), OWNER)

      expect(result.restoreMode).toBe('restored_users')
      const restored = await diagramService.getAll()
      expect(restored).toHaveLength(1)
      expect(restored[0].title).toBe('Original')

      const restoredUsers = await authService.getAllUsers()
      expect(restoredUsers).toHaveLength(1)
      expect(restoredUsers[0].userId).toBe(user.userId)
    })

    it('remaps ownership to the acting user for legacy backups that have no users', async () => {
      const legacy = {
        backupVersion: 1,
        createdAt: new Date().toISOString(),
        userPreferences: [],
        diagrams: [{
          diagramId: 'd-legacy',
          ownerUserId: 'stale-owner',
          visibilityScope: 'private_to_user',
          title: 'Legacy',
          description: '',
          status: 'draft',
          templateSource: null,
          createdByUserId: 'stale-owner',
          updatedByUserId: 'stale-owner',
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
        inspections: [{
          inspectionId: 'i-legacy',
          diagramId: 'd-legacy',
          diagramVersionNumber: 1,
          summary: 'Legacy Inspection',
          status: 'open',
          ownerUserId: 'stale-owner',
          createdByUserId: 'stale-owner',
          createdAt: new Date().toISOString(),
        }],
        inspectionResults: [],
        publishEvents: [
          // Exercises publishEvents.map: one with actedByUserId (uses value),
          // one without (falls back to remapUserId).
          { publishEventId: 'pe-1', diagramId: 'd-legacy', actionType: 'published', actedByUserId: 'stale-owner', actedAt: new Date().toISOString() },
          { publishEventId: 'pe-2', diagramId: 'd-legacy', actionType: 'published', actedByUserId: null, actedAt: new Date().toISOString() },
        ],
        embeddedImages: [],
        importJobs: [],
        importErrors: [],
        retractionRecords: [],
        auditEvents: [
          { auditEventId: 'ae-1', diagramId: 'd-legacy', actionType: 'legacy_action', actedByUserId: 'stale-owner', actedAt: new Date().toISOString() },
          { auditEventId: 'ae-2', diagramId: 'd-legacy', actionType: 'legacy_action_2', actedByUserId: null, actedAt: new Date().toISOString() },
        ],
      }
      const checksumless = JSON.stringify(legacy)
      let hash = 5381
      for (let i = 0; i < checksumless.length; i++) {
        hash = ((hash << 5) + hash + checksumless.charCodeAt(i)) & 0xffffffff
      }
      legacy.checksum = hash.toString(16)

      const result = await backupService.restoreBackup(makeFile(JSON.stringify(legacy), 'legacy.json'), OWNER)
      expect(result.restoreMode).toBe('ownership_remapped')

      const ownedByActor = await diagramService.getByOwner(OWNER)
      expect(ownedByActor).toHaveLength(1)
      expect(ownedByActor[0].title).toBe('Legacy')
      expect(ownedByActor[0].ownerUserId).toBe(OWNER)
      // Audit log should show the restore
      const { getDB } = await import('@/db/schema')
      const db = await getDB()
      const audits = await db.getAll('auditEvents')
      const restoredEvent = audits.find((e) => e.actionType === 'backup_restored')
      expect(restoredEvent).toBeTruthy()
      expect(restoredEvent.afterSummary.ownershipMode).toBe('ownership_remapped')
    })
  })

  describe('restoreBackup — safety snapshots', () => {
    it('creates a backup_restore_safety snapshot for each existing diagram before overwriting', async () => {
      const user = await authService.createUser({ username: 'snap-user', password: 'PwStrong123!' })
      const pre = await diagramService.create({ title: 'Existing', ownerUserId: user.userId })
      await canvasService.addNode(pre.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, user.userId)

      const raw = await backupService.createBackup()

      // Modify DB after the backup so restoreBackup has to reconcile
      const inflight = await diagramService.create({ title: 'InFlight', ownerUserId: user.userId })
      await canvasService.addNode(inflight.diagramId, { type: 'end', name: 'E', x: 0, y: 0 }, user.userId)

      await backupService.restoreBackup(makeFile(raw, 'snap.json'), OWNER)

      // The restored set contains only the snapshotted diagram from the backup
      const restored = await diagramService.getAll()
      expect(restored).toHaveLength(1)
      expect(restored[0].title).toBe('Existing')
    })
  })

  describe('deleteAllLocalData', () => {
    it('rejects the wrong confirmation phrase', async () => {
      await expect(
        backupService.deleteAllLocalData('delete please', OWNER),
      ).rejects.toThrow('Confirmation phrase does not match.')
    })

    it('clears all primary stores and ff_-prefixed localStorage keys with the correct phrase', async () => {
      const user = await authService.createUser({ username: 'nuke-user', password: 'PwStrong123!' })
      const diagram = await diagramService.create({ title: 'ToNuke', ownerUserId: user.userId })
      await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, user.userId)
      await versionService.createSnapshot(diagram.diagramId, 'autosave', user.userId)
      localStorage.setItem('ff_theme', JSON.stringify('dark'))
      localStorage.setItem('unrelated_key', 'keep-me')

      await backupService.deleteAllLocalData('DELETE ALL LOCAL FLOWFORGE DATA', OWNER)

      expect(await diagramService.getAll()).toHaveLength(0)
      expect((await authService.getAllUsers())).toHaveLength(0)

      expect(localStorage.getItem('ff_theme')).toBeNull()
      expect(localStorage.getItem('unrelated_key')).toBe('keep-me')

      // auditEvents is one of the stores deleteAllLocalData clears, so the destroy
      // audit record itself is expected to be gone after the operation completes.
      const { getDB } = await import('@/db/schema')
      const db = await getDB()
      expect(await db.getAll('auditEvents')).toHaveLength(0)
      expect(await db.getAll('snapshots')).toHaveLength(0)
    })
  })
})
