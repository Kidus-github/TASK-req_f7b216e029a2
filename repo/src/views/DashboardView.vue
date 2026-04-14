<script setup>
import { onMounted, ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDiagramStore } from '@/stores/diagrams'
import { usePreferencesStore } from '@/stores/preferences'
import { useRouter } from 'vue-router'
import { getPersonaConfig } from '@/utils/persona'

const auth = useAuthStore()
const diagrams = useDiagramStore()
const prefs = usePreferencesStore()
const router = useRouter()
const stats = ref({ total: 0, draft: 0, published: 0, retracted: 0 })
const persona = computed(() => getPersonaConfig(prefs.activePersona))

onMounted(async () => {
  await diagrams.loadUserDiagrams(auth.userId)
  await diagrams.loadPublishedDiagrams()
  updateStats()
})

function updateStats() {
  const all = diagrams.diagrams
  stats.value = {
    total: all.length,
    draft: all.filter((d) => d.status === 'draft').length,
    published: all.filter((d) => d.status === 'published').length,
    retracted: all.filter((d) => d.status === 'retracted').length,
  }
}

function openRecent(diagramId) {
  router.push(`/diagrams/${diagramId}`)
}
</script>

<template>
  <div class="page">
    <div class="flex-between mb-16">
      <div>
        <h1 style="font-size: 22px; font-weight: 600; margin: 0">Dashboard</h1>
        <p class="text-muted text-sm">Welcome back, {{ auth.displayName }}</p>
        <p class="text-muted text-sm" style="margin-top: 4px">{{ persona.dashboardPrompt }}</p>
      </div>
      <button class="btn btn-primary" @click="router.push('/diagrams')">My Diagrams</button>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px" class="mb-16">
      <div class="card" style="text-align: center">
        <div style="font-size: 28px; font-weight: 700; color: var(--ff-primary)">{{ stats.total }}</div>
        <div class="text-muted text-sm">Total Diagrams</div>
      </div>
      <div class="card" style="text-align: center">
        <div style="font-size: 28px; font-weight: 700; color: var(--ff-text-secondary)">{{ stats.draft }}</div>
        <div class="text-muted text-sm">Drafts</div>
      </div>
      <div class="card" style="text-align: center">
        <div style="font-size: 28px; font-weight: 700; color: var(--ff-success)">{{ stats.published }}</div>
        <div class="text-muted text-sm">Published</div>
      </div>
      <div class="card" style="text-align: center">
        <div style="font-size: 28px; font-weight: 700; color: var(--ff-warning)">{{ stats.retracted }}</div>
        <div class="text-muted text-sm">Retracted</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Recent Files</h2>
      </div>
      <div v-if="prefs.recentFiles.length === 0" class="empty-state">
        <h3>No recent files</h3>
        <p>Open a diagram to see it here.</p>
      </div>
      <div v-else>
        <div
          v-for="file in prefs.recentFiles.slice(0, 10)"
          :key="file.diagramId"
          style="padding: 8px 0; border-bottom: 1px solid var(--ff-border); cursor: pointer; display: flex; justify-content: space-between; align-items: center"
          @click="openRecent(file.diagramId)"
        >
          <span>{{ file.title }}</span>
          <span class="text-muted text-sm">{{ new Date(file.openedAt).toLocaleDateString() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
