import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHistoryStore } from '@/stores/history'

beforeEach(() => {
  setActivePinia(createPinia())
})

function makeEntry(label, state) {
  return {
    label,
    undo: vi.fn(async () => { state.log.push(`undo:${label}`) }),
    redo: vi.fn(async () => { state.log.push(`redo:${label}`) }),
  }
}

describe('history store', () => {
  it('starts empty with canUndo and canRedo false', () => {
    const store = useHistoryStore()
    expect(store.entries).toEqual([])
    expect(store.currentIndex).toBe(-1)
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })

  it('pushEntry appends and makes the new entry current', () => {
    const store = useHistoryStore()
    const state = { log: [] }
    store.pushEntry(makeEntry('A', state))
    expect(store.entries).toHaveLength(1)
    expect(store.currentIndex).toBe(0)
    expect(store.canUndo).toBe(true)
    expect(store.canRedo).toBe(false)
    expect(store.visibleEntries[0].state).toBe('current')
  })

  it('undoAction reverts the current entry and decrements the index', async () => {
    const store = useHistoryStore()
    const state = { log: [] }
    const a = makeEntry('A', state)
    store.pushEntry(a)
    await store.undoAction()
    expect(a.undo).toHaveBeenCalled()
    expect(store.currentIndex).toBe(-1)
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(true)
  })

  it('undoAction is a no-op when no undo is available', async () => {
    const store = useHistoryStore()
    await expect(store.undoAction()).resolves.toBeUndefined()
    expect(store.currentIndex).toBe(-1)
  })

  it('redoAction re-applies the next entry and increments the index', async () => {
    const store = useHistoryStore()
    const state = { log: [] }
    const a = makeEntry('A', state)
    store.pushEntry(a)
    await store.undoAction()
    await store.redoAction()
    expect(a.redo).toHaveBeenCalled()
    expect(store.currentIndex).toBe(0)
    expect(store.canRedo).toBe(false)
  })

  it('redoAction is a no-op when no redo is available', async () => {
    const store = useHistoryStore()
    const state = { log: [] }
    store.pushEntry(makeEntry('A', state))
    await expect(store.redoAction()).resolves.toBeUndefined()
  })

  it('pushEntry after partial undo discards the redo branch', async () => {
    const store = useHistoryStore()
    const state = { log: [] }
    store.pushEntry(makeEntry('A', state))
    store.pushEntry(makeEntry('B', state))
    store.pushEntry(makeEntry('C', state))
    await store.undoAction() // undo C
    await store.undoAction() // undo B
    expect(store.currentIndex).toBe(0) // only A is current
    store.pushEntry(makeEntry('D', state))
    expect(store.entries.map((e) => e.label)).toEqual(['A', 'D'])
    expect(store.canRedo).toBe(false)
  })

  it('prunes entries past the MAX_HISTORY cap', () => {
    const store = useHistoryStore()
    const state = { log: [] }
    for (let i = 0; i < store.MAX_HISTORY + 5; i++) {
      store.pushEntry(makeEntry(`L${i}`, state))
    }
    expect(store.entries).toHaveLength(store.MAX_HISTORY)
    expect(store.entries[0].label).toBe('L5')
    expect(store.currentIndex).toBe(store.MAX_HISTORY - 1)
  })

  it('clear wipes entries and resets the pointer', () => {
    const store = useHistoryStore()
    store.pushEntry(makeEntry('A', { log: [] }))
    store.clear()
    expect(store.entries).toEqual([])
    expect(store.currentIndex).toBe(-1)
    expect(store.canUndo).toBe(false)
  })

  it('visibleEntries reflects undone / current / discarded segments after partial undo', async () => {
    const store = useHistoryStore()
    const state = { log: [] }
    store.pushEntry(makeEntry('A', state))
    store.pushEntry(makeEntry('B', state))
    store.pushEntry(makeEntry('C', state))
    await store.undoAction() // undo C, index=1
    expect(store.visibleEntries.map((e) => e.state)).toEqual(['undone', 'current', 'discarded'])
  })
})
