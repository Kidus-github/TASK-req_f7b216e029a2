import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MAX_HISTORY = 200

export const useHistoryStore = defineStore('history', () => {
  const entries = ref([])
  const currentIndex = ref(-1)

  const canUndo = computed(() => currentIndex.value >= 0)
  const canRedo = computed(() => currentIndex.value < entries.value.length - 1)
  const visibleEntries = computed(() =>
    entries.value.map((e, i) => ({
      ...e,
      state: i < currentIndex.value ? 'undone' :
             i === currentIndex.value ? 'current' :
             'discarded',
      index: i,
    }))
  )

  function pushEntry({ label, undo, redo }) {
    // Discard any redo branch
    if (currentIndex.value < entries.value.length - 1) {
      entries.value = entries.value.slice(0, currentIndex.value + 1)
    }

    entries.value.push({
      label,
      undo,
      redo,
      timestamp: new Date().toISOString(),
    })

    // Prune oldest if over cap
    if (entries.value.length > MAX_HISTORY) {
      entries.value = entries.value.slice(entries.value.length - MAX_HISTORY)
    }

    currentIndex.value = entries.value.length - 1
  }

  async function undoAction() {
    if (!canUndo.value) return
    const entry = entries.value[currentIndex.value]
    await entry.undo()
    currentIndex.value--
  }

  async function redoAction() {
    if (!canRedo.value) return
    currentIndex.value++
    const entry = entries.value[currentIndex.value]
    await entry.redo()
  }

  function clear() {
    entries.value = []
    currentIndex.value = -1
  }

  return {
    entries,
    currentIndex,
    canUndo,
    canRedo,
    visibleEntries,
    pushEntry,
    undoAction,
    redoAction,
    clear,
    MAX_HISTORY,
  }
})
