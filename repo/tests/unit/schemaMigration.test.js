import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { getDB } from '@/db/schema'

const DB_NAME = 'flowforge-sop'

const EXPECTED_SCHEMA = {
  users: { keyPath: 'userId', indexes: { 'by-username': { keyPath: 'usernameLower', unique: true } } },
  userPreferences: { keyPath: 'userId', indexes: {} },
  diagrams: {
    keyPath: 'diagramId',
    indexes: {
      'by-owner': { keyPath: 'ownerUserId', unique: false },
      'by-status': { keyPath: 'status', unique: false },
    },
  },
  nodes: { keyPath: 'nodeId', indexes: { 'by-diagram': { keyPath: 'diagramId', unique: false } } },
  edges: { keyPath: 'edgeId', indexes: { 'by-diagram': { keyPath: 'diagramId', unique: false } } },
  snapshots: {
    keyPath: 'snapshotId',
    indexes: {
      'by-diagram': { keyPath: 'diagramId', unique: false },
      'by-diagram-version': { keyPath: ['diagramId', 'versionNumber'], unique: false },
    },
  },
  traceability: {
    keyPath: 'assignmentId',
    indexes: {
      'by-diagram': { keyPath: 'diagramId', unique: false },
      'by-node': { keyPath: 'nodeId', unique: false },
    },
  },
  inspections: { keyPath: 'inspectionId', indexes: { 'by-diagram': { keyPath: 'diagramId', unique: false } } },
  inspectionResults: { keyPath: 'resultId', indexes: { 'by-inspection': { keyPath: 'inspectionId', unique: false } } },
  publishEvents: { keyPath: 'publishEventId', indexes: { 'by-diagram': { keyPath: 'diagramId', unique: false } } },
  embeddedImages: { keyPath: 'imageId', indexes: { 'by-diagram': { keyPath: 'diagramId', unique: false } } },
  importJobs: { keyPath: 'importJobId', indexes: {} },
  importErrors: { keyPath: 'importErrorId', indexes: { 'by-job': { keyPath: 'importJobId', unique: false } } },
  auditEvents: {
    keyPath: 'auditEventId',
    indexes: {
      'by-entity': { keyPath: ['entityType', 'entityId'], unique: false },
      'by-actor': { keyPath: 'actedByUserId', unique: false },
      'by-time': { keyPath: 'actedAt', unique: false },
    },
  },
  sessions: { keyPath: 'sessionId', indexes: { 'by-user': { keyPath: 'userId', unique: false } } },
  encryptionMetadata: {
    keyPath: 'encryptionRefId',
    indexes: { 'by-scope': { keyPath: ['scopeType', 'keyVersion'], unique: false } },
  },
  retractionRecords: { keyPath: 'retractionId', indexes: { 'by-diagram': { keyPath: 'diagramId', unique: false } } },
}

// NOTE: we intentionally do NOT deleteDB() in beforeEach. Other test files already
// hold long-lived connections to DB_NAME through their own getDB() imports, and a
// blocked delete here would hang for the full hook timeout. Instead, each assertion
// below is written to be resilient to pre-existing rows and to verify the schema
// shape rather than the contents. The one test that legitimately needs a clean slate
// (the downgrade test) handles isolation itself.

