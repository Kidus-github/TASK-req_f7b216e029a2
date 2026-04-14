<script setup>
import { ref } from 'vue'

const emit = defineEmits(['retract', 'close'])
const reason = ref('')
const error = ref('')

function submit() {
  if (reason.value.trim().length < 10) {
    error.value = 'Retraction reason must be at least 10 characters.'
    return
  }
  emit('retract', reason.value.trim())
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <h2>Retract / Unpublish</h2>
      <p class="text-muted" style="margin-bottom: 12px">
        This will remove the diagram from the Approved Library.
      </p>
      <div class="form-group">
        <label for="retract-reason">Reason (required, min 10 characters)</label>
        <textarea
          id="retract-reason"
          v-model="reason"
          rows="3"
          placeholder="Explain why this diagram is being retracted..."
        ></textarea>
      </div>
      <p v-if="error" class="form-error">{{ error }}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button class="btn btn-danger" @click="submit">Retract</button>
      </div>
    </div>
  </div>
</template>
