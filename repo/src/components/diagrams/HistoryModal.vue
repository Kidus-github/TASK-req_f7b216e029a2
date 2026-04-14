<script setup>
import { useHistoryStore } from '@/stores/history'

const history = useHistoryStore()
const emit = defineEmits(['close'])

function getStateLabel(state) {
  if (state === 'current') return 'Current'
  if (state === 'undone') return 'Active'
  return 'Discarded'
}

function getStateClass(state) {
  if (state === 'current') return 'state-current'
  if (state === 'undone') return 'state-active'
  return 'state-discarded'
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal" style="max-width: 560px">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
        <h2 style="margin: 0">Edit History</h2>
        <div style="display: flex; gap: 6px">
          <button class="btn btn-sm btn-secondary" :disabled="!history.canUndo" @click="history.undoAction()">
            Undo
          </button>
          <button class="btn btn-sm btn-secondary" :disabled="!history.canRedo" @click="history.redoAction()">
            Redo
          </button>
        </div>
      </div>

      <div v-if="history.entries.length === 0" class="empty-state" style="padding: 24px">
        <p>No actions in history yet.</p>
      </div>

      <div v-else style="max-height: 400px; overflow-y: auto">
        <div
          v-for="entry in [...history.visibleEntries].reverse()"
          :key="entry.index"
          style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--ff-border)"
          :style="{ opacity: entry.state === 'discarded' ? 0.4 : 1 }"
        >
          <span
            :class="['badge', getStateClass(entry.state)]"
            style="font-size: 9px; min-width: 58px; text-align: center"
          >
            {{ getStateLabel(entry.state) }}
          </span>
          <span style="flex: 1; font-size: 13px">{{ entry.label }}</span>
          <span style="font-size: 11px; color: var(--ff-text-muted)">
            {{ new Date(entry.timestamp).toLocaleTimeString() }}
          </span>
        </div>
      </div>

      <div class="modal-actions">
        <span class="text-muted text-sm">
          {{ history.entries.length }} / {{ history.MAX_HISTORY }} entries
        </span>
        <button class="btn btn-secondary" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.state-current {
  background: var(--ff-primary-light);
  color: var(--ff-primary);
}

.state-active {
  background: var(--ff-success-light);
  color: var(--ff-success);
}

.state-discarded {
  background: var(--ff-bg-tertiary);
  color: var(--ff-text-muted);
}
</style>
