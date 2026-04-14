<script setup>
import { computed } from 'vue'

const props = defineProps({
  edge: { type: Object, required: true },
  nodes: { type: Array, required: true },
  selected: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])

const sourceNode = computed(() => props.nodes.find((n) => n.nodeId === props.edge.sourceNodeId))
const targetNode = computed(() => props.nodes.find((n) => n.nodeId === props.edge.targetNodeId))

const sourcePoint = computed(() => {
  const n = sourceNode.value
  if (!n) return { x: 0, y: 0 }
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
})

const targetPoint = computed(() => {
  const n = targetNode.value
  if (!n) return { x: 0, y: 0 }
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
})

// Clip source and target to node edges
const clippedSource = computed(() => clipToNodeBorder(sourceNode.value, targetPoint.value))
const clippedTarget = computed(() => clipToNodeBorder(targetNode.value, sourcePoint.value))

const pathD = computed(() => {
  const s = clippedSource.value
  const t = clippedTarget.value
  if (!s || !t) return ''

  if (props.edge.routingMode === 'curve') {
    const mx = (s.x + t.x) / 2
    const my = (s.y + t.y) / 2
    const dx = Math.abs(t.x - s.x) * 0.3
    return `M ${s.x} ${s.y} C ${s.x + dx} ${s.y}, ${t.x - dx} ${t.y}, ${t.x} ${t.y}`
  }

  // Orthogonal routing
  const mx = (s.x + t.x) / 2
  return `M ${s.x} ${s.y} L ${mx} ${s.y} L ${mx} ${t.y} L ${t.x} ${t.y}`
})

const labelPos = computed(() => {
  const s = clippedSource.value
  const t = clippedTarget.value
  if (!s || !t) return { x: 0, y: 0 }
  return { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 - 8 }
})

function clipToNodeBorder(node, target) {
  if (!node) return null
  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  const dx = target.x - cx
  const dy = target.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const hw = node.width / 2
  const hh = node.height / 2
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  let t
  if (absDx * hh > absDy * hw) {
    t = hw / absDx
  } else {
    t = hh / absDy
  }
  return { x: cx + dx * t, y: cy + dy * t }
}

function onClick(e) {
  e.stopPropagation()
  emit('select', { shiftKey: e.shiftKey })
}
</script>

<template>
  <g class="canvas-edge" @click="onClick">
    <!-- Invisible wider click target -->
    <path
      :d="pathD"
      fill="none"
      stroke="transparent"
      stroke-width="12"
      style="cursor: pointer"
    />
    <!-- Visible edge -->
    <path
      :d="pathD"
      fill="none"
      :stroke="selected ? 'var(--ff-primary)' : 'var(--ff-text-secondary)'"
      :stroke-width="selected ? 2.5 : 1.5"
      :marker-end="edge.arrowed ? 'url(#arrowhead)' : ''"
      pointer-events="none"
    />
    <!-- Label -->
    <text
      v-if="edge.label"
      :x="labelPos.x"
      :y="labelPos.y"
      text-anchor="middle"
      font-size="10"
      fill="var(--ff-text-secondary)"
      pointer-events="none"
      style="background: var(--ff-bg)"
    >
      {{ edge.label }}
    </text>
    <!-- Selection indicator -->
    <circle
      v-if="selected"
      :cx="labelPos.x"
      :cy="labelPos.y + 12"
      r="4"
      fill="var(--ff-primary)"
      pointer-events="none"
    />
  </g>
</template>