describe('src/db/schema.js — initial upgrade from version 0', () => {
  it('creates every expected object store with the right keyPath', async () => {
    const db = await getDB()
    const storeNames = Array.from(db.objectStoreNames).sort()
    expect(storeNames).toEqual(Object.keys(EXPECTED_SCHEMA).sort())

    for (const [name, spec] of Object.entries(EXPECTED_SCHEMA)) {
      const tx = db.transaction(name, 'readonly')
      expect(tx.store.keyPath).toBe(spec.keyPath)
      await tx.done
    }
    db.close()
  })

  it('creates every expected index with the correct keyPath and uniqueness', async () => {
    const db = await getDB()
    for (const [name, spec] of Object.entries(EXPECTED_SCHEMA)) {
      const tx = db.transaction(name, 'readonly')
      const store = tx.store
      const indexNames = Array.from(store.indexNames).sort()
      const expectedIndexNames = Object.keys(spec.indexes).sort()
      expect(indexNames).toEqual(expectedIndexNames)

      for (const [indexName, indexSpec] of Object.entries(spec.indexes)) {
        const index = store.index(indexName)
        if (Array.isArray(indexSpec.keyPath)) {
          expect(Array.from(index.keyPath)).toEqual(indexSpec.keyPath)
        } else {
          expect(index.keyPath).toBe(indexSpec.keyPath)
        }
        expect(index.unique).toBe(indexSpec.unique ?? false)
      }
      await tx.done
    }
    db.close()
  })

  it('enforces the by-username unique index on users', async () => {
    const db = await getDB()
    // Use a uniquely suffixed username so prior-test data can't accidentally satisfy
    // the duplicate check.
    const tag = `unique_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    const tx1 = db.transaction('users', 'readwrite')
    await tx1.store.put({ userId: `u-${tag}-1`, username: tag, usernameLower: tag })
    await tx1.done

    const tx2 = db.transaction('users', 'readwrite')
    const txDone = tx2.done.catch(() => 'aborted')
    let putFailed = false
    try {
      await tx2.store.put({ userId: `u-${tag}-2`, username: tag.toUpperCase(), usernameLower: tag })
    } catch {
      putFailed = true
    }
    const txResult = await txDone
    expect(putFailed || txResult === 'aborted').toBe(true)
    db.close()
  })
})

describe('src/db/schema.js — idempotent upgrade on re-open', () => {
  it('re-opening an existing database does not re-run createObjectStore (no errors, stores preserved)', async () => {
    const first = await getDB()
    const tx = first.transaction('users', 'readwrite')
    await tx.store.put({ userId: 'persist-1', username: 'keeper', usernameLower: 'keeper' })
    await tx.done
    first.close()

    const second = await getDB()
    const got = await second.get('users', 'persist-1')
    expect(got?.username).toBe('keeper')
    expect(Array.from(second.objectStoreNames).sort()).toEqual(Object.keys(EXPECTED_SCHEMA).sort())
    second.close()
  })
})

describe('src/db/schema.js — compound-index read paths', () => {
  it('snapshots by-diagram-version composite index returns rows for a specific (diagramId, versionNumber)', async () => {
    const db = await getDB()
    const tag = `d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const tx = db.transaction('snapshots', 'readwrite')
    await tx.store.put({ snapshotId: `${tag}-s1`, diagramId: tag, versionNumber: 1 })
    await tx.store.put({ snapshotId: `${tag}-s2`, diagramId: tag, versionNumber: 2 })
    await tx.done

    const match = await db.getAllFromIndex('snapshots', 'by-diagram-version', [tag, 2])
    expect(match).toHaveLength(1)
    expect(match[0].snapshotId).toBe(`${tag}-s2`)
    db.close()
  })

  it('auditEvents by-entity composite index returns rows for a specific (entityType, entityId)', async () => {
    const db = await getDB()
    const tag = `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const tx = db.transaction('auditEvents', 'readwrite')
    await tx.store.put({ auditEventId: `${tag}-1`, entityType: 'diagram', entityId: tag, actedAt: '2026-01-01T00:00:00Z' })
    await tx.store.put({ auditEventId: `${tag}-2`, entityType: 'diagram', entityId: `${tag}-other`, actedAt: '2026-01-01T00:00:01Z' })
    await tx.done

    const match = await db.getAllFromIndex('auditEvents', 'by-entity', ['diagram', tag])
    expect(match).toHaveLength(1)
    expect(match[0].auditEventId).toBe(`${tag}-1`)
    db.close()
  })
})

describe('src/db/schema.js — downgrade rejection', () => {
  // This test mutates the on-disk schema version. To avoid stomping on other test
  // files' state it uses an isolated db name and exercises the same IndexedDB
  // downgrade-rejection invariant that getDB() relies on.
  it('IndexedDB refuses to open a database at a lower version than the one already on disk', async () => {
    const TEST_DB = `schema-downgrade-${Date.now()}`
    // First open at v1
    const v1 = await openDB(TEST_DB, 1, { upgrade() {} })
    v1.close()
    // Bump to v2
    const v2 = await openDB(TEST_DB, 2, { upgrade() {} })
    v2.close()
    // Attempting v1 now must reject with a VersionError
    let rejected = false
    try {
      const v1again = await openDB(TEST_DB, 1, { upgrade() {} })
      v1again.close()
    } catch {
      rejected = true
    }
    expect(rejected).toBe(true)
    await deleteDB(TEST_DB).catch(() => {})
  })
})
