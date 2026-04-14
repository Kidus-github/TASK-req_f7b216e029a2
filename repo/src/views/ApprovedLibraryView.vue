<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDiagramStore } from '@/stores/diagrams'
import { usePreferencesStore } from '@/stores/preferences'

const router = useRouter()
const diagrams = useDiagramStore()
const prefs = usePreferencesStore()

onMounted(async () => {
  await diagrams.loadPublishedDiagrams()
})

function openDiagram(d) {
  prefs.addRecentFile(d.diagramId, d.title)
  router.push(`/diagrams/${d.diagramId}`)
}
</script>

<template>
  <div class="page">
    <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 16px">Approved Library</h1>

    <div class="card">
      <div v-if="diagrams.publishedDiagrams.length === 0" class="empty-state">
        <h3>No published diagrams</h3>
        <p>Published SOP diagrams will appear here for all local users.</p>
      </div>
      <div v-else class="table-container">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Published</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in diagrams.publishedDiagrams" :key="d.diagramId">
              <td>
                <span style="font-weight: 500">{{ d.title }}</span>
                <div v-if="d.description" class="text-muted text-sm">{{ d.description.slice(0, 100) }}</div>
              </td>
              <td class="text-muted text-sm">{{ d.publishedAt ? new Date(d.publishedAt).toLocaleString() : '-' }}</td>
              <td>
                <button class="btn btn-sm btn-secondary" @click="openDiagram(d)">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
