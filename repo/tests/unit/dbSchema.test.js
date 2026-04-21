import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { getDB, getTimestamp } from '@/db/schema'

async function clearDB() {
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

beforeEach(async () => {
  await clearDB()
})

describe('db schema', () => {
  it('creates every expected object store', async () => {
    const db = await getDB()
    const storeNames = Array.from(db.objectStoreNames).sort()

    expect(storeNames).toEqual([
      'auditEvents',
      'diagrams',
      'edges',
      'embeddedImages',
      'encryptionMetadata',
      'importErrors',
      'importJobs',
      'inspectionResults',
      'inspections',
      'nodes',
      'publishEvents',
      'retractionRecords',
      'sessions',
      'snapshots',
      'traceability',
      'userPreferences',
      'users',
    ])
  })

  it('creates the expected indexes for critical stores', async () => {
    const db = await getDB()

    expect(Array.from(db.transaction('users').store.indexNames).sort()).toEqual(['by-username'])
    expect(Array.from(db.transaction('diagrams').store.indexNames).sort()).toEqual(['by-owner', 'by-status'])
    expect(Array.from(db.transaction('nodes').store.indexNames).sort()).toEqual(['by-diagram'])
    expect(Array.from(db.transaction('edges').store.indexNames).sort()).toEqual(['by-diagram'])
    expect(Array.from(db.transaction('snapshots').store.indexNames).sort()).toEqual([
      'by-diagram',
      'by-diagram-version',
    ])
    expect(Array.from(db.transaction('traceability').store.indexNames).sort()).toEqual([
      'by-diagram',
      'by-node',
    ])
    expect(Array.from(db.transaction('auditEvents').store.indexNames).sort()).toEqual([
      'by-actor',
      'by-entity',
      'by-time',
    ])
    expect(Array.from(db.transaction('sessions').store.indexNames).sort()).toEqual(['by-user'])
    expect(Array.from(db.transaction('encryptionMetadata').store.indexNames).sort()).toEqual(['by-scope'])
  })

  it('reuses the same schema without creating duplicate stores or indexes on repeated opens', async () => {
    const first = await getDB()
    const firstStores = Array.from(first.objectStoreNames).sort()
    const firstDiagramIndexes = Array.from(first.transaction('diagrams').store.indexNames).sort()

    first.close()

    const second = await getDB()
    const secondStores = Array.from(second.objectStoreNames).sort()
    const secondDiagramIndexes = Array.from(second.transaction('diagrams').store.indexNames).sort()

    expect(secondStores).toEqual(firstStores)
    expect(secondDiagramIndexes).toEqual(firstDiagramIndexes)
  })
})

describe('getTimestamp', () => {
  it('returns an ISO timestamp plus timezone offset', () => {
    const ts = getTimestamp()
    expect(typeof ts.iso).toBe('string')
    expect(typeof ts.offset).toBe('number')
    expect(new Date(ts.iso).toISOString()).toBe(ts.iso)
  })
})
