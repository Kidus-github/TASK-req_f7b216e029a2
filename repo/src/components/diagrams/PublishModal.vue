<script setup>
import { ref, onMounted } from 'vue'
import { publishService } from '@/services/publishService'

const props = defineProps({
  diagramId: { type: String, required: true },
  isDirty: { type: Boolean, default: false },
})

const emit = defineEmits(['publish', 'close'])

const errors = ref([])
const loading = ref(true)

onMounted(async () => {
  errors.value = await publishService.validateForPublish(props.diagramId)
  if (props.isDirty) {
    errors.value.push({ code: 'UNSAVED', message: 'Current version has unsaved changes. Save before publishing.' })
  }
  loading.value = false
})
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal" style="max-width: 520px">
      <h2>Publish Diagram</h2>

      <div v-if="loading" class="empty-state" style="padding: 16px">Validating...</div>

      <div v-else-if="errors.length > 0">
        <p style="color: var(--ff-danger); font-weight: 500; margin-bottom: 12px">
          Cannot publish. Fix the following issues:
        </p>
        <div style="max-height: 300px; overflow-y: auto">
          <div
            v-for="(err, i) in errors"
            :key="i"
            style="padding: 6px 8px; margin-bottom: 4px; background: var(--ff-danger-light); border-radius: 4px; font-size: 13px; color: var(--ff-danger)"
          >
            {{ err.message }}
          </div>
        </div>
      </div>

      <div v-else>
        <p style="color: var(--ff-success); margin-bottom: 12px">
          All validation checks passed. Ready to publish.
        </p>
        <p class="text-muted text-sm">
          Publishing will make this diagram visible in the Approved Library for all local users.
        </p>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button
          class="btn btn-primary"
          :disabled="loading || errors.length > 0"
          @click="emit('publish')"
        >
          Publish
        </button>
      </div>
    </div>
  </div>
</template>
