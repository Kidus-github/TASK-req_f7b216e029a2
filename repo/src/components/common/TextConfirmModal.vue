<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  message: { type: String, required: true },
  confirmPhrase: { type: String, required: true },
  confirmText: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm', 'cancel'])
const input = ref('')
const error = ref('')

watch(
  () => props.confirmPhrase,
  () => {
    input.value = ''
    error.value = ''
  },
  { immediate: true }
)

function submit() {
  error.value = ''
  if (input.value !== props.confirmPhrase) {
    error.value = `Type exactly: ${props.confirmPhrase}`
    return
  }
  emit('confirm')
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal">
      <h2 :style="{ color: props.danger ? 'var(--ff-danger)' : 'var(--ff-text)' }">{{ props.title }}</h2>
      <p style="margin-bottom: 12px">{{ props.message }}</p>
      <p style="font-weight: 700; margin-bottom: 8px; font-family: var(--ff-font-mono); font-size: 13px">
        {{ props.confirmPhrase }}
      </p>
      <div class="form-group">
        <input v-model="input" type="text" placeholder="Type confirmation phrase" />
      </div>
      <p v-if="error" class="form-error" style="margin-bottom: 8px">{{ error }}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" @click="emit('cancel')">Cancel</button>
        <button :class="['btn', props.danger ? 'btn-danger' : 'btn-primary']" @click="submit">
          {{ props.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
