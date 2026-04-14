<script setup>
import { ref, computed, watch } from 'vue'
import { useDiagramStore } from '@/stores/diagrams'
import { canvasService } from '@/services/canvasService'

const props = defineProps({
  editable: { type: Boolean, default: true },
  canDelete: { type: Boolean, default: true },
  personaLabel: { type: String, default: 'Author' },
})
const diagrams = useDiagramStore()

const emit = defineEmits(['update-node', 'update-edge', 'delete-node', 'delete-edge', 'attach-image', 'remove-image'])
const iconOptions = [
  { value: '', label: 'None' },
  { value: 'check', label: 'Check' },
  { value: 'alert', label: 'Alert' },
  { value: 'shield', label: 'Shield' },
  { value: 'document', label: 'Document' },
  { value: 'people', label: 'People' },
]

const selectedNode = computed(() => {
  if (diagrams.selectedNodeIds.length !== 1) return null
  return diagrams.currentNodes.find((n) => n.nodeId === diagrams.selectedNodeIds[0])
})

const selectedEdge = computed(() => {
  if (diagrams.selectedEdgeIds.length !== 1) return null
  return diagrams.currentEdges.find((e) => e.edgeId === diagrams.selectedEdgeIds[0])
})

const multiSelected = computed(() =>
  diagrams.selectedNodeIds.length > 1 || diagrams.selectedEdgeIds.length > 1 ||
  (diagrams.selectedNodeIds.length > 0 && diagrams.selectedEdgeIds.length > 0)
)

// Local edit state for node
const nodeForm = ref({})
watch(selectedNode, (n) => {
  if (n) {
    nodeForm.value = {
      name: n.name,
      shortDescription: n.shortDescription,
      ownerTag: n.ownerTag,
      departmentTag: n.departmentTag,
      color: n.color,
      icon: n.icon,
      statusStyle: n.statusStyle || 'default',
      imageAlt: n.imageAlt || '',
    }
  }
}, { immediate: true })

// Local edit state for edge
const edgeForm = ref({})
watch(selectedEdge, (e) => {
  if (e) {
    edgeForm.value = {
      label: e.label,
      routingMode: e.routingMode,
      arrowed: e.arrowed,
    }
  }
}, { immediate: true })

function updateNode(field) {
  if (selectedNode.value) {
    emit('update-node', { nodeId: selectedNode.value.nodeId, updates: { [field]: nodeForm.value[field] } })
  }
}

function updateEdge(field) {
  if (selectedEdge.value) {
    emit('update-edge', { edgeId: selectedEdge.value.edgeId, updates: { [field]: edgeForm.value[field] } })
  }
}
</script>

