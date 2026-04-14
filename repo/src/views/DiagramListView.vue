<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDiagramStore } from '@/stores/diagrams'
import { usePreferencesStore } from '@/stores/preferences'
import { useUIStore } from '@/stores/ui'
import { canvasService } from '@/services/canvasService'
import { templateService } from '@/services/templateService'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { getPersonaConfig } from '@/utils/persona'

const router = useRouter()
const auth = useAuthStore()
const diagrams = useDiagramStore()
const prefs = usePreferencesStore()
const ui = useUIStore()
const persona = computed(() => getPersonaConfig(prefs.activePersona))

const showCreateModal = ref(false)
const createMode = ref('blank') // 'blank' | 'template'
const selectedTemplate = ref(null)
const newTitle = ref('')
const newDescription = ref('')
const createError = ref('')
const createLoading = ref(false)

const templates = templateService.getAll()
const deleteTarget = ref(null)

onMounted(async () => {
  await diagrams.loadUserDiagrams(auth.userId)
})

function openCreateModal() {
  if (!persona.value.canCreateDiagram) {
    ui.showToast('Switch to Author persona to create diagrams.', 'warning')
    return
  }
  showCreateModal.value = true
  createMode.value = 'blank'
  selectedTemplate.value = null
  newTitle.value = ''
  newDescription.value = ''
  createError.value = ''
}

function selectTemplate(tpl) {
  createMode.value = 'template'
  selectedTemplate.value = tpl
  newTitle.value = tpl.name
  newDescription.value = tpl.description
}

function selectBlank() {
  createMode.value = 'blank'
  selectedTemplate.value = null
  newTitle.value = ''
  newDescription.value = ''
}

async function createDiagram() {
  createError.value = ''
  if (!newTitle.value.trim()) {
    createError.value = 'Title is required.'
    return
  }
  createLoading.value = true
  try {
    const d = await diagrams.createDiagram({
      title: newTitle.value,
      description: newDescription.value,
      ownerUserId: auth.userId,
    })

    // If template selected, populate nodes and edges
    if (createMode.value === 'template' && selectedTemplate.value) {
      const tpl = selectedTemplate.value
      const nodeIdMap = new Map()

      for (let i = 0; i < tpl.nodes.length; i++) {
        const tn = tpl.nodes[i]
        const node = await canvasService.addNode(d.diagramId, {
          type: tn.type,
          name: tn.name,
          x: tn.x ?? 100 + i * 200,
          y: tn.y ?? 100,
        }, auth.userId)
        nodeIdMap.set(i, node.nodeId)
      }

      for (const te of tpl.edges) {
        const srcId = nodeIdMap.get(te.from)
        const tgtId = nodeIdMap.get(te.to)
        if (srcId && tgtId) {
          await canvasService.addEdge(d.diagramId, {
            sourceNodeId: srcId,
            targetNodeId: tgtId,
            label: te.label || '',
          })
        }
      }
    }

    showCreateModal.value = false
    newTitle.value = ''
    newDescription.value = ''
    ui.showToast('Diagram created.', 'success')
    prefs.addRecentFile(d.diagramId, d.title)
    router.push(`/diagrams/${d.diagramId}`)
  } catch (e) {
    createError.value = e.message
  } finally {
    createLoading.value = false
  }
}

