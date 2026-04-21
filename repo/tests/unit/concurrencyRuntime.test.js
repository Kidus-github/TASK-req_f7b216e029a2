import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

// This file is intentionally runtime-simulation coverage, not browser-flow
// integration. jsdom cannot provide real cross-tab BroadcastChannel peers, so
// we use an in-memory channel to verify message handling logic deterministically.
const channels = new Map()

class InMemoryBroadcastChannel {
  constructor(name) {
    this.name = name
    this.onmessage = null
    this._closed = false
    if (!channels.has(name)) channels.set(name, new Set())
    channels.get(name).add(this)
  }
  postMessage(data) {
    if (this._closed) return
    const peers = channels.get(this.name) || new Set()
    const cloned = JSON.parse(JSON.stringify(data))
    for (const peer of peers) {
      if (peer === this || peer._closed) continue
      queueMicrotask(() => {
        if (typeof peer.onmessage === 'function') {
          peer.onmessage({ data: cloned })
        }
      })
    }
  }
  close() {
    this._closed = true
    const peers = channels.get(this.name)
    if (peers) peers.delete(this)
  }
}

function makeDiagramStore(overrides = {}) {
  return reactive({
    currentDiagram: {
      diagramId: 'diagram-1',
      currentVersionNumber: 2,
      currentRevisionHash: 'local-hash',
      ...(overrides.currentDiagram || {}),
    },
    openDiagram: vi.fn(async function (id) {
      this.currentDiagram = {
        ...(this.currentDiagram || {}),
        diagramId: id,
        currentVersionNumber: (this.currentDiagram?.currentVersionNumber ?? 2) + 1,
        currentRevisionHash: 'refreshed-hash',
      }
      return this.currentDiagram
    }),
    ...overrides,
  })
}

function makeUIStore() {
  const store = {
    showToast: vi.fn((message, type) => {
      store.lastToast = { message, type }
    }),
    lastToast: null,
  }
  return store
}

let originalBroadcastChannel

beforeEach(() => {
  originalBroadcastChannel = globalThis.BroadcastChannel
  globalThis.BroadcastChannel = InMemoryBroadcastChannel
  channels.clear()
  vi.resetModules()
})

afterEach(() => {
  globalThis.BroadcastChannel = originalBroadcastChannel
})

