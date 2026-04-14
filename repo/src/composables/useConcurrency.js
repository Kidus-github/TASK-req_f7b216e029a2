import { ref, onMounted, onUnmounted } from 'vue'
import { concurrencyService } from '@/services/concurrencyService'
import { getTabId } from './useAutosave'

export function useConcurrency(diagramStore, uiStore) {
  const conflictState = ref(null) // null | { type, remoteVersion, remoteHash }
  const concurrentTabWarning = ref(false)
  let ignoreUntil = 0
  let unsubscribe = null

  function init(diagramId) {
    concurrencyService.init()
    concurrencyService.notifyDiagramOpened(diagramId, getTabId())

    unsubscribe = concurrencyService.onMessage((msg) => {
      if (msg.tabId === getTabId()) return

      if (msg.type === 'diagram_opened' && msg.diagramId === diagramId) {
        concurrentTabWarning.value = true
      }

      if (msg.type === 'diagram_closed' && msg.diagramId === diagramId) {
        concurrentTabWarning.value = false
      }

      if (msg.type === 'diagram_saved' && msg.diagramId === diagramId) {
        if (Date.now() < ignoreUntil) return

        const diagram = diagramStore.currentDiagram
        if (!diagram) return

        const conflict = concurrencyService.checkConflict(
          diagram.currentVersionNumber,
          diagram.currentRevisionHash,
          msg.versionNumber,
          msg.revisionHash
        )

        if (conflict) {
          conflictState.value = {
            type: conflict,
            remoteVersion: msg.versionNumber,
            remoteHash: msg.revisionHash,
          }
        }
      }
    })
  }

  function ignoreTemporarily() {
    ignoreUntil = Date.now() + 60000
    conflictState.value = null
  }

  async function refreshToLatest() {
    const diagram = diagramStore.currentDiagram
    if (diagram) {
      await diagramStore.openDiagram(diagram.diagramId)
      conflictState.value = null
      uiStore.showToast('Refreshed to latest version.', 'success')
    }
  }

  function destroy(diagramId) {
    concurrencyService.notifyDiagramClosed(diagramId, getTabId())
    if (unsubscribe) unsubscribe()
    concurrencyService.destroy()
  }

  return {
    conflictState,
    concurrentTabWarning,
    init,
    ignoreTemporarily,
    refreshToLatest,
    destroy,
  }
}