<template>
  <div class="inspector">
    <div class="inspector-header">Inspector</div>
    <div class="text-muted text-sm" style="margin-bottom: 12px">
      {{ props.editable ? `${props.personaLabel} editing controls are active.` : `${props.personaLabel} view keeps editing controls read-only.` }}
    </div>

    <!-- Nothing selected -->
    <div v-if="!selectedNode && !selectedEdge && !multiSelected" class="inspector-empty">
      Select a node or edge to edit properties.
    </div>

    <!-- Multi-select -->
    <div v-else-if="multiSelected" class="inspector-empty">
      {{ diagrams.selectedNodeIds.length + diagrams.selectedEdgeIds.length }} items selected.
    </div>

    <!-- Node inspector -->
    <div v-else-if="selectedNode" class="inspector-body">
      <div class="inspector-section">
        <div class="field-label">Type</div>
        <div class="field-value type-badge" :style="{ color: selectedNode.color }">
          {{ selectedNode.type.toUpperCase() }}
        </div>
      </div>

      <div class="inspector-section">
        <label class="field-label" for="insp-name">Name</label>
        <input
          id="insp-name"
          v-model="nodeForm.name"
          class="field-input"
          :disabled="!props.editable"
          @change="updateNode('name')"
        />
      </div>

      <div class="inspector-section">
        <label class="field-label" for="insp-desc">Description</label>
        <textarea
          id="insp-desc"
          v-model="nodeForm.shortDescription"
          class="field-input"
          rows="2"
          :disabled="!props.editable"
          @change="updateNode('shortDescription')"
        ></textarea>
      </div>

      <div class="inspector-section">
        <label class="field-label" for="insp-owner">Owner Tag</label>
        <input
          id="insp-owner"
          v-model="nodeForm.ownerTag"
          class="field-input"
          placeholder="Optional"
          :disabled="!props.editable"
          @change="updateNode('ownerTag')"
        />
      </div>

      <div class="inspector-section">
        <label class="field-label" for="insp-dept">Department Tag</label>
        <input
          id="insp-dept"
          v-model="nodeForm.departmentTag"
          class="field-input"
          placeholder="Optional"
          :disabled="!props.editable"
          @change="updateNode('departmentTag')"
        />
      </div>

      <div class="inspector-section">
        <label class="field-label" for="insp-color">Color</label>
        <input
          id="insp-color"
          v-model="nodeForm.color"
          class="field-input"
          type="color"
          :disabled="!props.editable"
          @change="updateNode('color')"
        />
      </div>

      <div class="inspector-section">
        <label class="field-label" for="insp-icon">Icon</label>
        <select
          id="insp-icon"
          v-model="nodeForm.icon"
          class="field-input"
          :disabled="!props.editable"
          @change="updateNode('icon')"
        >
          <option v-for="option in iconOptions" :key="option.value || 'none'" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="inspector-section">
        <label class="field-label" for="insp-status">Status Style</label>
        <select
          id="insp-status"
          v-model="nodeForm.statusStyle"
          class="field-input"
          :disabled="!props.editable"
          @change="updateNode('statusStyle')"
        >
          <option v-for="status in canvasService.VALID_STATUS_STYLES" :key="status" :value="status">
            {{ status }}
          </option>
        </select>
      </div>

      <div class="inspector-section">
        <label class="field-label">Embedded Image</label>
        <div class="field-value">
          {{ selectedNode.imageId ? (selectedNode.embeddedImageName || 'Attached image') : 'No embedded image' }}
        </div>
        <label v-if="props.editable" class="btn btn-sm btn-secondary" style="margin-top: 8px">
          Attach Image
          <input
            type="file"
            accept="image/*"
            style="display: none"
            @change="emit('attach-image', { nodeId: selectedNode.nodeId, file: $event.target.files?.[0] || null, reset: $event.target })"
          />
        </label>
        <button
          v-if="props.editable && selectedNode.imageId"
          class="btn btn-sm btn-secondary"
          style="margin-top: 8px"
          @click="emit('remove-image', selectedNode.nodeId)"
        >
          Remove Image
        </button>
      </div>

      <div class="inspector-section">
        <label class="field-label">Position</label>
        <div class="field-value">
          {{ Math.round(selectedNode.x) }}, {{ Math.round(selectedNode.y) }}
        </div>
      </div>

      <div class="inspector-section">
        <label class="field-label">Size</label>
        <div class="field-value">
          {{ selectedNode.width }} x {{ selectedNode.height }}
        </div>
      </div>

      <button
        v-if="props.canDelete"
        class="btn btn-sm btn-danger"
        style="width: 100%; margin-top: 12px"
        @click="emit('delete-node', selectedNode.nodeId)"
      >
        Delete Node
      </button>
    </div>

    <!-- Edge inspector -->
    <div v-else-if="selectedEdge" class="inspector-body">
      <div class="inspector-section">
        <label class="field-label" for="insp-edge-label">Label</label>
        <input
          id="insp-edge-label"
          v-model="edgeForm.label"
          class="field-input"
          placeholder="Optional label"
          :disabled="!props.editable"
          @change="updateEdge('label')"
        />
      </div>

      <div class="inspector-section">
        <label class="field-label">Routing Mode</label>
        <div style="display: flex; gap: 4px">
          <button
            :class="['btn', 'btn-sm', edgeForm.routingMode === 'orthogonal' ? 'btn-primary' : 'btn-secondary']"
            :disabled="!props.editable"
            @click="edgeForm.routingMode = 'orthogonal'; updateEdge('routingMode')"
          >
            Orthogonal
          </button>
          <button
            :class="['btn', 'btn-sm', edgeForm.routingMode === 'curve' ? 'btn-primary' : 'btn-secondary']"
            :disabled="!props.editable"
            @click="edgeForm.routingMode = 'curve'; updateEdge('routingMode')"
          >
            Curve
          </button>
        </div>
      </div>

      <div class="inspector-section">
        <label class="field-label">Arrowed</label>
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer">
          <input
            type="checkbox"
            v-model="edgeForm.arrowed"
            :disabled="!props.editable"
            @change="updateEdge('arrowed')"
          />
          Show arrowhead
        </label>
      </div>

      <button
        v-if="props.canDelete"
        class="btn btn-sm btn-danger"
        style="width: 100%; margin-top: 12px"
        @click="emit('delete-edge', selectedEdge.edgeId)"
      >
        Delete Edge
      </button>
    </div>
  </div>
</template>

<style scoped>
.inspector {
  padding: 12px;
  height: 100%;
  overflow-y: auto;
}

.inspector-header {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 12px;
}

.inspector-empty {
  color: var(--ff-text-muted);
  font-size: 12px;
}

.inspector-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inspector-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ff-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.field-value {
  font-size: 13px;
}

.field-input {
  padding: 6px 8px;
  border: 1px solid var(--ff-border);
  border-radius: 4px;
  font-size: 13px;
  background: var(--ff-bg);
  color: var(--ff-text);
  font-family: var(--ff-font);
}

.field-input:focus {
  outline: none;
  border-color: var(--ff-border-focus);
}

.type-badge {
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
}
</style>
