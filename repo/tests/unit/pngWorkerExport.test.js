import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportService } from '@/services/exportService'

/**
 * These tests exercise the actual PNG export worker code path — no
 * string-grepping the source. The worker module is loaded with a simulated
 * `self` that provides OffscreenCanvas + createImageBitmap + postMessage, and
 * its onmessage handler is invoked with real inputs.
 */

function installWorkerEnv({ failBitmap = false } = {}) {
  const drawCalls = []
  const rects = []
  const bitmapClosed = { value: false }

  class OffscreenCanvasStub {
    constructor(width, height) {
      this.width = width
      this.height = height
    }
    getContext() {
      return {
        set fillStyle(v) {
          this._fill = v
        },
        fillRect(x, y, w, h) {
          rects.push({ x, y, w, h })
        },
        drawImage(bitmap, x, y) {
          drawCalls.push({ bitmap, x, y })
        },
      }
    }
    async convertToBlob() {
      return {
        arrayBuffer: async () => new ArrayBuffer(32),
        type: 'image/png',
      }
    }
  }

  const createImageBitmapStub = vi.fn(async (blob, opts) => {
    if (failBitmap) throw new Error('decode failed')
    return {
      width: opts?.resizeWidth ?? 100,
      height: opts?.resizeHeight ?? 100,
      close() {
        bitmapClosed.value = true
      },
    }
  })

  const posted = []
  const selfStub = {
    onmessage: null,
    postMessage: (msg, transfer) => posted.push({ msg, transfer }),
  }

  globalThis.self = selfStub
  globalThis.OffscreenCanvas = OffscreenCanvasStub
  globalThis.createImageBitmap = createImageBitmapStub
  if (!globalThis.Blob) {
    globalThis.Blob = class BlobPolyfill {
      constructor(parts, opts) {
        this.parts = parts
        this.type = opts?.type
      }
    }
  }

  return { selfStub, posted, drawCalls, rects, bitmapClosed, createImageBitmapStub }
}

async function loadWorker() {
  vi.resetModules()
  // Import for side effect: the worker registers self.onmessage at import time.
  await import('@/workers/pngExportWorker.js')
}

async function waitForPost(posted) {
  for (let i = 0; i < 100; i++) {
    if (posted.length > 0) return posted[0]
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('Worker never posted a message')
}

describe('pngExportWorker (direct execution)', () => {
  let env

  beforeEach(() => {
    env = installWorkerEnv()
  })

  afterEach(() => {
    delete globalThis.self
    delete globalThis.OffscreenCanvas
    delete globalThis.createImageBitmap
    vi.resetModules()
  })

  it('renders a white background and reports the scaled dimensions', async () => {
    await loadWorker()
    expect(typeof env.selfStub.onmessage).toBe('function')

    await env.selfStub.onmessage({
      data: { svgData: '<svg/>', width: 400, height: 200, scale: 2 },
    })

    const { msg, transfer } = await waitForPost(env.posted)
    expect(msg.ok).toBe(true)
    expect(msg.width).toBe(800)
    expect(msg.height).toBe(400)
    expect(msg.buffer).toBeInstanceOf(ArrayBuffer)
    expect(transfer).toEqual([msg.buffer])

    expect(env.rects).toHaveLength(1)
    expect(env.rects[0]).toMatchObject({ x: 0, y: 0, w: 800, h: 400 })

    expect(env.drawCalls).toHaveLength(1)
    expect(env.bitmapClosed.value).toBe(true)
  })

  it('clamps the longest edge to PNG_MAX_EDGE (8000) preserving aspect ratio', async () => {
    await loadWorker()
    await env.selfStub.onmessage({
      data: { svgData: '<svg/>', width: 10000, height: 5000, scale: 1 },
    })
    const { msg } = await waitForPost(env.posted)
    expect(msg.ok).toBe(true)
    expect(Math.max(msg.width, msg.height)).toBe(8000)
    expect(msg.width / msg.height).toBeCloseTo(2, 5)
  })

  it('does not scale down when dimensions are already within the cap', async () => {
    await loadWorker()
    await env.selfStub.onmessage({
      data: { svgData: '<svg/>', width: 100, height: 50, scale: 3 },
    })
    const { msg } = await waitForPost(env.posted)
    expect(msg.ok).toBe(true)
    expect(msg.width).toBe(300)
    expect(msg.height).toBe(150)
  })

  it('reports an error when bitmap decoding fails', async () => {
    delete globalThis.self
    delete globalThis.OffscreenCanvas
    delete globalThis.createImageBitmap
    env = installWorkerEnv({ failBitmap: true })

    await loadWorker()
    await env.selfStub.onmessage({
      data: { svgData: '<svg/>', width: 10, height: 10, scale: 1 },
    })
    const { msg } = await waitForPost(env.posted)
    expect(msg.ok).toBe(false)
    expect(msg.error).toMatch(/decode failed/i)
  })
})

describe('exportService PNG architecture (real surface)', () => {
  it('rejects when no SVG element is provided', async () => {
    await expect(exportService.exportPNG(null, 1)).rejects.toThrow('No SVG element provided')
  })

  it('exposes PNG_MAX_EDGE consistent with the worker (8000)', () => {
    expect(exportService.PNG_MAX_EDGE).toBe(8000)
  })
})
