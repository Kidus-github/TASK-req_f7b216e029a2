import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { exportService } from '@/services/exportService'

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
  document.body.innerHTML = ''
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:stub'
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {}
  }
})

describe('exportService', () => {
  it('exportJSON throws for unknown diagram', async () => {
    await expect(exportService.exportJSON('missing')).rejects.toThrow('Diagram not found.')
  })

  it('slugify produces lowercase dashed slugs and trims length', () => {
    expect(exportService.slugify('My Cool Diagram!')).toBe('my-cool-diagram')
    expect(exportService.slugify('   --already-clean--   ')).toBe('already-clean')
    expect(exportService.slugify('a'.repeat(80)).length).toBe(50)
  })

  it('getTimestampSlug returns a filename-safe ISO-derived string', () => {
    const slug = exportService.getTimestampSlug()
    expect(slug).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
  })

  it('exportSVG throws if no element is provided', () => {
    expect(() => exportService.exportSVG(null)).toThrow('No SVG element provided.')
  })

  it('exportSVG serializes a real SVG element with the namespace', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '10')
    svg.setAttribute('height', '10')
    const out = exportService.exportSVG(svg)
    expect(out).toContain('<svg')
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('downloadFile triggers a temporary anchor download through the real DOM path', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    exportService.downloadFile('content', 'file.txt', 'text/plain')

    expect(document.body.children).toHaveLength(0)
    expect(createSpy).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake')
    expect(createSpy.mock.calls[0][0]).toBeInstanceOf(Blob)

    createSpy.mockRestore()
    revokeSpy.mockRestore()
    clickSpy.mockRestore()
  })

  it('downloadFile passes a Blob through unchanged', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:keep')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    const blob = new Blob(['data'], { type: 'application/json' })
    exportService.downloadFile(blob, 'doc.json', 'application/json')

    expect(clickSpy).toHaveBeenCalledOnce()
    expect(createSpy).toHaveBeenCalledWith(blob)
    expect(revokeSpy).toHaveBeenCalledWith('blob:keep')
    expect(document.body.children).toHaveLength(0)

    createSpy.mockRestore()
    revokeSpy.mockRestore()
    clickSpy.mockRestore()
  })

  it('exportPNG rejects when no element is provided', async () => {
    await expect(exportService.exportPNG(null)).rejects.toThrow('No SVG element provided.')
  })
})
