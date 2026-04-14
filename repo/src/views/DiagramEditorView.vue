<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDiagramStore } from '@/stores/diagrams'
import { usePreferencesStore } from '@/stores/preferences'
import { useUIStore } from '@/stores/ui'
import { useHistoryStore } from '@/stores/history'
import SvgCanvas from '@/components/diagrams/SvgCanvas.vue'
import NodeLibrary from '@/components/diagrams/NodeLibrary.vue'
import InspectorDrawer from '@/components/diagrams/InspectorDrawer.vue'
import HistoryModal from '@/components/diagrams/HistoryModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import ConflictBanner from '@/components/diagrams/ConflictBanner.vue'
import VersionPanel from '@/components/diagrams/VersionPanel.vue'
import PublishModal from '@/components/diagrams/PublishModal.vue'
import RetractModal from '@/components/diagrams/RetractModal.vue'
import InspectionPanel from '@/components/diagrams/InspectionPanel.vue'
import { useAutosave } from '@/composables/useAutosave'
import { useConcurrency } from '@/composables/useConcurrency'
import { versionService } from '@/services/versionService'
import { traceabilityService } from '@/services/traceabilityService'
import { exportService } from '@/services/exportService'
import ImportModal from '@/components/diagrams/ImportModal.vue'
import VerificationPanel from '@/components/diagrams/VerificationPanel.vue'
import { getPersonaConfig } from '@/utils/persona'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const diagrams = useDiagramStore()
const prefs = usePreferencesStore()
const ui = useUIStore()
const history = useHistoryStore()
const persona = computed(() => getPersonaConfig(prefs.activePersona))
const nodeMoveOrigins = ref({})

const { autosaveStatus, startAutosave, stopAutosave, manualSave, setGestureActive } = useAutosave(diagrams, auth, ui)
const { conflictState, concurrentTabWarning, init: initConcurrency, ignoreTemporarily, refreshToLatest, destroy: destroyConcurrency } = useConcurrency(diagrams, ui)

const loading = ref(true)
const editingTitle = ref(false)
const titleInput = ref('')
const showHistory = ref(false)
const showVersions = ref(false)
const showPublish = ref(false)
const showRetract = ref(false)
const showInspections = ref(false)
const showImport = ref(false)
const showVerification = ref(false)
const highlightedNodeIds = ref([])
const deleteConfirm = ref(null)

function requirePersonaAccess(flag, message) {
  if (!flag) {
    ui.showToast(message, 'warning')
    return false
  }
  return true
}

