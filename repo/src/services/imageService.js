import { getDB, getTimestamp } from '@/db/schema'
import { generateId } from '@/utils/id'
import { auditService } from './auditService'

const MAX_IMAGE_SIZE = 3 * 1024 * 1024

export const imageService = {
  async saveEmbeddedImage(diagramId, file, actedByUserId) {
    if (!file) throw new Error('No image selected.')
    if (!file.type?.startsWith('image/')) throw new Error('Only image files can be embedded.')
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image exceeds ${Math.round(MAX_IMAGE_SIZE / 1024 / 1024)} MB limit.`)
    }

    const db = await getDB()
    const ts = getTimestamp()
    const dataUrl = await fileToDataUrl(file)

    const image = {
      imageId: generateId(),
      diagramId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      dataUrl,
      createdAt: ts.iso,
      updatedAt: ts.iso,
      createdByUserId: actedByUserId,
    }

    await db.put('embeddedImages', image)

    await auditService.log({
      entityType: 'diagram',
      entityId: diagramId,
      actionType: 'embedded_image_added',
      afterSummary: { fileName: file.name, byteSize: file.size },
      actedByUserId,
    })

    return image
  },

  async getImages(diagramId) {
    const db = await getDB()
    return db.getAllFromIndex('embeddedImages', 'by-diagram', diagramId)
  },

  async getImage(imageId) {
    const db = await getDB()
    return db.get('embeddedImages', imageId)
  },

  async deleteImage(imageId, actedByUserId) {
    const db = await getDB()
    const image = await db.get('embeddedImages', imageId)
    if (!image) return

    await db.delete('embeddedImages', imageId)

    await auditService.log({
      entityType: 'diagram',
      entityId: image.diagramId,
      actionType: 'embedded_image_removed',
      beforeSummary: { imageId, fileName: image.fileName },
      actedByUserId,
    })
  },

  MAX_IMAGE_SIZE,
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}
