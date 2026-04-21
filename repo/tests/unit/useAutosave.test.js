import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { versionService } from '@/services/versionService'
import { concurrencyService } from '@/services/concurrencyService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { useAutosave, getTabId } from '@/composables/useAutosave'
import { resetDatabase } from './helpers/testHarness'

function makeDiagramStoreFromReal(diagram) {
  return reactive({ currentDiagram: diagram, isDirty: false })
}

function makeAuthStore(overrides = {}) {
  return reactive({ userId: 'user-1', ...overrides })
}

function makeUIStore() {
  const store = reactive({
    lastToast: null,
    showToast: vi.fn((message, type, duration) => {
      store.lastToast = { message, type, duration }
    }),
  })
  return store
}

function setupHost(diagramStore, authStore, uiStore) {
  let api = null
  const Host = defineComponent({
    setup() {
      api = useAutosave(diagramStore, authStore, uiStore)
      return () => h('div', 'host')
    },
  })
  const wrapper = mount(Host)
  return { wrapper, get api() { return api } }
}

async function seedDiagramWithContent() {
  const diagram = await diagramService.create({ title: 'Autosave Test', ownerUserId: 'user-1' })
  await canvasService.addNode(diagram.diagramId, { type: 'start', name: 'S', x: 0, y: 0 }, 'user-1')
  await canvasService.addNode(diagram.diagramId, { type: 'end', name: 'E', x: 200, y: 0 }, 'user-1')
  return diagramService.getById(diagram.diagramId)
}