onMounted(async () => {
  try {
    const d = await diagrams.openDiagram(route.params.id)
    if (!d) {
      ui.showToast('Diagram not found.', 'error')
      router.push('/diagrams')
      return
    }
    prefs.addRecentFile(d.diagramId, d.title)
    history.clear()
    startAutosave()
    initConcurrency(d.diagramId)
  } catch (e) {
    ui.showToast(e.message, 'error')
    router.push('/diagrams')
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  stopAutosave()
  if (diagrams.currentDiagram) {
    destroyConcurrency(diagrams.currentDiagram.diagramId)
  }
  diagrams.closeDiagram()
})

async function handleRollback(snapshotId) {
  try {
    const result = await versionService.rollback(
      diagrams.currentDiagram.diagramId,
      snapshotId,
      auth.userId
    )
    await diagrams.openDiagram(result.diagram.diagramId)
    diagrams.isDirty = false
    history.clear()
    showVersions.value = false
    ui.showToast('Rolled back successfully.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handlePublish() {
  if (!requirePersonaAccess(persona.value.canPublish, 'Switch to Author or Reviewer persona to publish.')) return
  try {
    await manualSave()
    await versionService.createSnapshot(diagrams.currentDiagram.diagramId, 'publish', auth.userId)
    await diagrams.transitionStatus(diagrams.currentDiagram.diagramId, 'published', auth.userId)
    showPublish.value = false
    ui.showToast('Diagram published!', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleRetract(reason) {
  if (!requirePersonaAccess(persona.value.canPublish, 'Switch to Author or Reviewer persona to retract.')) return
  try {
    await versionService.createSnapshot(diagrams.currentDiagram.diagramId, 'unpublish', auth.userId)
    await diagrams.transitionStatus(diagrams.currentDiagram.diagramId, 'retracted', auth.userId, reason)
    showRetract.value = false
    ui.showToast('Diagram retracted.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function generateTraceability() {
  if (!requirePersonaAccess(persona.value.canGenerateTraceability, 'Switch to the Author persona to generate traceability codes.')) return
  try {
    const nodeIds = diagrams.selectedNodeIds.length > 0
      ? diagrams.selectedNodeIds
      : diagrams.currentNodes.map((n) => n.nodeId)
    const assignments = await traceabilityService.generateCodes(
      diagrams.currentDiagram.diagramId,
      nodeIds,
      auth.userId
    )
    // Reload nodes to get updated traceability codes
    const d = await diagrams.openDiagram(diagrams.currentDiagram.diagramId)
    ui.showToast(`Generated ${assignments.length} traceability code(s).`, 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleExportJSON() {
  try {
    const json = await exportService.exportJSON(diagrams.currentDiagram.diagramId)
    const slug = exportService.slugify(diagrams.currentDiagram.title)
    const ts = exportService.getTimestampSlug()
    exportService.downloadFile(json, `${slug}-${ts}.json`, 'application/json')
    ui.showToast('JSON exported.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleExportSVG() {
  try {
    const svgEl = document.querySelector('.canvas-svg')
    const svg = exportService.exportSVG(svgEl)
    const slug = exportService.slugify(diagrams.currentDiagram.title)
    const ts = exportService.getTimestampSlug()
    exportService.downloadFile(svg, `${slug}-${ts}.svg`, 'image/svg+xml')
    ui.showToast('SVG exported.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleExportPNG() {
  try {
    const svgEl = document.querySelector('.canvas-svg')
    const blob = await exportService.exportPNG(svgEl, 2)
    const slug = exportService.slugify(diagrams.currentDiagram.title)
    const ts = exportService.getTimestampSlug()
    exportService.downloadFile(blob, `${slug}-${ts}.png`, 'image/png')
    ui.showToast('PNG exported.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleImported() {
  await diagrams.openDiagram(diagrams.currentDiagram.diagramId)
  showImport.value = false
  ui.showToast('Import complete. Diagram refreshed.', 'success')
}

async function duplicateAsNew() {
  try {
    const d = diagrams.currentDiagram
    if (!d) throw new Error('No diagram open.')

    // Create the new diagram shell
    const newDiagram = await diagrams.createDiagram({
      title: d.title + ' (copy)',
      description: d.description,
      ownerUserId: auth.userId,
    })

    // Deep-clone nodes with new IDs
    const { getDB } = await import('@/db/schema')
    const { generateId } = await import('@/utils/id')
    const { getTimestamp } = await import('@/db/schema')
    const db = await getDB()
    const ts = getTimestamp()

    const oldToNewNodeId = new Map()
    const oldToNewImageId = new Map()
    for (const image of diagrams.currentImages) {
      const newImageId = generateId()
      oldToNewImageId.set(image.imageId, newImageId)
      await db.put('embeddedImages', {
        ...image,
        imageId: newImageId,
        diagramId: newDiagram.diagramId,
        createdAt: ts.iso,
        updatedAt: ts.iso,
      })
    }

    for (const node of diagrams.currentNodes) {
      const newNodeId = generateId()
      oldToNewNodeId.set(node.nodeId, newNodeId)
      const { embeddedImageDataUrl, embeddedImageName, ...persistedNode } = node
      await db.put('nodes', {
        ...persistedNode,
        nodeId: newNodeId,
        diagramId: newDiagram.diagramId,
        imageId: node.imageId ? oldToNewImageId.get(node.imageId) || null : null,
        traceabilityCode: null,
        createdAt: ts.iso,
        updatedAt: ts.iso,
      })
    }

    // Deep-clone edges with remapped node IDs
    for (const edge of diagrams.currentEdges) {
      const newSrc = oldToNewNodeId.get(edge.sourceNodeId)
      const newTgt = oldToNewNodeId.get(edge.targetNodeId)
      if (newSrc && newTgt) {
        await db.put('edges', {
          ...edge,
          edgeId: generateId(),
          diagramId: newDiagram.diagramId,
          sourceNodeId: newSrc,
          targetNodeId: newTgt,
          createdAt: ts.iso,
          updatedAt: ts.iso,
        })
      }
    }

    ui.showToast(`Duplicated "${d.title}" with ${diagrams.currentNodes.length} nodes and ${diagrams.currentEdges.length} edges.`, 'success')
    router.push(`/diagrams/${newDiagram.diagramId}`)
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

function startEditTitle() {
  if (!requirePersonaAccess(persona.value.canEditCanvas, 'Switch to the Author persona to edit diagram details.')) return
  titleInput.value = diagrams.currentDiagram?.title || ''
  editingTitle.value = true
}

async function saveTitle() {
  if (!requirePersonaAccess(persona.value.canEditCanvas, 'Switch to the Author persona to edit diagram details.')) return
  if (!titleInput.value.trim()) return
  try {
    await diagrams.updateDiagram(diagrams.currentDiagram.diagramId, { title: titleInput.value }, auth.userId)
    ui.showToast('Title updated.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
  editingTitle.value = false
}

async function handleNodeDrop({ type, x, y }) {
  if (!requirePersonaAccess(persona.value.canEditCanvas, 'Switch to the Author persona to add nodes.')) return
  const defaultNames = { start: 'Start', end: 'End', decision: 'Decision', action: 'Action', note: 'Note' }
  try {
    const node = await diagrams.addNode(
      { type, name: defaultNames[type] || 'Node', x, y },
      auth.userId
    )
    history.pushEntry({
      label: `Add ${type} node`,
      undo: async () => {
        await diagrams.deleteNodeWithEdges(node.nodeId, auth.userId)
      },
      redo: async () => {
        await diagrams.restoreNodeWithEdges(node, [])
      },
    })
    ui.showToast(`${type} node added.`, 'success', 2000)
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleConnectEnd({ sourceNodeId, targetNodeId }) {
  if (!requirePersonaAccess(persona.value.canEditCanvas, 'Switch to the Author persona to connect nodes.')) return
  try {
    const edge = await diagrams.addEdge({ sourceNodeId, targetNodeId })
    history.pushEntry({
      label: 'Connect nodes',
      undo: async () => {
        await diagrams.deleteEdgeFromStore(edge.edgeId)
      },
      redo: async () => {
        await diagrams.restoreEdge(edge)
      },
    })
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

function handleNodeMoveStart({ nodeId, x, y }) {
  if (!persona.value.canEditCanvas) return
  nodeMoveOrigins.value = {
    ...nodeMoveOrigins.value,
    [nodeId]: { x, y },
  }
}

async function handleNodeMoveEnd({ nodeId, x, y }) {
  if (!requirePersonaAccess(persona.value.canEditCanvas, 'Switch to the Author persona to reposition nodes.')) return
  try {
    const before = nodeMoveOrigins.value[nodeId]
    delete nodeMoveOrigins.value[nodeId]
    if (!before || (before.x === x && before.y === y)) return

    await diagrams.updateNodeInStore(nodeId, { x, y })

    history.pushEntry({
      label: 'Move node',
      undo: async () => {
        await diagrams.updateNodeInStore(nodeId, before)
      },
      redo: async () => {
        await diagrams.updateNodeInStore(nodeId, { x, y })
      },
    })
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleUpdateNode({ nodeId, updates }) {
  if (!requirePersonaAccess(persona.value.canEditInspector, 'Switch to the Author persona to edit node properties.')) return
  try {
    const node = diagrams.currentNodes.find((n) => n.nodeId === nodeId)
    const before = {}
    for (const k of Object.keys(updates)) before[k] = node[k]

    await diagrams.updateNodeInStore(nodeId, updates)

    history.pushEntry({
      label: `Edit node ${Object.keys(updates).join(', ')}`,
      undo: async () => {
        await diagrams.updateNodeInStore(nodeId, before)
      },
      redo: async () => {
        await diagrams.updateNodeInStore(nodeId, updates)
      },
    })
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleUpdateEdge({ edgeId, updates }) {
  if (!requirePersonaAccess(persona.value.canEditInspector, 'Switch to the Author persona to edit connector properties.')) return
  try {
    const edge = diagrams.currentEdges.find((e) => e.edgeId === edgeId)
    const before = {}
    for (const k of Object.keys(updates)) before[k] = edge[k]

    await diagrams.updateEdgeInStore(edgeId, updates)

    history.pushEntry({
      label: `Edit edge ${Object.keys(updates).join(', ')}`,
      undo: async () => {
        await diagrams.updateEdgeInStore(edgeId, before)
      },
      redo: async () => {
        await diagrams.updateEdgeInStore(edgeId, updates)
      },
    })
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

function requestDeleteNode(nodeId) {
  if (!requirePersonaAccess(persona.value.canDeleteItems, 'Switch to the Author persona to delete nodes.')) return
  const edges = diagrams.currentEdges.filter(
    (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId
  )
  deleteConfirm.value = { type: 'node', nodeId, edgeCount: edges.length }
}

async function confirmDeleteNode() {
  const { nodeId } = deleteConfirm.value
  deleteConfirm.value = null
  try {
    const result = await diagrams.deleteNodeWithEdges(nodeId, auth.userId)
    history.pushEntry({
      label: `Delete node + ${result.deletedEdges.length} edges`,
      undo: async () => {
        await diagrams.restoreNodeWithEdges(result.deletedNode, result.deletedEdges)
      },
      redo: async () => {
        await diagrams.deleteNodeWithEdges(result.deletedNode.nodeId, auth.userId)
      },
    })
    ui.showToast('Node deleted.', 'success', 2000)
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function requestDeleteEdge(edgeId) {
  if (!requirePersonaAccess(persona.value.canDeleteItems, 'Switch to the Author persona to delete connectors.')) return
  try {
    const edge = await diagrams.deleteEdgeFromStore(edgeId)
    history.pushEntry({
      label: 'Delete edge',
      undo: async () => {
        await diagrams.restoreEdge(edge)
      },
      redo: async () => {
        await diagrams.deleteEdgeFromStore(edge.edgeId)
      },
    })
    ui.showToast('Edge deleted.', 'success', 2000)
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function handleAttachImage({ nodeId, file, reset }) {
  if (!requirePersonaAccess(persona.value.canEditInspector, 'Switch to the Author persona to attach images.')) return
  if (!file) return
  try {
    await diagrams.attachNodeImage(nodeId, file, auth.userId)
    ui.showToast('Image embedded on node.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  } finally {
    if (reset) reset.value = ''
  }
}

async function handleRemoveImage(nodeId) {
  if (!requirePersonaAccess(persona.value.canEditInspector, 'Switch to the Author persona to remove images.')) return
  try {
    await diagrams.removeNodeImage(nodeId, auth.userId)
    ui.showToast('Embedded image removed.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

function handleHighlight(ids) {
  highlightedNodeIds.value = ids
}

// Keyboard shortcuts
function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    history.undoAction()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    history.redoAction()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!persona.value.canDeleteItems) return
    if (diagrams.selectedNodeIds.length === 1) {
      requestDeleteNode(diagrams.selectedNodeIds[0])
    } else if (diagrams.selectedEdgeIds.length === 1) {
      requestDeleteEdge(diagrams.selectedEdgeIds[0])
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div v-if="loading" class="page">
    <div class="empty-state">Loading diagram...</div>
  </div>
  <div v-else-if="diagrams.currentDiagram" style="display: flex; flex-direction: column; height: calc(100vh - var(--ff-topbar-height))">
    <!-- Editor toolbar -->
    <div class="editor-toolbar">
      <button class="btn btn-sm btn-secondary" @click="router.push('/diagrams')">Back</button>

      <div v-if="!editingTitle" class="toolbar-title" :style="{ cursor: persona.canEditCanvas ? 'pointer' : 'default' }" @click="startEditTitle">
        {{ diagrams.currentDiagram.title }}
      </div>
      <div v-else style="display: flex; gap: 4px">
        <input
          v-model="titleInput"
          class="toolbar-input"
          @keydown.enter="saveTitle"
          @keydown.escape="editingTitle = false"
        />
        <button class="btn btn-sm btn-primary" @click="saveTitle">Save</button>
        <button class="btn btn-sm btn-secondary" @click="editingTitle = false">Cancel</button>
      </div>

      <span :class="['badge', `badge-${diagrams.currentDiagram.status}`]">
        {{ diagrams.currentDiagram.status }}
      </span>
      <span :class="['badge', `persona-badge-${persona.badgeTone}`]">{{ persona.label }}</span>
      <span class="text-muted text-sm">{{ persona.editorPrompt }}</span>

      <div style="flex: 1"></div>

      <button class="btn btn-sm btn-secondary" :disabled="!history.canUndo" @click="history.undoAction()" title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button class="btn btn-sm btn-secondary" :disabled="!history.canRedo" @click="history.redoAction()" title="Redo (Ctrl+Y)">
        Redo
      </button>
      <button class="btn btn-sm btn-secondary" @click="showHistory = true">
        History ({{ history.entries.length }})
      </button>
      <button class="btn btn-sm btn-secondary" @click="showVersions = true">
        Versions
      </button>
      <button
        v-if="persona.canEditCanvas"
        class="btn btn-sm btn-primary"
        @click="manualSave"
        :disabled="!diagrams.isDirty || autosaveStatus === 'saving'"
      >
        Save
      </button>

      <template v-if="persona.canPublish && (diagrams.currentDiagram?.status === 'draft' || diagrams.currentDiagram?.status === 'retracted')">
        <button class="btn btn-sm btn-secondary" @click="showPublish = true">Publish</button>
      </template>
      <template v-if="persona.canPublish && diagrams.currentDiagram?.status === 'published'">
        <button class="btn btn-sm btn-secondary" @click="showRetract = true">Retract</button>
      </template>
      <button v-if="persona.canGenerateTraceability" class="btn btn-sm btn-secondary" @click="generateTraceability" title="Generate traceability codes">
        Trace
      </button>
      <button class="btn btn-sm btn-secondary" @click="showVerification = true" title="Verify traceability codes">
        Verify
      </button>
      <button v-if="persona.canInspect" class="btn btn-sm btn-secondary" @click="showInspections = true">
        Inspect
      </button>
      <button v-if="persona.canImport" class="btn btn-sm btn-secondary" @click="showImport = true">Import</button>
      <button class="btn btn-sm btn-secondary" @click="handleExportJSON">JSON</button>
      <button class="btn btn-sm btn-secondary" @click="handleExportSVG">SVG</button>
      <button class="btn btn-sm btn-secondary" @click="handleExportPNG">PNG</button>

      <span class="text-muted text-sm">
        {{ diagrams.currentNodes.length }}/500 nodes | {{ diagrams.currentEdges.length }}/800 edges
      </span>
      <span class="autosave-status" :class="`status-${autosaveStatus}`">
        {{ autosaveStatus === 'saved' ? 'Saved' : autosaveStatus === 'dirty' ? 'Unsaved' : autosaveStatus === 'saving' ? 'Saving...' : autosaveStatus === 'save_failed' ? 'Save failed' : 'Quota error' }}
      </span>
    </div>

    <!-- Conflict/concurrency banners -->
    <ConflictBanner
      :conflict-type="conflictState?.type"
      :concurrent-tab="concurrentTabWarning"
      @refresh="refreshToLatest"
      @ignore="ignoreTemporarily"
      @duplicate="duplicateAsNew"
    />

    <!-- Main editing area -->
    <div style="flex: 1; display: flex; overflow: hidden">
      <!-- Left: Node library -->
      <div class="panel-left">
        <div v-if="!persona.canUseLibrary" class="persona-panel-copy">
          <strong>{{ persona.editorModeLabel }}</strong>
          <span>{{ persona.editorPrompt }}</span>
        </div>
        <NodeLibrary v-else />
      </div>

      <!-- Center: Canvas -->
      <div class="panel-center">
        <SvgCanvas
          :highlighted-node-ids="highlightedNodeIds"
          :editable="persona.canEditCanvas"
          @node-drop="handleNodeDrop"
          @connect-end="handleConnectEnd"
          @node-move-start="handleNodeMoveStart"
          @node-move-end="handleNodeMoveEnd"
        />
      </div>

      <!-- Right: Inspector -->
      <div class="panel-right">
        <InspectorDrawer
          :editable="persona.canEditInspector"
          :can-delete="persona.canDeleteItems"
          :persona-label="persona.label"
          @update-node="handleUpdateNode"
          @update-edge="handleUpdateEdge"
          @delete-node="requestDeleteNode"
          @delete-edge="requestDeleteEdge"
          @attach-image="handleAttachImage"
          @remove-image="handleRemoveImage"
        />
      </div>
    </div>

    <!-- Bottom status bar -->
    <div class="status-bar">
      <span>Zoom: {{ prefs.lastZoom }}%</span>
      <span>Grid: {{ prefs.gridEnabled ? 'On' : 'Off' }}</span>
      <button class="status-toggle" @click="prefs.gridEnabled = !prefs.gridEnabled">
        Toggle Grid
      </button>
      <span style="flex: 1"></span>
      <span>{{ diagrams.selectedNodeIds.length + diagrams.selectedEdgeIds.length }} selected</span>
    </div>

    <!-- History Modal -->
    <HistoryModal v-if="showHistory" @close="showHistory = false" />

    <!-- Version Panel -->
    <VersionPanel
      v-if="showVersions && diagrams.currentDiagram"
      :diagram-id="diagrams.currentDiagram.diagramId"
      @rollback="handleRollback"
      @close="showVersions = false"
    />

    <!-- Publish Modal -->
    <PublishModal
      v-if="showPublish && diagrams.currentDiagram"
      :diagram-id="diagrams.currentDiagram.diagramId"
      :is-dirty="diagrams.isDirty"
      @publish="handlePublish"
      @close="showPublish = false"
    />

    <!-- Retract Modal -->
    <RetractModal
      v-if="showRetract"
      @retract="handleRetract"
      @close="showRetract = false"
    />

    <!-- Inspections -->
    <InspectionPanel
      v-if="showInspections && diagrams.currentDiagram"
      :diagram-id="diagrams.currentDiagram.diagramId"
      :diagram-version="diagrams.currentDiagram.currentVersionNumber"
      :user-id="auth.userId"
      :user-name="auth.displayName"
      :nodes="diagrams.currentNodes"
      @close="showInspections = false"
    />

    <!-- Import Modal -->
    <ImportModal
      v-if="showImport && diagrams.currentDiagram"
      :diagram-id="diagrams.currentDiagram.diagramId"
      :user-id="auth.userId"
      @imported="handleImported"
      @close="showImport = false"
    />

    <!-- Verification Panel -->
    <VerificationPanel
      v-if="showVerification && diagrams.currentDiagram"
      :diagram-id="diagrams.currentDiagram.diagramId"
      :nodes="diagrams.currentNodes"
      @highlight="handleHighlight"
      @close="showVerification = false; highlightedNodeIds = []"
    />

    <!-- Delete Node Confirm -->
    <ConfirmModal
      v-if="deleteConfirm?.type === 'node'"
      title="Delete Node"
      :message="`Delete this node${deleteConfirm.edgeCount > 0 ? ` and ${deleteConfirm.edgeCount} connected edge(s)` : ''}?`"
      confirm-text="Delete"
      :danger="true"
      @confirm="confirmDeleteNode"
      @cancel="deleteConfirm = null"
    />
  </div>
</template>

<style scoped>
.editor-toolbar {
  padding: 6px 12px;
  border-bottom: 1px solid var(--ff-border);
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ff-bg-secondary);
  flex-shrink: 0;
}

.toolbar-title {
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
}

.toolbar-title:hover {
  color: var(--ff-primary);
}

.toolbar-input {
  padding: 4px 8px;
  border: 1px solid var(--ff-border);
  border-radius: 4px;
  font-size: 14px;
}

.autosave-status {
  font-size: 11px;
  font-weight: 600;
}

.status-saved { color: var(--ff-success); }
.status-dirty { color: var(--ff-warning); }
.status-saving { color: var(--ff-primary); }
.status-save_failed { color: var(--ff-danger); }
.status-paused_quota_error { color: var(--ff-danger); }

.panel-left {
  width: 200px;
  border-right: 1px solid var(--ff-border);
  background: var(--ff-bg-secondary);
  flex-shrink: 0;
  overflow-y: auto;
}

.panel-center {
  flex: 1;
  background: var(--ff-bg-tertiary);
  overflow: hidden;
  position: relative;
}

.panel-right {
  width: 240px;
  border-left: 1px solid var(--ff-border);
  background: var(--ff-bg-secondary);
  flex-shrink: 0;
  overflow-y: auto;
}

.status-bar {
  padding: 4px 12px;
  border-top: 1px solid var(--ff-border);
  background: var(--ff-bg-secondary);
  font-size: 11px;
  color: var(--ff-text-muted);
  display: flex;
  gap: 16px;
  align-items: center;
  flex-shrink: 0;
}

.status-toggle {
  background: none;
  border: none;
  color: var(--ff-primary);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.status-toggle:hover {
  text-decoration: underline;
}

.persona-panel-copy {
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--ff-text-secondary);
}
</style>
