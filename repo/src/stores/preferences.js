import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { normalizePersona } from '@/utils/persona'

const LS_PREFIX = 'ff_'

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(LS_PREFIX + key)
    return v !== null ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
  } catch {
    // quota exceeded — silently ignore for preferences
  }
}

export const usePreferencesStore = defineStore('preferences', () => {
  const theme = ref(lsGet('theme', 'light'))
  const gridEnabled = ref(lsGet('grid_enabled', true))
  const lastZoom = ref(lsGet('last_zoom', 100))
  const recentFiles = ref(lsGet('recent_files', []))
  const activePersona = ref(normalizePersona(lsGet('active_persona', 'author')))

  watch(theme, (v) => lsSet('theme', v))
  watch(gridEnabled, (v) => lsSet('grid_enabled', v))
  watch(lastZoom, (v) => lsSet('last_zoom', v))
  watch(recentFiles, (v) => lsSet('recent_files', v), { deep: true })
  watch(activePersona, (v) => lsSet('active_persona', v))

  function addRecentFile(diagramId, title) {
    const existing = recentFiles.value.filter((f) => f.diagramId !== diagramId)
    existing.unshift({ diagramId, title, openedAt: new Date().toISOString() })
    recentFiles.value = existing.slice(0, 20)
  }

  function removeRecentFile(diagramId) {
    recentFiles.value = recentFiles.value.filter((f) => f.diagramId !== diagramId)
  }

  function setTheme(t) {
    theme.value = t === 'dark' ? 'dark' : 'light'
  }

  function setPersona(p) {
    activePersona.value = normalizePersona(p)
  }

  return {
    theme,
    gridEnabled,
    lastZoom,
    recentFiles,
    activePersona,
    addRecentFile,
    removeRecentFile,
    setTheme,
    setPersona,
  }
})
