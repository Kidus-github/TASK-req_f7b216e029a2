import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { authService } from '@/services/authService'
import { localComplianceService } from '@/services/localComplianceService'
import { backupService } from '@/services/backupService'
import ProfileView from '@/views/ProfileView.vue'

async function clearDB() {
  const { getDB } = await import('@/db/schema')
  const db = await getDB()
  for (const name of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(name, 'readwrite')
    await tx.store.clear()
    await tx.done
  }
}

async function makeSignedInProfileMount({ username = 'profile-user' } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const user = await authService.createUser({
    username,
    password: 'StrongPass123',
    realName: 'Profile User',
    organization: 'FlowForge',
  })

  const auth = useAuthStore()
  auth.user = user
  auth.session = { sessionId: `${username}-session` }
  auth.encryptionKey = 'fake-key'

  const prefs = usePreferencesStore()
  prefs.setPersona('author')

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Dash</div>' } },
      { path: '/login', component: { template: '<div>Login</div>' } },
      { path: '/profile', component: ProfileView },
    ],
  })
  await router.push('/profile')
  await router.isReady()

  const wrapper = mount(ProfileView, {
    global: { plugins: [pinia, router] },
  })

  return { wrapper, pinia, router, user }
}

function findButtonByText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

async function waitFor(predicate, { timeoutMs = 3000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
}

async function waitForAccountDetails(wrapper) {
  await waitFor(() =>
    wrapper.text().includes('Account Details') && !wrapper.text().includes('Loading retention note...')
  )
}

beforeEach(async () => {
  localStorage.clear()
  await clearDB()
})

describe('ProfileView integration (real Pinia + router + real services)', () => {
  it('renders seeded account details from the real auth service', async () => {
    const { wrapper, user } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    expect(wrapper.text()).toContain('Profile')
    expect(wrapper.text()).toContain('profile-user')
    expect(wrapper.text()).toContain(user.maskedDisplayName)
    expect(wrapper.text()).toContain('FlowForge')
    expect(wrapper.text()).toContain('Change Password')
    expect(wrapper.text()).toContain('Audit Retention Notes')
  })

  it('reveals and hides the real name using the real component state', async () => {
    const { wrapper } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    const reveal = findButtonByText(wrapper, 'Reveal')
    expect(reveal).toBeTruthy()
    await reveal.trigger('click')
    expect(wrapper.text()).toContain('Profile User')

    const hide = findButtonByText(wrapper, 'Hide')
    expect(hide).toBeTruthy()
    await hide.trigger('click')
    expect(wrapper.text()).not.toContain('Profile User')
  })

  it('switches the active persona through the real preferences store, persists to localStorage, and updates UI', async () => {
    const { wrapper, pinia } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    await findButtonByText(wrapper, 'Viewer').trigger('click')
    const prefs = usePreferencesStore(pinia)
    expect(prefs.activePersona).toBe('viewer')
    // Real localStorage persistence under the prefs watcher
    expect(JSON.parse(localStorage.getItem('ff_active_persona'))).toBe('viewer')

    await findButtonByText(wrapper, 'Reviewer').trigger('click')
    expect(prefs.activePersona).toBe('reviewer')
    expect(JSON.parse(localStorage.getItem('ff_active_persona'))).toBe('reviewer')

    // UI reflects the persona — the prompt text changes
    expect(wrapper.text()).toMatch(/review|Reviewer/i)
  })

  it('toggles risk-tag flag through the real auth service and persists it to IndexedDB', async () => {
    const { wrapper, user } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    const markBtn = findButtonByText(wrapper, 'Mark Risky User')
    expect(markBtn).toBeTruthy()
    await markBtn.trigger('click')
    await waitFor(() => wrapper.text().includes('Clear Risk Tag'))

    const persisted = await authService.getUser(user.userId)
    expect(persisted.isRiskTagged).toBe(true)
    expect(wrapper.text()).toContain('Risk Tagged')
    expect(findButtonByText(wrapper, 'Clear Risk Tag')).toBeTruthy()

    // Toggle back — persists the cleared state
    await findButtonByText(wrapper, 'Clear Risk Tag').trigger('click')
    await waitFor(() => wrapper.text().includes('Mark Risky User'))
    const persistedAfter = await authService.getUser(user.userId)
    expect(persistedAfter.isRiskTagged).toBe(false)
  })

  it('toggles blacklist label through the real auth service', async () => {
    const { wrapper, user } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    await findButtonByText(wrapper, 'Apply Blacklist Label').trigger('click')
    await waitFor(() => wrapper.text().includes('Clear Blacklist Label'))

    const persisted = await authService.getUser(user.userId)
    expect(persisted.isBlacklisted).toBe(true)
    expect(wrapper.text()).toContain('Blacklist Label')
  })

  it('saves an audit retention note through the real text-confirm flow and service, survives remount', async () => {
    const { wrapper, user } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    const textarea = wrapper.get('textarea')
    await textarea.setValue('Retain for 12 months (local policy).')

    await findButtonByText(wrapper, 'Save Retention Note').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('SAVE AUDIT RETENTION NOTE')
    const confirmInput = wrapper.get('.modal input')
    await confirmInput.setValue('SAVE AUDIT RETENTION NOTE')
    const actionButtons = wrapper.findAll('.modal-actions button')
    await actionButtons[actionButtons.length - 1].trigger('click')
    await flushPromises()

    const saved = await localComplianceService.getAuditRetentionNote(user.userId)
    expect(saved.auditRetentionNotes).toBe('Retain for 12 months (local policy).')
    expect(saved.updatedByUserId).toBe(user.userId)

    // Remount — the note should reload from IndexedDB
    wrapper.unmount()
    const pinia2 = createPinia()
    setActivePinia(pinia2)
    const auth = useAuthStore()
    auth.user = user
    auth.session = { sessionId: 'remount-session' }
    const router2 = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/profile', component: ProfileView }],
    })
    await router2.push('/profile')
    await router2.isReady()
    const wrapper2 = mount(ProfileView, { global: { plugins: [pinia2, router2] } })
    await waitForAccountDetails(wrapper2)
    expect(wrapper2.get('textarea').element.value).toBe('Retain for 12 months (local policy).')
    wrapper2.unmount()
  })

  it('blocks retention note save when the confirmation phrase does not match', async () => {
    const { wrapper, user } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    await wrapper.get('textarea').setValue('Anything')
    await findButtonByText(wrapper, 'Save Retention Note').trigger('click')
    await flushPromises()

    const confirmInput = wrapper.get('.modal input')
    await confirmInput.setValue('WRONG PHRASE')
    const actionButtons = wrapper.findAll('.modal-actions button')
    await actionButtons[actionButtons.length - 1].trigger('click')
    await flushPromises()

    const saved = await localComplianceService.getAuditRetentionNote(user.userId)
    expect(saved.auditRetentionNotes).toBe('')
  })

  it('delete-all flow uses a two-step confirmation and blocks on a bad phrase', async () => {
    const { wrapper } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    await findButtonByText(wrapper, 'Delete All Data').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('It is strongly recommended to download a backup')
    await findButtonByText(wrapper, 'Continue Without Backup').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('DELETE ALL LOCAL FLOWFORGE DATA')
    const phraseInput = wrapper.findAll('input').find((i) => i.attributes('placeholder') === 'Type confirmation phrase')
    expect(phraseInput).toBeTruthy()
    await phraseInput.setValue('WRONG PHRASE')
    await findButtonByText(wrapper, 'Permanently Delete').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Phrase does not match')
  })

  it('refuses to open the confirm modal when the retention draft is empty', async () => {
    const { wrapper } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    await wrapper.get('textarea').setValue('   ')
    await findButtonByText(wrapper, 'Save Retention Note').trigger('click')
    await flushPromises()

    expect(wrapper.find('.modal').exists()).toBe(false)
  })

  it('completes the delete-all flow, wipes IndexedDB, and redirects to /login', async () => {
    const { wrapper, router, user } = await makeSignedInProfileMount()
    await waitForAccountDetails(wrapper)

    // Plant some data we can later assert was removed
    const { getDB } = await import('@/db/schema')
    const db = await getDB()
    // The user we created exists and a compliance note was seeded on-mount
    const before = await db.count('users')
    expect(before).toBeGreaterThan(0)

    await findButtonByText(wrapper, 'Delete All Data').trigger('click')
    await flushPromises()
    await findButtonByText(wrapper, 'Continue Without Backup').trigger('click')
    await flushPromises()

    const phraseInput = wrapper.findAll('input').find((i) => i.attributes('placeholder') === 'Type confirmation phrase')
    await phraseInput.setValue('DELETE ALL LOCAL FLOWFORGE DATA')
    await findButtonByText(wrapper, 'Permanently Delete').trigger('click')

    await waitFor(() => router.currentRoute.value.path === '/login')
    expect(router.currentRoute.value.path).toBe('/login')

    const usersAfter = await db.count('users')
    expect(usersAfter).toBe(0)
  })

  it('rejects short new passwords at the UI layer — and the original password still works via the real auth service', async () => {
    const { wrapper, user } = await makeSignedInProfileMount({ username: 'short-pw-user' })
    await waitForAccountDetails(wrapper)

    const pwInputs = wrapper.findAll('input[type="password"]')
    await pwInputs[0].setValue('StrongPass123')
    await pwInputs[1].setValue('short')
    await pwInputs[2].setValue('short')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('New password must be at least 8 characters.')

    // Proof the password was NOT changed: the original credentials still authenticate.
    const login = await authService.login('short-pw-user', 'StrongPass123')
    expect(login.user.userId).toBe(user.userId)
  })

  it('rejects mismatched new/confirm passwords at the UI layer — original password still works', async () => {
    const { wrapper, user } = await makeSignedInProfileMount({ username: 'mismatch-pw-user' })
    await waitForAccountDetails(wrapper)

    const pwInputs = wrapper.findAll('input[type="password"]')
    await pwInputs[0].setValue('StrongPass123')
    await pwInputs[1].setValue('NewPassword123')
    await pwInputs[2].setValue('NewPasswordDifferent')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('Passwords do not match.')

    const login = await authService.login('mismatch-pw-user', 'StrongPass123')
    expect(login.user.userId).toBe(user.userId)
    // And the candidate new password does NOT authenticate
    await expect(authService.login('mismatch-pw-user', 'NewPassword123')).rejects.toThrow()
  })

  it('actually changes the password through the real auth service and logs out', async () => {
    const { wrapper, pinia, user, router } = await makeSignedInProfileMount({ username: 'pw-change-user' })
    await waitForAccountDetails(wrapper)

    const pwInputs = wrapper.findAll('input[type="password"]')
    await pwInputs[0].setValue('StrongPass123')
    await pwInputs[1].setValue('NewSecret9988')
    await pwInputs[2].setValue('NewSecret9988')
    await wrapper.get('form').trigger('submit.prevent')

    // Wait for auth.logout() to have run — the store is reset and the view redirected
    await waitFor(() => {
      const auth = useAuthStore(pinia)
      return !auth.isAuthenticated
    }, { timeoutMs: 5000 })

    // The new password now works against the real auth service
    const loginResult = await authService.login('pw-change-user', 'NewSecret9988')
    expect(loginResult.user.userId).toBe(user.userId)
  })

  it('downloads a real backup blob containing the current user — no service spy', async () => {
    const { wrapper, user } = await makeSignedInProfileMount({ username: 'backup-user' })
    await waitForAccountDetails(wrapper)

    // Capture the Blob created by the real backupService + exportService.downloadFile
    // pipeline. jsdom's native Blob does not expose its content through .text(), so
    // we also swap in a CapturingBlob shim that retains the constructor parts.
    const captured = []
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    const OriginalBlob = globalThis.Blob
    class CapturingBlob {
      constructor(parts, options) {
        this.parts = parts
        this.type = options?.type || ''
        this._text = (parts || [])
          .map((p) => (typeof p === 'string' ? p : (p?.toString ? p.toString() : '')))
          .join('')
        this.size = this._text.length
      }
      text() { return Promise.resolve(this._text) }
      arrayBuffer() { return Promise.resolve(new TextEncoder().encode(this._text).buffer) }
    }
    globalThis.Blob = CapturingBlob
    URL.createObjectURL = (blob) => {
      captured.push(blob)
      return `blob:test/${captured.length - 1}`
    }
    URL.revokeObjectURL = () => {}

    // Capture the anchor click so we can read the user-facing filename.
    let downloadFilename = null
    const originalAnchor = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function intercepted() {
      if (this.download) downloadFilename = this.download
    }

    try {
      await findButtonByText(wrapper, 'Download Backup').trigger('click')
      await waitFor(() => captured.length > 0)

      expect(captured.length).toBe(1)
      const blob = captured[0]
      expect(blob.type).toBe('application/json')
      const text = await blob.text()
      const parsed = JSON.parse(text)
      // Real backup contents — the seeded user is in the payload
      expect(parsed.users?.some((u) => u.userId === user.userId)).toBe(true)
      expect(parsed.backupVersion).toBe(1)
      expect(typeof parsed.checksum).toBe('string')
      expect(downloadFilename).toMatch(/^flowforge-backup-.*\.json$/)

      // Prove the backup round-trips through the real restore path.
      const restoreFile = { name: downloadFilename, size: text.length, text: () => Promise.resolve(text) }
      // Seed extra state, restore, and confirm the extra diagram was wiped because
      // the backup didn't contain it.
      const { diagramService } = await import('@/services/diagramService')
      await diagramService.create({ title: 'After-Backup Only', ownerUserId: user.userId })
      const before = (await diagramService.getAll()).length
      const result = await backupService.restoreBackup(restoreFile, user.userId)
      expect(['restored_users', 'ownership_remapped']).toContain(result.restoreMode)
      const after = (await diagramService.getAll()).length
      expect(after).toBeLessThan(before) // the post-backup diagram was reverted
    } finally {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      HTMLAnchorElement.prototype.click = originalAnchor
      globalThis.Blob = OriginalBlob
    }
  })
})
