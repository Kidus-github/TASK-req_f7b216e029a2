<script setup>
import { ref } from 'vue'
import { importService } from '@/services/importService'
import { useUIStore } from '@/stores/ui'

const props = defineProps({
  diagramId: { type: String, required: true },
  userId: { type: String, required: true },
})

const emit = defineEmits(['imported', 'close'])

const ui = useUIStore()
const file = ref(null)
const loading = ref(false)
const result = ref(null)
const showErrorsModal = ref(false)
const detailedErrors = ref([])

function onFileChange(e) {
  file.value = e.target.files[0] || null
  result.value = null
  detailedErrors.value = []
  showErrorsModal.value = false
}

async function runImport() {
  if (!file.value) return
  loading.value = true
  result.value = null
  detailedErrors.value = []
  showErrorsModal.value = false

  try {
    const res = await importService.importJSON(file.value, props.diagramId, props.userId)
    result.value = res.job
    const allIssues = (res.errors || []).concat(res.warnings || [])
    detailedErrors.value = allIssues

    if (res.job.status === 'failed') {
      const firstIssue = importService.summarizeIssueForToast(allIssues[0])
      ui.showToast(`${firstIssue} See Import Errors for full details.`, 'error', 6000)
      showErrorsModal.value = true
    } else if (res.job.status === 'partial_success') {
      const firstIssue = importService.summarizeIssueForToast(allIssues[0])
      ui.showToast(`Import completed with warnings. ${firstIssue}`, 'warning', 5000)
      emit('imported')
    } else {
      ui.showToast('Import completed successfully.', 'success')
      emit('imported')
    }
  } catch (e) {
    ui.showToast(`Import error: ${e.message}`, 'error')
    detailedErrors.value = [{ message: e.message, severity: 'error' }]
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal" style="max-width: 560px">
      <h2>Import JSON</h2>
      <p class="text-muted text-sm mb-16">Select a .json file (max 10 MB, 1000 records).</p>

      <div class="form-group">
        <input type="file" accept=".json" @change="onFileChange" />
      </div>

      <div v-if="result" style="margin: 12px 0">
        <div :style="{ color: result.status === 'failed' ? 'var(--ff-danger)' : 'var(--ff-success)', fontWeight: 600 }">
          Status: {{ result.status }}
        </div>
        <div v-if="result.summaryCounts" class="text-sm mt-8">
          Nodes: {{ result.summaryCounts.nodes || 0 }},
          Edges: {{ result.summaryCounts.edges || 0 }},
          Duplicates removed: {{ result.summaryCounts.duplicatesRemoved || 0 }}
        </div>
      </div>

      <!-- Show button to open errors modal -->
      <div v-if="detailedErrors.length > 0 && !showErrorsModal" style="margin: 12px 0">
        <button class="btn btn-sm btn-secondary" @click="showErrorsModal = true">
          View {{ detailedErrors.length }} Error(s) / Warning(s)
        </button>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="emit('close')">Close</button>
        <button class="btn btn-primary" :disabled="!file || loading" @click="runImport">
          {{ loading ? 'Importing...' : 'Import' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Import Errors Modal (separate overlay) -->
  <div v-if="showErrorsModal" class="modal-overlay" style="z-index: 1100" @click.self="showErrorsModal = false">
    <div class="modal" style="max-width: 640px">
      <h2>Import Errors</h2>
      <p class="text-muted text-sm" style="margin-bottom: 12px">
        {{ detailedErrors.length }} issue(s) found during import validation.
      </p>

      <div style="max-height: 400px; overflow-y: auto">
        <div
          v-for="(err, i) in detailedErrors"
          :key="i"
          :style="{
            padding: '8px 12px',
            marginBottom: '6px',
            borderRadius: '6px',
            fontSize: '13px',
            border: '1px solid',
            borderColor: err.severity === 'error' ? 'var(--ff-danger)' : 'var(--ff-warning)',
            background: err.severity === 'error' ? 'var(--ff-danger-light)' : 'var(--ff-warning-light)',
            color: err.severity === 'error' ? 'var(--ff-danger)' : 'var(--ff-warning)',
          }"
        >
          <div style="font-weight: 600; margin-bottom: 2px">
            {{ err.code || (err.severity === 'error' ? 'ERROR' : 'WARNING') }}
          </div>
          <div>{{ err.message }}</div>
          <div v-if="err.context" class="text-sm" style="margin-top: 2px; opacity: 0.8">
            Path: {{ err.context.jsonPath }} | Field: {{ err.context.field }}
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="showErrorsModal = false">Close</button>
      </div>
    </div>
  </div>
</template>
