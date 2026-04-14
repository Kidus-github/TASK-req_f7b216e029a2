<script setup>
import { ref, computed, watch } from 'vue'
import { traceabilityService } from '@/services/traceabilityService'

const props = defineProps({
  diagramId: { type: String, required: true },
  nodes: { type: Array, default: () => [] },
})

const emit = defineEmits(['highlight', 'close'])

const codeInput = ref('')
const assignments = ref([])
const loading = ref(true)
const matchedNodeIds = ref([])
const matchState = ref('idle') // idle | found | not_found | invalid

// Load traceability assignments on mount
watch(() => props.diagramId, async () => {
  loading.value = true
  assignments.value = await traceabilityService.getAssignments(props.diagramId)
  loading.value = false
}, { immediate: true })

const filteredAssignments = computed(() => {
  return assignments.value
})

function verifyCode() {
  const code = codeInput.value.trim()
  if (!code) {
    matchedNodeIds.value = []
    matchState.value = 'idle'
    emit('highlight', [])
    return
  }

  if (!traceabilityService.validateCode(code)) {
    matchedNodeIds.value = []
    matchState.value = 'invalid'
    emit('highlight', [])
    return
  }

  const matches = assignments.value.filter((a) => a.traceabilityCode === code)
  if (matches.length > 0) {
    matchedNodeIds.value = matches.map((m) => m.nodeId)
    matchState.value = 'found'
    emit('highlight', matchedNodeIds.value)
  } else {
    matchedNodeIds.value = []
    matchState.value = 'not_found'
    emit('highlight', [])
  }
}

function highlightNode(nodeId) {
  emit('highlight', [nodeId])
}

function highlightAll() {
  const allIds = assignments.value.map((a) => a.nodeId)
  emit('highlight', allIds)
}

function clearHighlight() {
  matchedNodeIds.value = []
  matchState.value = 'idle'
  codeInput.value = ''
  emit('highlight', [])
}
</script>

<template>
  <div class="modal-overlay" @click.self="clearHighlight(); emit('close')">
    <div class="modal" style="max-width: 600px; max-height: 85vh">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
        <h2 style="margin: 0">Verification View</h2>
        <button class="btn btn-sm btn-secondary" @click="highlightAll">Highlight All Traced</button>
      </div>

      <!-- Code lookup -->
      <div style="display: flex; gap: 8px; margin-bottom: 16px">
        <input
          v-model="codeInput"
          type="text"
          placeholder="Enter traceability code (e.g. SOP-001-A1)"
          style="flex: 1; padding: 8px 12px; border: 1px solid var(--ff-border); border-radius: var(--ff-radius); font-size: 14px; font-family: var(--ff-font-mono); background: var(--ff-bg); color: var(--ff-text)"
          @keydown.enter="verifyCode"
        />
        <button class="btn btn-primary" @click="verifyCode">Verify</button>
        <button class="btn btn-secondary" @click="clearHighlight">Clear</button>
      </div>

      <!-- Match result feedback -->
      <div v-if="matchState === 'found'" style="padding: 8px 12px; background: var(--ff-success-light); color: var(--ff-success); border-radius: var(--ff-radius); margin-bottom: 12px; font-size: 13px">
        Code matched {{ matchedNodeIds.length }} node(s). Highlighted on canvas.
      </div>
      <div v-else-if="matchState === 'not_found'" style="padding: 8px 12px; background: var(--ff-warning-light); color: var(--ff-warning); border-radius: var(--ff-radius); margin-bottom: 12px; font-size: 13px">
        No matching node found for this code in the current diagram.
      </div>
      <div v-else-if="matchState === 'invalid'" style="padding: 8px 12px; background: var(--ff-danger-light); color: var(--ff-danger); border-radius: var(--ff-radius); margin-bottom: 12px; font-size: 13px">
        Invalid code format. Expected: SOP-XXX-TN (e.g. SOP-001-A1)
      </div>

      <!-- Loading -->
      <div v-if="loading" class="empty-state" style="padding: 16px">Loading traceability data...</div>

      <!-- Assignment table -->
      <div v-else-if="assignments.length === 0" class="empty-state" style="padding: 24px">
        <h3>No traceability codes</h3>
        <p>Generate traceability codes first using the Trace button in the editor toolbar.</p>
      </div>

      <div v-else style="max-height: 350px; overflow-y: auto">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Node</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in filteredAssignments" :key="a.assignmentId"
              :style="{ background: matchedNodeIds.includes(a.nodeId) ? 'var(--ff-primary-light)' : '' }">
              <td style="font-family: var(--ff-font-mono); font-size: 13px; font-weight: 600">
                {{ a.traceabilityCode }}
              </td>
              <td>
                {{ (nodes.find(n => n.nodeId === a.nodeId))?.name || 'Deleted node' }}
              </td>
              <td class="text-muted text-sm">
                {{ (nodes.find(n => n.nodeId === a.nodeId))?.type || '-' }}
              </td>
              <td>
                <button class="btn btn-sm btn-secondary" @click="highlightNode(a.nodeId)">
                  Highlight
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-actions">
        <span class="text-muted text-sm">{{ assignments.length }} traced node(s)</span>
        <button class="btn btn-secondary" @click="clearHighlight(); emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>
