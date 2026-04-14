<script setup>
import { ref, onMounted } from 'vue'
import { versionService } from '@/services/versionService'

const props = defineProps({
  diagramId: { type: String, required: true },
})

const emit = defineEmits(['rollback', 'close'])

const snapshots = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    snapshots.value = await versionService.getSnapshots(props.diagramId)
  } finally {
    loading.value = false
  }
})

function reasonLabel(reason) {
  const labels = {
    autosave: 'Auto',
    manual: 'Manual',
    rollback: 'Rollback',
    import: 'Import',
    publish: 'Publish',
    unpublish: 'Unpublish',
  }
  return labels[reason] || reason
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal" style="max-width: 600px">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
        <h2 style="margin: 0">Version History</h2>
        <span class="text-muted text-sm">Max {{ versionService.MAX_SNAPSHOTS }} retained</span>
      </div>

      <div v-if="loading" class="empty-state" style="padding: 24px">Loading...</div>
      <div v-else-if="snapshots.length === 0" class="empty-state" style="padding: 24px">
        No snapshots yet. Save the diagram to create the first version.
      </div>

      <div v-else style="max-height: 400px; overflow-y: auto">
        <div
          v-for="snap in snapshots"
          :key="snap.snapshotId"
          style="display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--ff-border)"
        >
          <div style="flex: 1">
            <div style="font-size: 13px; font-weight: 500">
              Version {{ snap.versionNumber }}
            </div>
            <div class="text-muted text-sm">
              {{ reasonLabel(snap.snapshotReason) }} &mdash; {{ new Date(snap.createdAt).toLocaleString() }}
            </div>
          </div>
          <button class="btn btn-sm btn-secondary" @click="emit('rollback', snap.snapshotId)">
            Restore
          </button>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>
