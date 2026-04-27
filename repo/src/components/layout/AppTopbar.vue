<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { useRouter } from 'vue-router'
import { getPersonaConfig } from '@/utils/persona'

const auth = useAuthStore()
const prefs = usePreferencesStore()
const router = useRouter()
const persona = computed(() => getPersonaConfig(prefs.activePersona))

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

async function handleLock() {
  await auth.lock()
  // Plain /login (no ?locked=1) — explicit Lock click ends the active session
  // visibly and lets the user re-enter via username + password.
  router.push('/login')
}

function toggleTheme() {
  prefs.setTheme(prefs.theme === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <header class="app-topbar">
    <router-link to="/" class="logo">FlowForge</router-link>
    <nav>
      <router-link to="/">Dashboard</router-link>
      <router-link to="/diagrams">Diagrams</router-link>
      <router-link to="/library">Library</router-link>
    </nav>
    <div class="user-section">
      <div class="persona-stack">
        <span :class="['persona-badge', `persona-badge-${persona.badgeTone}`]">{{ persona.label }}</span>
        <span class="persona-caption">{{ persona.editorModeLabel }}</span>
      </div>
      <span v-if="auth.isRiskTagged" class="badge badge-risk">Risk Tagged</span>
      <span v-if="auth.user?.isBlacklisted" class="badge badge-blacklist">Blacklist Label</span>
      <router-link to="/profile" style="color: var(--ff-text); text-decoration: none; font-size: 13px">
        {{ auth.displayName }}
      </router-link>
      <button
        class="btn btn-sm btn-secondary"
        :aria-label="prefs.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleTheme"
      >
        <span aria-hidden="true">{{ prefs.theme === 'dark' ? '☀' : '☾' }}</span>
      </button>
      <button class="btn btn-sm btn-secondary" @click="handleLock">Lock</button>
      <button class="btn btn-sm btn-secondary" @click="handleLogout">Logout</button>
    </div>
  </header>
</template>
