<script setup>
defineProps({
  conflictType: { type: String, default: 'newer_version' },
  concurrentTab: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh', 'ignore', 'duplicate'])
</script>

<template>
  <div v-if="concurrentTab && !conflictType" class="conflict-banner warning">
    This diagram is open in another tab. Changes may be overwritten.
  </div>
  <div v-if="conflictType" class="conflict-banner danger">
    <span v-if="conflictType === 'newer_version'">
      A newer version was saved from another tab.
    </span>
    <span v-else>
      A conflicting version exists.
    </span>
    <div class="banner-actions">
      <button class="btn btn-sm btn-primary" @click="emit('refresh')">Refresh to Latest</button>
      <button class="btn btn-sm btn-secondary" @click="emit('duplicate')">Duplicate My Work</button>
      <button class="btn btn-sm btn-secondary" @click="emit('ignore')">Ignore (60s)</button>
    </div>
  </div>
</template>

<style scoped>
.conflict-banner {
  padding: 8px 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.conflict-banner.warning {
  background: var(--ff-warning-light);
  color: var(--ff-warning);
  border-bottom: 1px solid var(--ff-warning);
}

.conflict-banner.danger {
  background: var(--ff-danger-light);
  color: var(--ff-danger);
  border-bottom: 1px solid var(--ff-danger);
}

.banner-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
</style>
