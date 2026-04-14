<script setup>
const nodeTypes = [
  { type: 'start', label: 'Start', color: '#22c55e', desc: 'Entry point' },
  { type: 'end', label: 'End', color: '#ef4444', desc: 'Exit point' },
  { type: 'decision', label: 'Decision', color: '#f59e0b', desc: 'Branch logic' },
  { type: 'action', label: 'Action', color: '#3b82f6', desc: 'Process step' },
  { type: 'note', label: 'Note', color: '#8b5cf6', desc: 'Annotation' },
]

function onDragStart(e, type) {
  e.dataTransfer.setData('node-type', type)
  e.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <div class="node-library">
    <div class="lib-header">Node Library</div>
    <div class="lib-hint">Drag onto canvas</div>
    <div class="lib-nodes">
      <div
        v-for="nt in nodeTypes"
        :key="nt.type"
        class="lib-node"
        draggable="true"
        @dragstart="(e) => onDragStart(e, nt.type)"
      >
        <div class="lib-node-color" :style="{ background: nt.color }"></div>
        <div class="lib-node-info">
          <div class="lib-node-label">{{ nt.label }}</div>
          <div class="lib-node-desc">{{ nt.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-library {
  padding: 12px;
  height: 100%;
  overflow-y: auto;
}

.lib-header {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}

.lib-hint {
  color: var(--ff-text-muted);
  font-size: 11px;
  margin-bottom: 12px;
}

.lib-nodes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lib-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--ff-border);
  border-radius: 6px;
  background: var(--ff-bg);
  cursor: grab;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.lib-node:hover {
  border-color: var(--ff-primary);
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.15);
}

.lib-node:active {
  cursor: grabbing;
}

.lib-node-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.lib-node-label {
  font-size: 13px;
  font-weight: 500;
}

.lib-node-desc {
  font-size: 10px;
  color: var(--ff-text-muted);
}
</style>
