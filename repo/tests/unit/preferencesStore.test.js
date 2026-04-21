import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function loadStore() {
  // fresh import each test so LS-hydrated defaults are honored
  const mod = await import('@/stores/preferences?t=' + Math.random())
  return mod.usePreferencesStore
}

describe('preferences store', () => {
  it('has sane defaults when no localStorage is present', async () => {
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()
    expect(store.theme).toBe('light')
    expect(store.gridEnabled).toBe(true)
    expect(store.lastZoom).toBe(100)
    expect(store.recentFiles).toEqual([])
    expect(store.activePersona).toBe('author')
  })

  it('hydrates from localStorage on first access', async () => {
    localStorage.setItem('ff_theme', JSON.stringify('dark'))
    localStorage.setItem('ff_grid_enabled', JSON.stringify(false))
    localStorage.setItem('ff_last_zoom', JSON.stringify(75))
    localStorage.setItem('ff_active_persona', JSON.stringify('reviewer'))

    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()

    expect(store.theme).toBe('dark')
    expect(store.gridEnabled).toBe(false)
    expect(store.lastZoom).toBe(75)
    expect(store.activePersona).toBe('reviewer')
  })

  it('setTheme persists the normalized theme', async () => {
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()

    store.setTheme('dark')
    await nextTick()
    expect(store.theme).toBe('dark')
    expect(JSON.parse(localStorage.getItem('ff_theme'))).toBe('dark')

    store.setTheme('something-weird')
    await nextTick()
    expect(store.theme).toBe('light')
  })

  it('setPersona normalizes unknown personas to author and valid personas pass through', async () => {
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()

    store.setPersona('viewer')
    await nextTick()
    expect(store.activePersona).toBe('viewer')
    expect(JSON.parse(localStorage.getItem('ff_active_persona'))).toBe('viewer')

    store.setPersona('gremlin')
    await nextTick()
    expect(store.activePersona).toBe('author')
  })

  it('addRecentFile prepends a new entry, dedupes by diagramId, and caps at 20', async () => {
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()

    store.addRecentFile('a', 'Alpha')
    store.addRecentFile('b', 'Beta')
    store.addRecentFile('a', 'Alpha Updated')
    await nextTick()

    expect(store.recentFiles).toHaveLength(2)
    expect(store.recentFiles[0].diagramId).toBe('a')
    expect(store.recentFiles[0].title).toBe('Alpha Updated')

    for (let i = 0; i < 25; i++) {
      store.addRecentFile(`id-${i}`, `T-${i}`)
    }
    await nextTick()
    expect(store.recentFiles.length).toBe(20)
  })

  it('removeRecentFile drops the matching entry and persists the change', async () => {
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()
    store.addRecentFile('x', 'X')
    store.addRecentFile('y', 'Y')
    await nextTick()

    store.removeRecentFile('x')
    await nextTick()

    expect(store.recentFiles.map((f) => f.diagramId)).toEqual(['y'])
    const persisted = JSON.parse(localStorage.getItem('ff_recent_files'))
    expect(persisted.map((f) => f.diagramId)).toEqual(['y'])
  })

  it('gridEnabled toggle is persisted', async () => {
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()
    store.gridEnabled = false
    await nextTick()
    expect(JSON.parse(localStorage.getItem('ff_grid_enabled'))).toBe(false)
  })

  it('falls back to defaults when localStorage contains malformed JSON', async () => {
    localStorage.setItem('ff_theme', '{not json')
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()
    expect(store.theme).toBe('light')
  })

  it('hydrates recent files from localStorage and preserves light theme normalization', async () => {
    localStorage.setItem('ff_recent_files', JSON.stringify([{ diagramId: 'd-1', title: 'Stored' }]))
    localStorage.setItem('ff_theme', JSON.stringify('light'))

    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()

    expect(store.recentFiles).toEqual([{ diagramId: 'd-1', title: 'Stored' }])
    store.setTheme('light')
    await nextTick()
    expect(JSON.parse(localStorage.getItem('ff_theme'))).toBe('light')
  })

  it('swallows localStorage write failures when persisting preferences', async () => {
    const usePreferencesStore = await loadStore()
    const store = usePreferencesStore()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => {
      store.setTheme('dark')
    }).not.toThrow()
    await nextTick()

    expect(setItemSpy).toHaveBeenCalled()
  })
})
