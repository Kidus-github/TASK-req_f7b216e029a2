<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useDiagramStore } from '@/stores/diagrams'
import { usePreferencesStore } from '@/stores/preferences'
import { computeAlignmentGuides, applyAlignmentSnap } from '@/utils/alignment'
import CanvasNode from './CanvasNode.vue'
import CanvasEdge from './CanvasEdge.vue'

const props = defineProps({
  highlightedNodeIds: { type: Array, default: () => [] },
  editable: { type: Boolean, default: true },
})

const diagrams = useDiagramStore()
const prefs = usePreferencesStore()

const svgRef = ref(null)
const viewBox = ref({ x: 0, y: 0 })
const zoom = ref(prefs.lastZoom / 100)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const isDragSelecting = ref(false)
const dragSelectStart = ref({ x: 0, y: 0 })
const dragSelectCurrent = ref({ x: 0, y: 0 })

// Connecting edge state
const isConnecting = ref(false)
const connectSourceId = ref(null)
const connectMousePos = ref({ x: 0, y: 0 })

// Alignment guide state
const activeGuides = ref([])
const draggingNodeId = ref(null)

const emit = defineEmits(['node-drop', 'connect-start', 'connect-end', 'node-move-start', 'node-move-end'])

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4.0
const GRID_SIZE = 20

const transform = computed(() =>
  `translate(${viewBox.value.x}, ${viewBox.value.y}) scale(${zoom.value})`
)

const gridPattern = computed(() => {
  const size = GRID_SIZE
  return { size, scaled: size * zoom.value }
})

function screenToCanvas(sx, sy) {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (sx - rect.left - viewBox.value.x) / zoom.value,
    y: (sy - rect.top - viewBox.value.y) / zoom.value,
  }
}

function snapToGrid(val) {
  if (!prefs.gridEnabled) return val
  return Math.round(val / GRID_SIZE) * GRID_SIZE
}

function onWheel(e) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.value + delta))

  // Zoom toward cursor
  const rect = svgRef.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  viewBox.value.x = mx - (mx - viewBox.value.x) * (newZoom / zoom.value)
  viewBox.value.y = my - (my - viewBox.value.y) * (newZoom / zoom.value)

  zoom.value = newZoom
  prefs.lastZoom = Math.round(newZoom * 100)
}

function onMouseDown(e) {
  if (e.target === svgRef.value || e.target.classList.contains('canvas-bg')) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Pan
      isPanning.value = true
      panStart.value = { x: e.clientX - viewBox.value.x, y: e.clientY - viewBox.value.y }
    } else if (e.button === 0) {
      // Click on empty space = clear selection or start drag select
      if (!e.shiftKey) {
        diagrams.clearSelection()
      }
      isDragSelecting.value = true
      const pos = screenToCanvas(e.clientX, e.clientY)
      dragSelectStart.value = pos
      dragSelectCurrent.value = pos
    }
  }
}

function onMouseMove(e) {
  if (isPanning.value) {
    requestAnimationFrame(() => {
      viewBox.value.x = e.clientX - panStart.value.x
      viewBox.value.y = e.clientY - panStart.value.y
    })
  } else if (isDragSelecting.value) {
    dragSelectCurrent.value = screenToCanvas(e.clientX, e.clientY)
  } else if (isConnecting.value) {
    connectMousePos.value = screenToCanvas(e.clientX, e.clientY)
  }
}

function onMouseUp(e) {
  if (isDragSelecting.value) {
    const x1 = Math.min(dragSelectStart.value.x, dragSelectCurrent.value.x)
    const y1 = Math.min(dragSelectStart.value.y, dragSelectCurrent.value.y)
    const x2 = Math.max(dragSelectStart.value.x, dragSelectCurrent.value.x)
    const y2 = Math.max(dragSelectStart.value.y, dragSelectCurrent.value.y)
    if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
      diagrams.selectNodesInRect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
    }
    isDragSelecting.value = false
  }
  isPanning.value = false
}

function onDrop(e) {
  e.preventDefault()
  if (!props.editable) return
  const nodeType = e.dataTransfer?.getData('node-type')
  if (nodeType) {
    const pos = screenToCanvas(e.clientX, e.clientY)
    emit('node-drop', {
      type: nodeType,
      x: snapToGrid(pos.x),
      y: snapToGrid(pos.y),
    })
  }
}

function onDragOver(e) {
  e.preventDefault()
}

function startConnect(nodeId) {
  if (!props.editable) return
  isConnecting.value = true
  connectSourceId.value = nodeId
}

function endConnect(nodeId) {
  if (isConnecting.value && connectSourceId.value && connectSourceId.value !== nodeId) {
    emit('connect-end', { sourceNodeId: connectSourceId.value, targetNodeId: nodeId })
  }
  isConnecting.value = false
  connectSourceId.value = null
}

function cancelConnect() {
  isConnecting.value = false
  connectSourceId.value = null
}

const dragSelectRect = computed(() => {
  if (!isDragSelecting.value) return null
  const x = Math.min(dragSelectStart.value.x, dragSelectCurrent.value.x)
  const y = Math.min(dragSelectStart.value.y, dragSelectCurrent.value.y)
  const w = Math.abs(dragSelectCurrent.value.x - dragSelectStart.value.x)
  const h = Math.abs(dragSelectCurrent.value.y - dragSelectStart.value.y)
  return { x, y, width: w, height: h }
})

