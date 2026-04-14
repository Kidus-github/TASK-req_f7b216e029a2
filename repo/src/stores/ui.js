import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
  const toasts = ref([])
  const activeModal = ref(null)
  const modalProps = ref({})

  let toastCounter = 0

  function showToast(message, type = 'info', duration = 4000) {
    const id = ++toastCounter
    toasts.value.push({ id, message, type, duration })
    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id)
      }, duration)
    }
    return id
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function openModal(name, props = {}) {
    activeModal.value = name
    modalProps.value = props
  }

  function closeModal() {
    activeModal.value = null
    modalProps.value = {}
  }

  return {
    toasts,
    activeModal,
    modalProps,
    showToast,
    dismissToast,
    openModal,
    closeModal,
  }
})
