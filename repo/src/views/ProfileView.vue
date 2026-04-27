<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { useUIStore } from '@/stores/ui'
import { authService } from '@/services/authService'
import { backupService } from '@/services/backupService'
import { exportService } from '@/services/exportService'
import { localComplianceService } from '@/services/localComplianceService'
import { PERSONA_ORDER, getPersonaConfig } from '@/utils/persona'
import TextConfirmModal from '@/components/common/TextConfirmModal.vue'

const router = useRouter()
const auth = useAuthStore()
const prefs = usePreferencesStore()
const ui = useUIStore()
const persona = computed(() => getPersonaConfig(prefs.activePersona))

const profile = ref(null)
const showRealName = ref(false)
const passwordForm = ref({ current: '', newPw: '', confirm: '' })
const pwError = ref('')
const pwLoading = ref(false)

// Backup/restore/delete state
const backupLoading = ref(false)
const restoreLoading = ref(false)
const showDeleteAll = ref(false)
const deletePhrase = ref('')
const deleteError = ref('')
const deleteLoading = ref(false)
const showDeleteStep2 = ref(false)
const complianceState = ref({ auditRetentionNotes: '', updatedAt: null })
const complianceDraft = ref('')
const complianceLoading = ref(false)
const complianceSaving = ref(false)
const showComplianceConfirm = ref(false)

onMounted(async () => {
  profile.value = await authService.getUser(auth.userId)
  complianceLoading.value = true
  try {
    complianceState.value = await localComplianceService.getAuditRetentionNote(auth.userId)
    complianceDraft.value = complianceState.value.auditRetentionNotes || ''
  } finally {
    complianceLoading.value = false
  }
})

function toggleReveal() {
  showRealName.value = !showRealName.value
}

