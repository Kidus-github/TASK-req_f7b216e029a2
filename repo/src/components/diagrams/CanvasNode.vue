<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  highlighted: { type: Boolean, default: false },
  editable: { type: Boolean, default: true },
  gridSize: { type: Number, default: 20 },
  snapToGrid: { type: Boolean, default: true },
})

const emit = defineEmits(['select', 'move-start', 'move', 'move-end', 'connect-start', 'connect-end'])

const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

const shapeClass = computed(() => `node-type-${props.node.type}`)

const nodeColor = computed(() => props.node.color || '#6b7280')

const borderColor = computed(() => props.selected ? 'var(--ff-primary)' : nodeColor.value)

function snap(val) {
  if (!props.snapToGrid) return val
  return Math.round(val / props.gridSize) * props.gridSize
}

function onMouseDown(e) {
  e.stopPropagation()
  emit('select', e.shiftKey)
  if (!props.editable) return

  isDragging.value = true
  dragOffset.value = {
    x: e.clientX,
    y: e.clientY,
    startX: props.node.x,
    startY: props.node.y,
  }

  const svgEl = e.target.closest('svg')
  const zoom = getZoomFromSvg(svgEl)

  function onMove(ev) {
    if (!isDragging.value) return
    requestAnimationFrame(() => {
      const dx = (ev.clientX - dragOffset.value.x) / zoom
      const dy = (ev.clientY - dragOffset.value.y) / zoom
      const newX = snap(dragOffset.value.startX + dx)
      const newY = snap(dragOffset.value.startY + dy)
      emit('move', { x: newX, y: newY })
    })
  }

  function onUp() {
    if (isDragging.value) {
      isDragging.value = false
      emit('move-end', { x: props.node.x, y: props.node.y })
    }
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  emit('move-start', { x: props.node.x, y: props.node.y })
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onConnectMouseDown(e) {
  e.stopPropagation()
  if (!props.editable) return
  emit('connect-start')
}

function onMouseUp(e) {
  emit('connect-end')
}

function getZoomFromSvg(svgEl) {
  if (!svgEl) return 1
  const g = svgEl.querySelector('g[transform]')
  if (!g) return 1
  const match = g.getAttribute('transform').match(/scale\(([^)]+)\)/)
  return match ? parseFloat(match[1]) : 1
}

const typeLabel = computed(() => {
  const labels = { start: 'START', end: 'END', decision: 'DECISION', action: 'ACTION', note: 'NOTE' }
  return labels[props.node.type] || props.node.type.toUpperCase()
})

const statusLabel = computed(() => (props.node.statusStyle || 'default').toUpperCase())
const iconLabel = computed(() => {
  const labels = {
    none: '',
    check: 'CHK',
    alert: 'ALT',
    shield: 'SAFE',
    document: 'DOC',
    people: 'TEAM',
  }
  return labels[props.node.icon || 'none'] || (props.node.icon || '').slice(0, 4).toUpperCase()
})
const hasTags = computed(() => !!(props.node.ownerTag || props.node.departmentTag))
</script>

<template>
  <g
    :transform="`translate(${node.x}, ${node.y})`"
    class="canvas-node"
    :style="{ cursor: editable ? 'move' : 'pointer' }"
    @mousedown="onMouseDown"
    @mouseup="onMouseUp"
  >
    <!-- Shape background -->
    <rect
      v-if="node.type !== 'decision'"
      :width="node.width"
      :height="node.height"
      :rx="node.type === 'start' || node.type === 'end' ? 20 : 6"
      :fill="nodeColor"
      :fill-opacity="0.1"
      :stroke="borderColor"
      :stroke-width="selected ? 2.5 : 1.5"
    />
    <!-- Diamond for decision -->
    <polygon
      v-if="node.type === 'decision'"
      :points="`${node.width/2},0 ${node.width},${node.height/2} ${node.width/2},${node.height} 0,${node.height/2}`"
      :fill="nodeColor"
      :fill-opacity="0.1"
      :stroke="borderColor"
      :stroke-width="selected ? 2.5 : 1.5"
    />

    <!-- Type label -->
    <text
      :x="node.width / 2"
      y="16"
      text-anchor="middle"
      font-size="9"
      font-weight="700"
      :fill="nodeColor"
      letter-spacing="0.5"
      pointer-events="none"
    >
      {{ typeLabel }}
    </text>

    <line
      :x1="8"
      :y1="22"
      :x2="node.width - 8"
      :y2="22"
      :stroke="borderColor"
      stroke-width="1"
      stroke-opacity="0.5"
      pointer-events="none"
    />

    <text
      v-if="iconLabel"
      x="10"
      y="17"
      text-anchor="start"
      font-size="8"
      font-weight="700"
      :fill="nodeColor"
      pointer-events="none"
    >
      {{ iconLabel }}
    </text>

    <text
      :x="node.width - 10"
      y="17"
      text-anchor="end"
      font-size="8"
      font-weight="700"
      :fill="borderColor"
      pointer-events="none"
    >
      {{ statusLabel }}
    </text>

    <g v-if="node.embeddedImageDataUrl">
      <rect
        x="8"
        y="28"
        width="36"
        height="24"
        rx="4"
        fill="rgba(255,255,255,0.7)"
        :stroke="borderColor"
        stroke-width="1"
        pointer-events="none"
      />
      <image
        :href="node.embeddedImageDataUrl"
        x="9"
        y="29"
        width="34"
        height="22"
        preserveAspectRatio="xMidYMid slice"
        pointer-events="none"
      />
    </g>

    <!-- Name -->
    <text
      :x="node.embeddedImageDataUrl ? 56 : node.width / 2"
      :y="node.embeddedImageDataUrl ? node.height / 2 - 4 : node.height / 2 + 4"
      :text-anchor="node.embeddedImageDataUrl ? 'start' : 'middle'"
      font-size="12"
      font-weight="600"
      fill="var(--ff-text)"
      pointer-events="none"
    >
      {{ node.name.length > 18 ? node.name.slice(0, 16) + '...' : node.name }}
    </text>

    <!-- Description -->
    <text
      v-if="node.shortDescription"
      :x="node.embeddedImageDataUrl ? 56 : node.width / 2"
      :y="node.embeddedImageDataUrl ? node.height / 2 + 12 : node.height / 2 + 20"
      :text-anchor="node.embeddedImageDataUrl ? 'start' : 'middle'"
      font-size="10"
      fill="var(--ff-text-muted)"
      pointer-events="none"
    >
      {{ node.shortDescription.length > 24 ? node.shortDescription.slice(0, 22) + '...' : node.shortDescription }}
    </text>

    <text
      v-if="hasTags"
      :x="node.width / 2"
      :y="node.height - 10"
      text-anchor="middle"
      font-size="9"
      font-weight="600"
      :fill="borderColor"
      pointer-events="none"
    >
      {{ [node.ownerTag, node.departmentTag].filter(Boolean).join(' | ').slice(0, 28) }}
    </text>

    <!-- Selection indicator -->
    <rect
      v-if="selected"
      :x="-4"
      :y="-4"
      :width="node.width + 8"
      :height="node.height + 8"
      :rx="node.type === 'start' || node.type === 'end' ? 24 : 10"
      fill="none"
      stroke="var(--ff-primary)"
      stroke-width="1"
      stroke-dasharray="4,2"
      pointer-events="none"
    />

    <!-- Verification highlight -->
    <rect
      v-if="highlighted"
      :x="-6"
      :y="-6"
      :width="node.width + 12"
      :height="node.height + 12"
      :rx="node.type === 'start' || node.type === 'end' ? 26 : 12"
      fill="rgba(34, 197, 94, 0.15)"
      stroke="#22c55e"
      stroke-width="3"
      pointer-events="none"
    />

    <!-- Connect handles (4 sides) -->
    <circle
      v-if="editable"
      v-for="(pos, i) in [
        { cx: node.width / 2, cy: 0 },
        { cx: node.width, cy: node.height / 2 },
        { cx: node.width / 2, cy: node.height },
        { cx: 0, cy: node.height / 2 },
      ]"
      :key="i"
      :cx="pos.cx"
      :cy="pos.cy"
      r="5"
      fill="var(--ff-primary)"
      fill-opacity="0"
      stroke="var(--ff-primary)"
      stroke-width="1.5"
      stroke-opacity="0"
      class="connect-handle"
      @mousedown.stop="onConnectMouseDown"
    />
  </g>
</template>

<style scoped>
.canvas-node {
  cursor: move;
}

.canvas-node:hover .connect-handle {
  fill-opacity: 0.3;
  stroke-opacity: 1;
}

.connect-handle {
  cursor: crosshair;
  transition: fill-opacity 0.15s, stroke-opacity 0.15s;
}

.connect-handle:hover {
  fill-opacity: 0.6 !important;
  stroke-opacity: 1 !important;
  r: 6;
}
</style>
