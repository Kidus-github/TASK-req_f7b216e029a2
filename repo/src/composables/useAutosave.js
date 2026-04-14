import { ref, watch, onUnmounted } from 'vue'
import { versionService } from '@/services/versionService'
import { concurrencyService } from '@/services/concurrencyService'

const AUTOSAVE_INTERVAL_MS = 10000

export function useAutosave(diagramStore, authStore, uiStore) {
  const autosaveStatus = ref('saved') // saved | dirty | saving | save_failed | paused_quota_error
  let autosaveTimer = null
  let isGestureActive = false

  function setGestureActive(active) {
    isGestureActive = active
  }

  watch(() => diagramStore.isDirty, (dirty) => {
    if (dirty && autosaveStatus.value === 'saved') {
      autosaveStatus.value = 'dirty'
    }
  })

  function startAutosave() {
    stopAutosave()
    autosaveTimer = setInterval(async () => {
      if (!diagramStore.currentDiagram) return
      if (!diagramStore.isDirty) return
      if (isGestureActive) return
      if (autosaveStatus.value === 'paused_quota_error') return

      await performSave('autosave')
    }, AUTOSAVE_INTERVAL_MS)
  }

  function stopAutosave() {
    if (autosaveTimer) {
      clearInterval(autosaveTimer)
      autosaveTimer = null
    }
  }

  async function performSave(reason = 'manual') {
    if (!diagramStore.currentDiagram) return
    const diagramId = diagramStore.currentDiagram.diagramId

    autosaveStatus.value = 'saving'
    try {
      const { snapshot, diagram } = await versionService.createSnapshot(
        diagramId,
        reason,
        authStore.userId
      )
      diagramStore.currentDiagram = diagram
      diagramStore.isDirty = false
      autosaveStatus.value = 'saved'

      // Notify other tabs
      concurrencyService.notifyDiagramSaved(
        diagramId,
        diagram.currentVersionNumber,
        diagram.currentRevisionHash,
        getTabId()
      )

      if (reason === 'manual') {
        uiStore.showToast('Saved.', 'success', 2000)
      }

      return { snapshot, diagram }
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.message?.includes('quota')) {
        autosaveStatus.value = 'paused_quota_error'
        uiStore.showToast('Storage quota exceeded. Autosave paused.', 'error', 0)
      } else {
        autosaveStatus.value = 'save_failed'
        uiStore.showToast(`Save failed: ${e.message}`, 'error')
      }
    }
  }

  async function manualSave() {
    return performSave('manual')
  }

  onUnmounted(() => {
    stopAutosave()
  })

  return {
    autosaveStatus,
    startAutosave,
    stopAutosave,
    manualSave,
    performSave,
    setGestureActive,
  }
}

let _tabId = null
function getTabId() {
  if (!_tabId) {
    _tabId = Math.random().toString(36).slice(2, 10)
  }
  return _tabId
}

export { getTabId }