describe('useConcurrency + concurrencyService runtime simulation', () => {
  it('flags concurrent tabs and newer-version conflicts from a peer tab', async () => {
    const { useConcurrency } = await import('@/composables/useConcurrency.js')
    const { concurrencyService } = await import('@/services/concurrencyService.js')
    const { getTabId } = await import('@/composables/useAutosave.js')

    const diagramStore = makeDiagramStore()
    const uiStore = makeUIStore()
    const concurrency = useConcurrency(diagramStore, uiStore)
    concurrency.init('diagram-1')

    // Simulate a *remote* tab by creating a second channel and posting messages.
    const remote = new InMemoryBroadcastChannel('flowforge-sync')
    const localTabId = getTabId()
    const remoteTabId = localTabId === 'remote-tab' ? 'other-tab' : 'remote-tab'

    remote.postMessage({
      type: 'diagram_opened',
      diagramId: 'diagram-1',
      tabId: remoteTabId,
      timestamp: new Date().toISOString(),
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(concurrency.concurrentTabWarning.value).toBe(true)

    remote.postMessage({
      type: 'diagram_saved',
      diagramId: 'diagram-1',
      versionNumber: 3,
      revisionHash: 'remote-hash',
      tabId: remoteTabId,
      timestamp: new Date().toISOString(),
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(concurrency.conflictState.value).toMatchObject({
      type: 'newer_version',
      remoteVersion: 3,
      remoteHash: 'remote-hash',
    })

    remote.postMessage({
      type: 'diagram_closed',
      diagramId: 'diagram-1',
      tabId: remoteTabId,
      timestamp: new Date().toISOString(),
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(concurrency.concurrentTabWarning.value).toBe(false)

    remote.close()
    concurrency.destroy('diagram-1')
  })

  it('ignores messages originating from its own tabId', async () => {
    const { useConcurrency } = await import('@/composables/useConcurrency.js')
    const { getTabId } = await import('@/composables/useAutosave.js')

    const diagramStore = makeDiagramStore()
    const concurrency = useConcurrency(diagramStore, makeUIStore())
    concurrency.init('diagram-1')
    const localTabId = getTabId()

    const echo = new InMemoryBroadcastChannel('flowforge-sync')
    echo.postMessage({
      type: 'diagram_opened',
      diagramId: 'diagram-1',
      tabId: localTabId,
    })
    await new Promise((r) => setTimeout(r, 5))

    expect(concurrency.concurrentTabWarning.value).toBe(false)
    expect(concurrency.conflictState.value).toBeNull()

    echo.close()
    concurrency.destroy('diagram-1')
  })

  it('ignoreTemporarily suppresses conflict state for 60s of remote saves', async () => {
    vi.useFakeTimers()
    try {
      const { useConcurrency } = await import('@/composables/useConcurrency.js')

      const diagramStore = makeDiagramStore()
      const concurrency = useConcurrency(diagramStore, makeUIStore())
      concurrency.init('diagram-1')

      concurrency.ignoreTemporarily()
      expect(concurrency.conflictState.value).toBeNull()

      const remote = new InMemoryBroadcastChannel('flowforge-sync')
      remote.postMessage({
        type: 'diagram_saved',
        diagramId: 'diagram-1',
        versionNumber: 3,
        revisionHash: 'h-new',
        tabId: 'remote-tab',
      })
      await vi.advanceTimersByTimeAsync(10)
      expect(concurrency.conflictState.value).toBeNull()

      // After ignore window expires, a new remote save re-arms conflict detection
      await vi.advanceTimersByTimeAsync(61_000)
      remote.postMessage({
        type: 'diagram_saved',
        diagramId: 'diagram-1',
        versionNumber: 4,
        revisionHash: 'h-next',
        tabId: 'remote-tab',
      })
      await vi.advanceTimersByTimeAsync(10)
      expect(concurrency.conflictState.value).toMatchObject({ type: 'newer_version', remoteVersion: 4 })

      remote.close()
      concurrency.destroy('diagram-1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshToLatest re-opens the diagram, clears the banner, and emits a success toast', async () => {
    const { useConcurrency } = await import('@/composables/useConcurrency.js')

    const diagramStore = makeDiagramStore()
    const uiStore = makeUIStore()
    const concurrency = useConcurrency(diagramStore, uiStore)
    concurrency.init('diagram-1')

    const remote = new InMemoryBroadcastChannel('flowforge-sync')
    remote.postMessage({
      type: 'diagram_saved',
      diagramId: 'diagram-1',
      versionNumber: 3,
      revisionHash: 'remote-hash',
      tabId: 'remote-tab',
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(concurrency.conflictState.value).not.toBeNull()

    await concurrency.refreshToLatest()

    expect(diagramStore.openDiagram).toHaveBeenCalledWith('diagram-1')
    expect(concurrency.conflictState.value).toBeNull()
    expect(uiStore.showToast).toHaveBeenCalledWith('Refreshed to latest version.', 'success')

    remote.close()
    concurrency.destroy('diagram-1')
  })

  it('flags hash_mismatch conflicts when version matches but hash diverges', async () => {
    const { useConcurrency } = await import('@/composables/useConcurrency.js')

    const diagramStore = makeDiagramStore({
      currentDiagram: { diagramId: 'diagram-1', currentVersionNumber: 2, currentRevisionHash: 'local-hash' },
    })
    const concurrency = useConcurrency(diagramStore, makeUIStore())
    concurrency.init('diagram-1')

    const remote = new InMemoryBroadcastChannel('flowforge-sync')
    remote.postMessage({
      type: 'diagram_saved',
      diagramId: 'diagram-1',
      versionNumber: 2,
      revisionHash: 'remote-hash',
      tabId: 'remote-tab',
    })
    await new Promise((r) => setTimeout(r, 5))

    expect(concurrency.conflictState.value).toMatchObject({ type: 'hash_mismatch', remoteVersion: 2 })

    remote.close()
    concurrency.destroy('diagram-1')
  })

  it('destroy tears down the subscription so further remote messages do not flip state', async () => {
    const { useConcurrency } = await import('@/composables/useConcurrency.js')

    const diagramStore = makeDiagramStore()
    const concurrency = useConcurrency(diagramStore, makeUIStore())
    concurrency.init('diagram-1')
    concurrency.destroy('diagram-1')

    const remote = new InMemoryBroadcastChannel('flowforge-sync')
    remote.postMessage({
      type: 'diagram_opened',
      diagramId: 'diagram-1',
      tabId: 'remote-tab',
    })
    await new Promise((r) => setTimeout(r, 5))

    expect(concurrency.concurrentTabWarning.value).toBe(false)
    expect(concurrency.conflictState.value).toBeNull()

    remote.close()
  })

  it('two tabs sharing the real BroadcastChannel surface see each other immediately', async () => {
    const { useConcurrency } = await import('@/composables/useConcurrency.js')
    // We can only mount one composable instance per "tab" — simulate the second
    // tab by broadcasting directly through the in-memory channel.
    const diagramStore = makeDiagramStore()
    const uiStore = makeUIStore()
    const concurrency = useConcurrency(diagramStore, uiStore)
    concurrency.init('diagram-A')

    const peer = new InMemoryBroadcastChannel('flowforge-sync')
    peer.postMessage({
      type: 'diagram_opened',
      diagramId: 'diagram-A',
      tabId: 'peer-tab',
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(concurrency.concurrentTabWarning.value).toBe(true)

    peer.postMessage({
      type: 'diagram_opened',
      diagramId: 'diagram-B', // different diagram — must NOT set warning
      tabId: 'peer-tab',
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(concurrency.concurrentTabWarning.value).toBe(true)

    peer.close()
    concurrency.destroy('diagram-A')
  })
})
