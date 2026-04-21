import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { diagramService } from '@/services/diagramService'

async function clearDB() {
  const { getDB } = await import('@/db/schema')
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

describe('diagramService', () => {
  describe('create validation', () => {
    it('rejects empty title', async () => {
      await expect(
        diagramService.create({ title: '', ownerUserId: 'test' })
      ).rejects.toThrow('Title is required')
    })

    it('rejects whitespace-only title', async () => {
      await expect(
        diagramService.create({ title: '   ', ownerUserId: 'test' })
      ).rejects.toThrow('Title is required')
    })

    it('rejects title over 200 chars', async () => {
      await expect(
        diagramService.create({ title: 'a'.repeat(201), ownerUserId: 'test' })
      ).rejects.toThrow('at most 200')
    })

    it('rejects description over 1000 chars', async () => {
      await expect(
        diagramService.create({
          title: 'Valid',
          description: 'a'.repeat(1001),
          ownerUserId: 'test',
        })
      ).rejects.toThrow('Description too long')
    })
  })

  describe('transitionStatus', () => {
    it('rejects retraction reasons shorter than 10 characters on a real persisted diagram', async () => {
      const diagram = await diagramService.create({
        title: 'Retractable Diagram',
        ownerUserId: 'author-1',
      })
      await diagramService.transitionStatus(diagram.diagramId, 'published', 'author-1')

      await expect(
        diagramService.transitionStatus(diagram.diagramId, 'retracted', 'reviewer-1', 'too short')
      ).rejects.toThrow('Retraction reason must be at least 10 characters.')

      const persisted = await diagramService.getById(diagram.diagramId)
      expect(persisted.status).toBe('published')
      expect(persisted.retractedAt).toBeNull()
      expect(persisted.retractionReason).toBeNull()
    })

    it('persists publish metadata and records a publish event', async () => {
      const diagram = await diagramService.create({
        title: 'Publishable Diagram',
        ownerUserId: 'author-2',
      })

      const published = await diagramService.transitionStatus(
        diagram.diagramId,
        'published',
        'reviewer-2'
      )

      expect(published.status).toBe('published')
      expect(published.publishedByUserId).toBe('reviewer-2')
      expect(published.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(published.visibilityScope).toBe('shared_local_library')

      const { getDB } = await import('@/db/schema')
      const db = await getDB()
      const persisted = await db.get('diagrams', diagram.diagramId)
      const events = await db.getAllFromIndex('publishEvents', 'by-diagram', diagram.diagramId)

      expect(persisted.status).toBe('published')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        diagramId: diagram.diagramId,
        fromStatus: 'draft',
        toStatus: 'published',
        actedByUserId: 'reviewer-2',
      })
    })

    it('persists retraction metadata, visibility reset, and event reason', async () => {
      const diagram = await diagramService.create({
        title: 'Published Then Retracted',
        ownerUserId: 'author-3',
      })
      await diagramService.transitionStatus(diagram.diagramId, 'published', 'reviewer-3')

      const retracted = await diagramService.transitionStatus(
        diagram.diagramId,
        'retracted',
        'reviewer-3',
        'Retraction is justified.'
      )

      expect(retracted.status).toBe('retracted')
      expect(retracted.retractedByUserId).toBe('reviewer-3')
      expect(retracted.retractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(retracted.retractionReason).toBe('Retraction is justified.')
      expect(retracted.visibilityScope).toBe('private_to_user')

      const { getDB } = await import('@/db/schema')
      const db = await getDB()
      const events = await db.getAllFromIndex('publishEvents', 'by-diagram', diagram.diagramId)
      const retractionEvent = events.find((event) => event.toStatus === 'retracted')

      expect(events).toHaveLength(2)
      expect(retractionEvent).toMatchObject({
        diagramId: diagram.diagramId,
        fromStatus: 'published',
        toStatus: 'retracted',
        reason: 'Retraction is justified.',
        actedByUserId: 'reviewer-3',
      })
    })
  })
})
