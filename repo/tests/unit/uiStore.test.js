import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUIStore } from '@/stores/ui'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ui store', () => {
  it('starts with empty toasts and no active modal', () => {
    const store = useUIStore()
    expect(store.toasts).toEqual([])
    expect(store.activeModal).toBeNull()
    expect(store.modalProps).toEqual({})
  })

  it('showToast enqueues a toast with defaults and auto-dismisses after duration', () => {
    const store = useUIStore()
    const id = store.showToast('Hello world')
    expect(store.toasts).toHaveLength(1)
    expect(store.toasts[0]).toMatchObject({ id, message: 'Hello world', type: 'info', duration: 4000 })

    vi.advanceTimersByTime(3999)
    expect(store.toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store.toasts).toHaveLength(0)
  })

  it('showToast honors a custom type, duration, and generates unique IDs', () => {
    const store = useUIStore()
    const id1 = store.showToast('Saved.', 'success', 1000)
    const id2 = store.showToast('Oh no', 'error', 1000)
    expect(id1).not.toBe(id2)
    expect(store.toasts).toHaveLength(2)
    expect(store.toasts[0].type).toBe('success')
    expect(store.toasts[1].type).toBe('error')
  })

  it('showToast with duration 0 creates a persistent toast (no auto-dismiss)', () => {
    const store = useUIStore()
    store.showToast('Persistent', 'warning', 0)
    vi.advanceTimersByTime(60_000)
    expect(store.toasts).toHaveLength(1)
  })

  it('dismissToast removes only the matching id', () => {
    const store = useUIStore()
    const id1 = store.showToast('A', 'info', 0)
    const id2 = store.showToast('B', 'info', 0)
    store.dismissToast(id1)
    expect(store.toasts.map((t) => t.id)).toEqual([id2])
  })

  it('dismissToast with an unknown id is a no-op', () => {
    const store = useUIStore()
    store.showToast('A', 'info', 0)
    store.dismissToast(9999)
    expect(store.toasts).toHaveLength(1)
  })

  it('openModal sets activeModal and modalProps', () => {
    const store = useUIStore()
    store.openModal('publish', { diagramId: 'd-1' })
    expect(store.activeModal).toBe('publish')
    expect(store.modalProps).toEqual({ diagramId: 'd-1' })
  })

  it('openModal without props still records the modal name with empty props', () => {
    const store = useUIStore()
    store.openModal('import')
    expect(store.activeModal).toBe('import')
    expect(store.modalProps).toEqual({})
  })

  it('closeModal clears activeModal and modalProps', () => {
    const store = useUIStore()
    store.openModal('retract', { reason: 'x' })
    store.closeModal()
    expect(store.activeModal).toBeNull()
    expect(store.modalProps).toEqual({})
  })

  it('supports an arbitrary queue of simultaneous toasts, preserving insertion order', () => {
    const store = useUIStore()
    for (let i = 0; i < 5; i++) store.showToast(`T${i}`, 'info', 0)
    expect(store.toasts.map((t) => t.message)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4'])
  })
})