beforeEach(async () => {
  // Use real timers for setup so fake-indexeddb internals can settle
  await resetDatabase()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useAutosave (integration with real versionService and concurrencyService)', () => {
  it('transitions status from saved to dirty when the diagram becomes dirty', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())

    expect(host.api.autosaveStatus.value).toBe('saved')

    diagramStore.isDirty = true
    await nextTick()

    expect(host.api.autosaveStatus.value).toBe('dirty')
  })

  it('manualSave writes a real snapshot to IndexedDB, bumps currentVersionNumber, clears dirty, and toasts Saved.', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    diagramStore.isDirty = true
    const uiStore = makeUIStore()

    const host = setupHost(diagramStore, makeAuthStore(), uiStore)
    const result = await host.api.manualSave()

    expect(result.snapshot.versionNumber).toBe(diagram.currentVersionNumber + 1)
    expect(diagramStore.currentDiagram.currentVersionNumber).toBe(diagram.currentVersionNumber + 1)
    expect(diagramStore.isDirty).toBe(false)
    expect(host.api.autosaveStatus.value).toBe('saved')
    expect(uiStore.showToast).toHaveBeenCalledWith('Saved.', 'success', 2000)

    const allSnapshots = await versionService.getSnapshots(diagram.diagramId)
    expect(allSnapshots.some((s) => s.snapshotId === result.snapshot.snapshotId)).toBe(true)
  })

  it('autosave interval fires every 10s and writes a real snapshot only when dirty', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())

    // Use fake timers only for the interval advance, after IDB setup completed
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    host.api.startAutosave()

    vi.advanceTimersByTime(10_000)
    let snaps = await versionService.getSnapshots(diagram.diagramId)
    expect(snaps).toHaveLength(0)

    diagramStore.isDirty = true
    await nextTick()
    vi.advanceTimersByTime(10_000)
    await nextTick()
    // Give the async interval callback time to resolve against the real IDB
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 50))

    snaps = await versionService.getSnapshots(diagram.diagramId)
    expect(snaps).toHaveLength(1)
    expect(snaps[0].snapshotReason).toBe('autosave')

    host.api.stopAutosave()
  })

  it('does not autosave while a gesture is active, then saves when the gesture ends', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    diagramStore.isDirty = true

    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())
    host.api.setGestureActive(true)

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    host.api.startAutosave()
    vi.advanceTimersByTime(20_000) // two ticks while gesture active — early return
    host.api.setGestureActive(false)
    vi.advanceTimersByTime(10_000) // next tick should fire and save
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 80))

    const snaps = await versionService.getSnapshots(diagram.diagramId)
    expect(snaps).toHaveLength(1)

    host.api.stopAutosave()
  })

  it('stopAutosave cancels the interval so no further snapshots are created', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    diagramStore.isDirty = true

    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    host.api.startAutosave()
    host.api.stopAutosave()
    vi.advanceTimersByTime(30_000)
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 30))

    const snaps = await versionService.getSnapshots(diagram.diagramId)
    expect(snaps).toHaveLength(0)
  })

  it('unmount cleans up the autosave interval automatically', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    diagramStore.isDirty = true

    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    host.api.startAutosave()
    host.wrapper.unmount()
    vi.advanceTimersByTime(30_000)
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 30))

    const snaps = await versionService.getSnapshots(diagram.diagramId)
    expect(snaps).toHaveLength(0)
  })

  it('pauses autosave when the real versionService throws a quota error', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    diagramStore.isDirty = true
    const uiStore = makeUIStore()

    // Browser primitive (QuotaExceededError) has no deterministic trigger under
    // fake-indexeddb, so we inject it once by temporarily replacing the service method.
    const original = versionService.createSnapshot
    const quotaErr = new Error('quota')
    quotaErr.name = 'QuotaExceededError'
    versionService.createSnapshot = () => Promise.reject(quotaErr)

    try {
      const host = setupHost(diagramStore, makeAuthStore(), uiStore)
      await host.api.manualSave()

      expect(host.api.autosaveStatus.value).toBe('paused_quota_error')
      expect(uiStore.showToast).toHaveBeenCalledWith(
        'Storage quota exceeded. Autosave paused.',
        'error',
        0,
      )

      let callCount = 0
      versionService.createSnapshot = async (...args) => {
        callCount++
        return original.apply(versionService, args)
      }
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      host.api.startAutosave()
      vi.advanceTimersByTime(10_000)
      vi.useRealTimers()
      await new Promise((r) => setTimeout(r, 30))
      expect(callCount).toBe(0)
      host.api.stopAutosave()
    } finally {
      versionService.createSnapshot = original
    }
  })

  it('reports non-quota save failures via showToast and sets save_failed status', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    diagramStore.isDirty = true
    const uiStore = makeUIStore()

    const original = versionService.createSnapshot
    versionService.createSnapshot = () => Promise.reject(new Error('disk down'))

    try {
      const host = setupHost(diagramStore, makeAuthStore(), uiStore)
      await host.api.manualSave()
      expect(host.api.autosaveStatus.value).toBe('save_failed')
      expect(uiStore.showToast).toHaveBeenCalledWith('Save failed: disk down', 'error')
    } finally {
      versionService.createSnapshot = original
    }
  })

  it('manualSave short-circuits when no diagram is open', async () => {
    const diagramStore = reactive({ currentDiagram: null, isDirty: false })
    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())
    const result = await host.api.manualSave()
    expect(result).toBeUndefined()
  })

  it('autosave interval early-returns without saving when currentDiagram is null', async () => {
    const diagramStore = reactive({ currentDiagram: null, isDirty: true })
    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    host.api.startAutosave()
    vi.advanceTimersByTime(30_000)
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 30))

    // No diagram => no snapshots anywhere in IDB
    const { getDB } = await import('@/db/schema')
    const db = await getDB()
    expect(await db.getAll('snapshots')).toHaveLength(0)

    host.api.stopAutosave()
  })

  it('getTabId returns a stable identifier across calls', () => {
    const first = getTabId()
    const second = getTabId()
    expect(first).toBeTruthy()
    expect(first).toBe(second)
  })

  it('invokes the real concurrencyService.notifyDiagramSaved after a successful save', async () => {
    const diagram = await seedDiagramWithContent()
    const diagramStore = makeDiagramStoreFromReal(diagram)
    diagramStore.isDirty = true

    const spy = vi.spyOn(concurrencyService, 'notifyDiagramSaved')
    const host = setupHost(diagramStore, makeAuthStore(), makeUIStore())
    await host.api.manualSave()

    expect(spy).toHaveBeenCalledWith(
      diagram.diagramId,
      expect.any(Number),
      expect.any(String),
      expect.any(String),
    )
    spy.mockRestore()
  })
})