async function updateAccountFlags(updates, successMessage) {
  if (!profile.value) return
  try {
    profile.value = await authService.updateUser(profile.value.userId, updates, auth.userId)
    if (auth.user?.userId === profile.value.userId) {
      auth.user = profile.value
    }
    ui.showToast(successMessage, 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  }
}

async function changePassword() {
  pwError.value = ''
  if (passwordForm.value.newPw.length < 8) {
    pwError.value = 'New password must be at least 8 characters.'
    return
  }
  if (passwordForm.value.newPw !== passwordForm.value.confirm) {
    pwError.value = 'Passwords do not match.'
    return
  }
  pwLoading.value = true
  try {
    await authService.changePassword(auth.userId, passwordForm.value.current, passwordForm.value.newPw)
    ui.showToast('Password changed. Please log in again.', 'success')
    passwordForm.value = { current: '', newPw: '', confirm: '' }
    await auth.logout()
  } catch (e) {
    pwError.value = e.message
  } finally {
    pwLoading.value = false
  }
}

async function handleBackup() {
  backupLoading.value = true
  try {
    const json = await backupService.createBackup()
    const ts = exportService.getTimestampSlug()
    exportService.downloadFile(json, `flowforge-backup-${ts}.json`, 'application/json')
    ui.showToast('Backup downloaded.', 'success')
  } catch (e) {
    ui.showToast(`Backup failed: ${e.message}`, 'error')
  } finally {
    backupLoading.value = false
  }
}

async function handleRestore(event) {
  const file = event.target.files?.[0]
  if (!file) return
  restoreLoading.value = true
  try {
    const result = await backupService.restoreBackup(file, auth.userId)
    ui.showToast(
      `Restore complete. ${result.diagrams} diagram(s) and ${result.users} user account(s) restored. Sign in again to continue.`,
      'success',
      6000
    )
    auth.purge()
    router.push('/login')
  } catch (e) {
    ui.showToast(`Restore failed: ${e.message}`, 'error')
  } finally {
    restoreLoading.value = false
    event.target.value = ''
  }
}

function beginDeleteAll() {
  showDeleteAll.value = true
  showDeleteStep2.value = false
  deletePhrase.value = ''
  deleteError.value = ''
}

function proceedToStep2() {
  showDeleteStep2.value = true
}

async function confirmDeleteAll() {
  deleteError.value = ''
  if (deletePhrase.value !== 'DELETE ALL LOCAL FLOWFORGE DATA') {
    deleteError.value = 'Phrase does not match. Type exactly: DELETE ALL LOCAL FLOWFORGE DATA'
    return
  }
  deleteLoading.value = true
  try {
    await backupService.deleteAllLocalData(deletePhrase.value, auth.userId)
    ui.showToast('All local data deleted.', 'success')
    await auth.logout()
    router.push('/login')
  } catch (e) {
    deleteError.value = e.message
  } finally {
    deleteLoading.value = false
  }
}

function requestComplianceSave() {
  if (!complianceDraft.value.trim()) {
    ui.showToast('Audit retention note is required.', 'error')
    return
  }
  showComplianceConfirm.value = true
}

async function confirmComplianceSave() {
  showComplianceConfirm.value = false
  complianceSaving.value = true
  try {
    complianceState.value = await localComplianceService.saveAuditRetentionNote(
      auth.userId,
      complianceDraft.value,
      auth.userId
    )
    complianceDraft.value = complianceState.value.auditRetentionNotes
    ui.showToast('Audit retention note saved locally.', 'success')
  } catch (e) {
    ui.showToast(e.message, 'error')
  } finally {
    complianceSaving.value = false
  }
}
</script>

<template>
  <div class="page">
    <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 16px">Profile</h1>
    <p class="text-muted text-sm mb-16">{{ persona.editorPrompt }}</p>

    <div v-if="profile" class="card mb-16">
      <div class="card-header">
        <h2>Account Details</h2>
      </div>
      <div style="display: grid; gap: 12px">
        <div>
          <span class="text-muted text-sm">Username</span>
          <div>{{ profile.username }}</div>
        </div>
        <div>
          <span class="text-muted text-sm">Display Name (masked)</span>
          <div>{{ profile.maskedDisplayName }}</div>
        </div>
        <div>
          <span class="text-muted text-sm">Real Name</span>
          <div style="display: flex; gap: 8px; align-items: center">
            <span v-if="showRealName">{{ profile.realName || 'Not set' }}</span>
            <span v-else>{{ profile.maskedDisplayName }}</span>
            <button class="btn btn-sm btn-secondary" @click="toggleReveal">
              {{ showRealName ? 'Hide' : 'Reveal' }}
            </button>
          </div>
        </div>
        <div>
          <span class="text-muted text-sm">Organization</span>
          <div>{{ profile.organization || 'Not set' }}</div>
        </div>
        <div>
          <span class="text-muted text-sm">Persona</span>
          <div style="display: flex; gap: 4px">
            <button
              v-for="p in PERSONA_ORDER"
              :key="p"
              :class="['btn', 'btn-sm', prefs.activePersona === p ? 'btn-primary' : 'btn-secondary']"
              @click="prefs.setPersona(p)"
            >
              {{ getPersonaConfig(p).label }}
            </button>
          </div>
        </div>
        <div>
          <span class="text-muted text-sm">Local Handling Labels</span>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
            <span :class="['badge', profile.isRiskTagged ? 'badge-risk' : 'badge-draft']">
              {{ profile.isRiskTagged ? 'Risk Tagged' : 'No Risk Tag' }}
            </span>
            <span :class="['badge', profile.isBlacklisted ? 'badge-blacklist' : 'badge-draft']">
              {{ profile.isBlacklisted ? 'Blacklist Label' : 'No Blacklist Label' }}
            </span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px">
            <button
              class="btn btn-sm btn-secondary"
              @click="updateAccountFlags({ isRiskTagged: !profile.isRiskTagged }, profile.isRiskTagged ? 'Risk tag removed.' : 'Risk tag applied.')"
            >
              {{ profile.isRiskTagged ? 'Clear Risk Tag' : 'Mark Risky User' }}
            </button>
            <button
              class="btn btn-sm btn-secondary"
              @click="updateAccountFlags({ isBlacklisted: !profile.isBlacklisted }, profile.isBlacklisted ? 'Blacklist label removed.' : 'Blacklist label applied.')"
            >
              {{ profile.isBlacklisted ? 'Clear Blacklist Label' : 'Apply Blacklist Label' }}
            </button>
          </div>
          <p class="text-muted text-sm" style="margin-top: 8px">
            These are local handling labels only. They are not a security boundary.
          </p>
        </div>
        <div>
          <span class="text-muted text-sm">Member Since</span>
          <div>{{ new Date(profile.createdAt).toLocaleDateString() }}</div>
        </div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="card-header">
        <h2>Change Password</h2>
      </div>
      <form @submit.prevent="changePassword" style="max-width: 360px">
        <div class="form-group">
          <label>Current Password</label>
          <input v-model="passwordForm.current" type="password" />
        </div>
        <div class="form-group">
          <label>New Password</label>
          <input v-model="passwordForm.newPw" type="password" placeholder="Min 8 characters" />
        </div>
        <div class="form-group">
          <label>Confirm New Password</label>
          <input v-model="passwordForm.confirm" type="password" />
        </div>
        <p v-if="pwError" class="form-error" style="margin-bottom: 8px">{{ pwError }}</p>
        <button type="submit" class="btn btn-primary" :disabled="pwLoading">
          {{ pwLoading ? 'Changing...' : 'Change Password' }}
        </button>
      </form>
    </div>

    <!-- Data Management section -->
    <div class="card mb-16">
      <div class="card-header">
        <h2>Data Management</h2>
      </div>
        <div style="display: flex; flex-direction: column; gap: 16px">
          <div>
            <div style="font-weight: 500; margin-bottom: 4px">Audit Retention Notes</div>
            <p class="text-muted text-sm" style="margin-bottom: 8px">
              Record local-only audit retention and compliance handling notes for this browser profile.
              Saving requires explicit confirmation and these notes are included in file-based backups.
            </p>
            <div v-if="complianceLoading" class="text-muted text-sm">Loading retention note...</div>
            <template v-else>
              <textarea
                v-model="complianceDraft"
                rows="4"
                placeholder="Example: Retain audit events for 12 months on this kiosk unless a local supervisor approves earlier deletion."
              ></textarea>
              <div class="text-muted text-sm" style="margin-top: 6px">
                Last updated:
                {{ complianceState.updatedAt ? new Date(complianceState.updatedAt).toLocaleString() : 'Not yet saved' }}
              </div>
              <div style="margin-top: 8px">
                <button class="btn btn-secondary" :disabled="complianceSaving" @click="requestComplianceSave">
                  {{ complianceSaving ? 'Saving...' : 'Save Retention Note' }}
                </button>
              </div>
            </template>
          </div>

          <!-- Backup -->
          <div style="border-top: 1px solid var(--ff-border); padding-top: 16px">
            <div style="font-weight: 500; margin-bottom: 4px">Backup</div>
            <p class="text-muted text-sm" style="margin-bottom: 8px">
              Download a complete backup of local accounts, diagrams, inspections, retention notes, and audit data as a JSON file.
            </p>
            <button class="btn btn-secondary" :disabled="backupLoading" @click="handleBackup">
              {{ backupLoading ? 'Generating...' : 'Download Backup' }}
          </button>
        </div>

        <!-- Restore -->
        <div style="border-top: 1px solid var(--ff-border); padding-top: 16px">
          <div style="font-weight: 500; margin-bottom: 4px">Restore</div>
          <p class="text-muted text-sm" style="margin-bottom: 8px">
            Restore from a previously downloaded backup file. This replaces all current data, restores local accounts when present,
            and signs you out so the restored account set can be used cleanly. A safety snapshot is created before restore begins.
          </p>
          <label class="btn btn-secondary" :style="{ opacity: restoreLoading ? 0.5 : 1 }">
            {{ restoreLoading ? 'Restoring...' : 'Choose Backup File' }}
            <input type="file" accept=".json" style="display: none" :disabled="restoreLoading" @change="handleRestore" />
          </label>
        </div>

        <!-- Delete All -->
        <div style="border-top: 1px solid var(--ff-border); padding-top: 16px">
          <div style="font-weight: 500; color: var(--ff-danger); margin-bottom: 4px">Delete All Local Data</div>
          <p class="text-muted text-sm" style="margin-bottom: 8px">
            Permanently delete all diagrams, inspections, snapshots, and audit records from this browser.
            This action cannot be undone. You will be prompted to download a backup first.
          </p>
          <button class="btn btn-danger" @click="beginDeleteAll">Delete All Data</button>
        </div>
      </div>
    </div>

    <!-- Delete All Modal -->
    <div v-if="showDeleteAll" class="modal-overlay" @click.self="showDeleteAll = false">
      <div class="modal">
        <h2 style="color: var(--ff-danger)">Delete All Local Data</h2>

        <div v-if="!showDeleteStep2">
          <p style="margin-bottom: 12px">
            It is strongly recommended to download a backup before proceeding.
          </p>
          <div style="display: flex; gap: 8px; margin-bottom: 16px">
            <button class="btn btn-secondary" :disabled="backupLoading" @click="handleBackup">
              {{ backupLoading ? 'Generating...' : 'Download Backup First' }}
            </button>
          </div>
          <p class="text-muted text-sm" style="margin-bottom: 12px">
            After downloading your backup (or choosing to skip), continue to the confirmation step.
          </p>
        </div>

        <div v-else>
          <p style="margin-bottom: 12px">
            Type the phrase below exactly to confirm permanent deletion:
          </p>
          <p style="font-weight: 700; margin-bottom: 8px; font-family: var(--ff-font-mono); font-size: 13px">
            DELETE ALL LOCAL FLOWFORGE DATA
          </p>
        </div>

        <div class="form-group">
          <input v-model="deletePhrase" type="text" placeholder="Type confirmation phrase" />
        </div>
        <p v-if="deleteError" class="form-error" style="margin-bottom: 8px">{{ deleteError }}</p>

        <div v-if="!showDeleteStep2" class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteAll = false">Cancel</button>
          <button class="btn btn-danger" @click="proceedToStep2">Continue Without Backup</button>
        </div>
        <div v-else class="modal-actions">
          <button class="btn btn-secondary" @click="showDeleteAll = false">Cancel</button>
          <button class="btn btn-danger" :disabled="deleteLoading" @click="confirmDeleteAll">
            {{ deleteLoading ? 'Deleting...' : 'Permanently Delete' }}
          </button>
        </div>
      </div>
    </div>

    <TextConfirmModal
      v-if="showComplianceConfirm"
      title="Save Audit Retention Note"
      message="Confirm this local compliance note. It will be stored only on this device profile and included in backups."
      confirm-phrase="SAVE AUDIT RETENTION NOTE"
      confirm-text="Save Note"
      @confirm="confirmComplianceSave"
      @cancel="showComplianceConfirm = false"
    />
  </div>
</template>