function openDiagram(diagramId, title) {
  prefs.addRecentFile(diagramId, title)
  router.push(`/diagrams/${diagramId}`)
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await diagrams.deleteDiagram(deleteTarget.value.diagramId, auth.userId)
    prefs.removeRecentFile(deleteTarget.value.diagramId)
    ui.showToast('Diagram deleted.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
  deleteTarget.value = null
}

function statusBadgeClass(status) {
  return `badge badge-${status}`
}
</script>

<template>
  <div class="page">
    <div class="flex-between mb-16">
      <h1 style="font-size: 22px; font-weight: 600; margin: 0">My Diagrams</h1>
      <button class="btn btn-primary" :disabled="!persona.canCreateDiagram" @click="openCreateModal">
        + New Diagram
      </button>
    </div>
    <p class="text-muted text-sm mb-16">{{ persona.diagramsPrompt }}</p>

    <div class="card">
      <div v-if="diagrams.loading" class="empty-state">Loading...</div>
      <div v-else-if="diagrams.diagrams.length === 0" class="empty-state">
        <h3>No diagrams yet</h3>
        <p>{{ persona.canCreateDiagram ? 'Create your first SOP diagram to get started.' : 'Switch to the Author persona to create a new diagram.' }}</p>
      </div>
      <div v-else class="table-container">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in diagrams.diagrams" :key="d.diagramId">
              <td>
                <a href="#" style="color: var(--ff-primary); text-decoration: none; font-weight: 500"
                  @click.prevent="openDiagram(d.diagramId, d.title)">
                  {{ d.title }}
                </a>
                <div v-if="d.description" class="text-muted text-sm" style="margin-top: 2px">
                  {{ d.description.slice(0, 80) }}{{ d.description.length > 80 ? '...' : '' }}
                </div>
              </td>
              <td><span :class="statusBadgeClass(d.status)">{{ d.status }}</span></td>
              <td class="text-muted text-sm">{{ new Date(d.updatedAt).toLocaleString() }}</td>
              <td>
                <div class="flex gap-8">
                  <button class="btn btn-sm btn-secondary" @click="openDiagram(d.diagramId, d.title)">Open</button>
                  <button v-if="d.status === 'draft' && persona.canDeleteItems" class="btn btn-sm btn-danger" @click="deleteTarget = d">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Modal with blank/template choice -->
    <div v-if="showCreateModal && persona.canCreateDiagram" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal" style="max-width: 560px">
        <h2>New Diagram</h2>

        <!-- Source picker tabs -->
        <div style="display: flex; gap: 4px; margin-bottom: 16px">
          <button :class="['btn', 'btn-sm', createMode === 'blank' ? 'btn-primary' : 'btn-secondary']"
            @click="selectBlank">
            Blank Diagram
          </button>
          <button :class="['btn', 'btn-sm', createMode === 'template' ? 'btn-primary' : 'btn-secondary']"
            @click="createMode = 'template'">
            From Template
          </button>
        </div>

        <!-- Template list -->
        <div v-if="createMode === 'template'" style="margin-bottom: 16px">
          <div v-for="tpl in templates" :key="tpl.id"
            :style="{
              padding: '10px 12px',
              border: '1px solid ' + (selectedTemplate?.id === tpl.id ? 'var(--ff-primary)' : 'var(--ff-border)'),
              borderRadius: '6px',
              marginBottom: '8px',
              cursor: 'pointer',
              background: selectedTemplate?.id === tpl.id ? 'var(--ff-primary-light)' : 'var(--ff-bg)',
            }"
            @click="selectTemplate(tpl)">
            <div style="font-weight: 600; font-size: 14px">{{ tpl.name }}</div>
            <div class="text-muted text-sm">{{ tpl.description }}</div>
            <div class="text-muted text-sm" style="margin-top: 4px">
              {{ tpl.nodes.length }} nodes, {{ tpl.edges.length }} edges
            </div>
          </div>
        </div>

        <form @submit.prevent="createDiagram">
          <div class="form-group">
            <label for="new-title">Title *</label>
            <input id="new-title" v-model="newTitle" type="text" placeholder="SOP diagram title" />
          </div>
          <div class="form-group">
            <label for="new-desc">Description</label>
            <textarea id="new-desc" v-model="newDescription" rows="3" placeholder="Optional description"></textarea>
          </div>
          <p v-if="createError" class="form-error">{{ createError }}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showCreateModal = false">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="createLoading">
              {{ createLoading ? 'Creating...' : (createMode === 'template' && selectedTemplate ? `Create from "${selectedTemplate.name}"` : 'Create Blank') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirm -->
    <ConfirmModal
      v-if="deleteTarget"
      title="Delete Diagram"
      :message="`Delete '${deleteTarget.title}'? This action cannot be undone.`"
      confirm-text="Delete"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