// Connect line preview
const connectLineSource = computed(() => {
  if (!isConnecting.value || !connectSourceId.value) return null
  const node = diagrams.currentNodes.find((n) => n.nodeId === connectSourceId.value)
  if (!node) return null
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
})

function onKeyDown(e) {
  if (e.key === 'Escape') {
    cancelConnect()
    diagrams.clearSelection()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

function onNodeMoveStart(nodeId) {
  draggingNodeId.value = nodeId
  activeGuides.value = []
}

function onNodeMove(nodeId, pos) {
  const node = diagrams.currentNodes.find((n) => n.nodeId === nodeId)
  if (!node) return

  const candidate = { ...node, x: pos.x, y: pos.y }
  const result = computeAlignmentGuides(candidate, diagrams.currentNodes)
  activeGuides.value = result.guides
  const snapped = applyAlignmentSnap(pos.x, pos.y, result)
  diagrams.updateNodeLocal(nodeId, { x: snapped.x, y: snapped.y })
}

function onNodeMoveEnd(nodeId, pos) {
  activeGuides.value = []
  draggingNodeId.value = null
  emit('node-move-end', { nodeId, ...pos })
}

defineExpose({ screenToCanvas, snapToGrid, startConnect, endConnect })
</script>

<template>
  <svg
    ref="svgRef"
    class="canvas-svg"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @drop="onDrop"
    @dragover="onDragOver"
  >
    <!-- Grid pattern -->
    <defs>
      <pattern
        id="grid"
        :width="gridPattern.scaled"
        :height="gridPattern.scaled"
        patternUnits="userSpaceOnUse"
        :x="viewBox.x"
        :y="viewBox.y"
      >
        <path
          :d="`M ${gridPattern.scaled} 0 L 0 0 0 ${gridPattern.scaled}`"
          fill="none"
          stroke="var(--ff-border)"
          stroke-width="0.5"
          opacity="0.4"
        />
      </pattern>
      <!-- Arrow marker -->
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="var(--ff-text-secondary)" />
      </marker>
    </defs>

    <!-- Background with grid -->
    <rect class="canvas-bg" width="100%" height="100%" :fill="prefs.gridEnabled ? 'url(#grid)' : 'transparent'" />

    <!-- Main transform group -->
    <g :transform="transform">
      <!-- Edges -->
      <CanvasEdge
        v-for="edge in diagrams.currentEdges"
        :key="edge.edgeId"
        :edge="edge"
        :nodes="diagrams.currentNodes"
        :selected="diagrams.selectedEdgeIds.includes(edge.edgeId)"
        @select="diagrams.selectEdge(edge.edgeId, $event.shiftKey)"
      />

      <!-- Connect preview line -->
      <line
        v-if="isConnecting && connectLineSource"
        :x1="connectLineSource.x"
        :y1="connectLineSource.y"
        :x2="connectMousePos.x"
        :y2="connectMousePos.y"
        stroke="var(--ff-primary)"
        stroke-width="2"
        stroke-dasharray="6,3"
        pointer-events="none"
      />

      <!-- Nodes -->
      <CanvasNode
        v-for="node in diagrams.currentNodes"
        :key="node.nodeId"
        :node="node"
        :selected="diagrams.selectedNodeIds.includes(node.nodeId)"
        :highlighted="props.highlightedNodeIds.includes(node.nodeId)"
        :editable="props.editable"
        :grid-size="GRID_SIZE"
        :snap-to-grid="prefs.gridEnabled"
        @select="diagrams.selectNode(node.nodeId, $event)"
        @move-start="(pos) => { onNodeMoveStart(node.nodeId); emit('node-move-start', { nodeId: node.nodeId, ...pos }) }"
        @move="(pos) => onNodeMove(node.nodeId, pos)"
        @move-end="(pos) => onNodeMoveEnd(node.nodeId, pos)"
        @connect-start="startConnect(node.nodeId)"
        @connect-end="endConnect(node.nodeId)"
      />

      <!-- Alignment guide lines -->
      <line
        v-for="(guide, gi) in activeGuides"
        :key="'guide-' + gi"
        :x1="guide.orientation === 'vertical' ? guide.x : guide.x1"
        :y1="guide.orientation === 'vertical' ? guide.y1 : guide.y"
        :x2="guide.orientation === 'vertical' ? guide.x : guide.x2"
        :y2="guide.orientation === 'vertical' ? guide.y2 : guide.y"
        stroke="#f43f5e"
        stroke-width="1"
        stroke-dasharray="4,3"
        pointer-events="none"
        opacity="0.7"
      />

      <!-- Drag select rectangle -->
      <rect
        v-if="dragSelectRect"
        :x="dragSelectRect.x"
        :y="dragSelectRect.y"
        :width="dragSelectRect.width"
        :height="dragSelectRect.height"
        fill="rgba(37, 99, 235, 0.1)"
        stroke="var(--ff-primary)"
        stroke-width="1"
        stroke-dasharray="4,2"
        pointer-events="none"
      />
    </g>
  </svg>
</template>

<style scoped>
.canvas-svg {
  width: 100%;
  height: 100%;
  cursor: default;
  user-select: none;
  outline: none;
}

.canvas-bg {
  cursor: crosshair;
}
</style>
