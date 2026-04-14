<script setup>
import { computed, ref, onMounted } from 'vue'
import { inspectionService } from '@/services/inspectionService'

const props = defineProps({
  diagramId: { type: String, required: true },
  diagramVersion: { type: Number, default: 1 },
  userId: { type: String, required: true },
  userName: { type: String, default: '' },
  nodes: { type: Array, default: () => [] },
})

const emit = defineEmits(['close'])

const inspections = ref([])
const activeInspection = ref(null)
const results = ref([])
const loading = ref(true)
const nodeMap = computed(() => new Map(props.nodes.map((node) => [node.nodeId, node])))

// New result form
const resultForm = ref({ nodeId: '', result: 'pass', notes: '', reviewerName: '' })
const formError = ref('')

onMounted(async () => {
  resultForm.value.reviewerName = props.userName
  await loadInspections()
  loading.value = false
})

async function loadInspections() {
  inspections.value = await inspectionService.getInspections(props.diagramId)
}

async function createInspection() {
  const insp = await inspectionService.createInspection(
    props.diagramId,
    props.diagramVersion,
    props.userId,
    `Inspection v${props.diagramVersion}`
  )
  inspections.value.unshift(insp)
  activeInspection.value = insp
  results.value = []
}

async function selectInspection(insp) {
  activeInspection.value = insp
  results.value = await inspectionService.getResults(insp.inspectionId)
}

async function addResult() {
  formError.value = ''
  try {
    const r = await inspectionService.addResult(activeInspection.value.inspectionId, {
      nodeId: resultForm.value.nodeId || null,
      traceabilityCode: resultForm.value.nodeId ? null : 'manual',
      result: resultForm.value.result,
      notes: resultForm.value.notes,
      reviewerName: resultForm.value.reviewerName,
      reviewerUserId: props.userId,
    })
    results.value.push(r)
    resultForm.value.nodeId = ''
    resultForm.value.notes = ''
    resultForm.value.result = 'pass'
  } catch (e) {
    formError.value = e.message
  }
}

async function completeInspection() {
  if (!activeInspection.value) return
  await inspectionService.completeInspection(activeInspection.value.inspectionId)
  activeInspection.value.status = 'completed'
}

const passCount = () => results.value.filter((r) => r.result === 'pass').length
const failCount = () => results.value.filter((r) => r.result === 'fail').length

function formatResultNode(result) {
  const node = result.nodeId ? nodeMap.value.get(result.nodeId) : null
  if (node) {
    const traceabilityLabel = node.traceabilityCode ? ` (${node.traceabilityCode})` : ''
    return `${node.name || 'Untitled node'}${traceabilityLabel}`
  }
  if (result.traceabilityCode) return result.traceabilityCode
  if (result.nodeId) return 'Deleted node'
  return 'Manual'
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal" style="max-width: 700px; max-height: 85vh">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
        <h2 style="margin: 0">Inspections</h2>
        <button class="btn btn-sm btn-primary" @click="createInspection">New Inspection</button>
      </div>

      <div v-if="loading">Loading...</div>

      <!-- Inspection list -->
      <div v-if="!activeInspection" style="max-height: 400px; overflow-y: auto">
        <div v-if="inspections.length === 0" class="empty-state" style="padding: 24px">
          No inspections yet.
        </div>
        <div
          v-for="insp in inspections"
          :key="insp.inspectionId"
          style="padding: 8px; border-bottom: 1px solid var(--ff-border); cursor: pointer; display: flex; justify-content: space-between"
          @click="selectInspection(insp)"
        >
          <div>
            <div style="font-weight: 500; font-size: 13px">{{ insp.summary || 'Untitled' }}</div>
            <div class="text-muted text-sm">v{{ insp.diagramVersionNumber }} &mdash; {{ new Date(insp.createdAt).toLocaleString() }}</div>
          </div>
          <span :class="['badge', insp.status === 'completed' ? 'badge-published' : insp.status === 'open' ? 'badge-draft' : 'badge-archived']">
            {{ insp.status }}
          </span>
        </div>
      </div>

      <!-- Active inspection detail -->
      <div v-if="activeInspection">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
          <div>
            <button class="btn btn-sm btn-secondary" @click="activeInspection = null">Back</button>
            <span style="margin-left: 8px; font-weight: 500">{{ activeInspection.summary }}</span>
            <span :class="['badge', 'ml-8', activeInspection.status === 'completed' ? 'badge-published' : 'badge-draft']" style="margin-left: 8px">
              {{ activeInspection.status }}
            </span>
          </div>
          <div style="display: flex; gap: 4px">
            <span class="text-sm" style="color: var(--ff-success)">Pass: {{ passCount() }}</span>
            <span class="text-sm" style="color: var(--ff-danger)">Fail: {{ failCount() }}</span>
          </div>
        </div>

        <!-- Results table -->
        <div style="max-height: 250px; overflow-y: auto; margin-bottom: 12px">
          <table v-if="results.length > 0">
            <thead>
              <tr>
                <th>Node</th>
                <th>Result</th>
                <th>Reviewer</th>
                <th>Notes</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in results" :key="r.resultId">
                <td class="text-sm">{{ formatResultNode(r) }}</td>
                <td>
                  <span :style="{ color: r.result === 'pass' ? 'var(--ff-success)' : 'var(--ff-danger)', fontWeight: 600 }">
                    {{ r.result.toUpperCase() }}
                  </span>
                </td>
                <td class="text-sm">{{ r.reviewerName }}</td>
                <td class="text-sm">{{ r.notes || '-' }}</td>
                <td class="text-sm text-muted">{{ new Date(r.timestamp).toLocaleTimeString() }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-muted text-sm" style="padding: 12px; text-align: center">No results yet.</div>
        </div>

        <!-- Add result form (only for open inspections) -->
        <div v-if="activeInspection.status === 'open'" style="border-top: 1px solid var(--ff-border); padding-top: 12px">
          <div style="font-weight: 500; font-size: 13px; margin-bottom: 8px">Add Result</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">
            <div class="form-group" style="margin: 0">
              <label class="text-sm">Node</label>
              <select v-model="resultForm.nodeId" style="width: 100%; padding: 6px; border: 1px solid var(--ff-border); border-radius: 4px; font-size: 13px">
                <option value="">Select node...</option>
                <option v-for="n in nodes" :key="n.nodeId" :value="n.nodeId">
                  {{ n.name }} ({{ n.type }})
                </option>
              </select>
            </div>
            <div class="form-group" style="margin: 0">
              <label class="text-sm">Result</label>
              <select v-model="resultForm.result" style="width: 100%; padding: 6px; border: 1px solid var(--ff-border); border-radius: 4px; font-size: 13px">
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin: 8px 0 0">
            <label class="text-sm">Reviewer</label>
            <input v-model="resultForm.reviewerName" style="width: 100%; padding: 6px; border: 1px solid var(--ff-border); border-radius: 4px; font-size: 13px" />
          </div>
          <div class="form-group" style="margin: 8px 0 0">
            <label class="text-sm">Notes {{ resultForm.result === 'fail' ? '(required)' : '' }}</label>
            <textarea v-model="resultForm.notes" rows="2" style="width: 100%; padding: 6px; border: 1px solid var(--ff-border); border-radius: 4px; font-size: 13px"></textarea>
          </div>
          <p v-if="formError" class="form-error">{{ formError }}</p>
          <div style="display: flex; gap: 8px; margin-top: 8px">
            <button class="btn btn-sm btn-primary" @click="addResult">Add Result</button>
            <button class="btn btn-sm btn-secondary" @click="completeInspection">Complete Inspection</button>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>
