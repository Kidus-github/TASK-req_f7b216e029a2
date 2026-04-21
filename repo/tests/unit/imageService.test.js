import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { imageService } from '@/services/imageService'

const OWNER = 'image-owner'

beforeEach(async () => {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const store of ['embeddedImages', 'auditEvents']) {
    try {
      const tx = db.transaction(store, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch {
      // ignore
    }
  }

  global.FileReader = class {
    readAsDataURL(file) {
      this.result = `data:${file.type};base64,QUJD`
      if (this.onload) this.onload()
    }
  }
})

describe('imageService', () => {
  it('stores and retrieves embedded images', async () => {
    const file = { name: 'step.png', type: 'image/png', size: 128 }
    const saved = await imageService.saveEmbeddedImage('diagram-1', file, OWNER)

    expect(saved.diagramId).toBe('diagram-1')
    expect(saved.dataUrl).toContain('data:image/png')

    const images = await imageService.getImages('diagram-1')
    expect(images).toHaveLength(1)
    expect(images[0].fileName).toBe('step.png')
  })

  it('deletes embedded images', async () => {
    const file = { name: 'step.png', type: 'image/png', size: 128 }
    const saved = await imageService.saveEmbeddedImage('diagram-1', file, OWNER)
    await imageService.deleteImage(saved.imageId, OWNER)

    const images = await imageService.getImages('diagram-1')
    expect(images).toHaveLength(0)
  })
})
