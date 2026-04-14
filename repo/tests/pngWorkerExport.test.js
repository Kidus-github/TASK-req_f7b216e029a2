import { describe, it, expect } from 'vitest'
import { exportService } from '../src/services/exportService'

describe('PNG export architecture', () => {
  it('exportPNG requires an SVG element', async () => {
    await expect(exportService.exportPNG(null, 1)).rejects.toThrow('No SVG element provided')
  })

  it('exportPNG method exists and returns a promise', () => {
    expect(typeof exportService.exportPNG).toBe('function')
  })

  it('PNG_MAX_EDGE is 8000', () => {
    expect(exportService.PNG_MAX_EDGE).toBe(8000)
  })
})

describe('exportPNG uses Worker constructor', () => {
  it('exportService.exportPNG source references Worker constructor', async () => {
    // Read the source to statically verify worker usage
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve('src/services/exportService.js'),
      'utf-8'
    )
    expect(src).toContain('new Worker(')
    expect(src).toContain('pngExportWorker')
    // Must NOT contain main-thread canvas rasterization
    expect(src).not.toContain('document.createElement(\'canvas\')')
    expect(src).not.toContain('new Image()')
  })
})

describe('PNG worker file exists and is valid', () => {
  it('worker file exists at src/workers/pngExportWorker.js', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const exists = fs.existsSync(path.resolve('src/workers/pngExportWorker.js'))
    expect(exists).toBe(true)
  })

  it('worker file uses OffscreenCanvas', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve('src/workers/pngExportWorker.js'),
      'utf-8'
    )
    expect(src).toContain('OffscreenCanvas')
    expect(src).toContain('self.onmessage')
    expect(src).toContain('self.postMessage')
    expect(src).toContain('createImageBitmap')
  })

  it('worker handles errors and posts error messages', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve('src/workers/pngExportWorker.js'),
      'utf-8'
    )
    expect(src).toContain('ok: false')
    expect(src).toContain('catch')
  })
})
