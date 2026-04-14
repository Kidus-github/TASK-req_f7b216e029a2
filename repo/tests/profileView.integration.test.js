import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const routerPush = vi.fn()
const showToast = vi.fn()
const authPurge = vi.fn()
const authLogout = vi.fn()
const getUser = vi.fn()
const getAuditRetentionNote = vi.fn()
const saveAuditRetentionNote = vi.fn()
const restoreBackup = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({ push: routerPush }),
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    userId: 'user-1',
    user: { userId: 'user-1' },
    purge: authPurge,
    logout: authLogout,
  }),
}))

vi.mock('@/stores/preferences', () => ({
  usePreferencesStore: () => ({
    activePersona: 'viewer',
    setPersona: vi.fn(),
  }),
}))

vi.mock('@/stores/ui', () => ({
  useUIStore: () => ({
    showToast,
  }),
}))

vi.mock('@/services/authService', () => ({
  authService: {
    getUser,
    changePassword: vi.fn(),
    updateUser: vi.fn(),
  },
}))

vi.mock('@/services/backupService', () => ({
  backupService: {
    createBackup: vi.fn(),
    restoreBackup,
    deleteAllLocalData: vi.fn(),
  },
}))

vi.mock('@/services/exportService', () => ({
  exportService: {
    getTimestampSlug: vi.fn(),
    downloadFile: vi.fn(),
  },
}))

vi.mock('@/services/localComplianceService', () => ({
  localComplianceService: {
    getAuditRetentionNote,
    saveAuditRetentionNote,
  },
}))

beforeEach(() => {
  routerPush.mockReset()
  showToast.mockReset()
  authPurge.mockReset()
  authLogout.mockReset()
  getUser.mockReset()
  getAuditRetentionNote.mockReset()
  saveAuditRetentionNote.mockReset()
  restoreBackup.mockReset()

  getUser.mockResolvedValue({
    userId: 'user-1',
    username: 'profile-user',
    maskedDisplayName: 'P*** U***',
    realName: 'Profile User',
    organization: 'FlowForge',
    isRiskTagged: false,
    isBlacklisted: false,
    createdAt: '2026-04-14T00:00:00.000Z',
  })
  getAuditRetentionNote.mockResolvedValue({
    auditRetentionNotes: 'Retain for 12 months',
    updatedAt: '2026-04-14T10:00:00.000Z',
  })
  saveAuditRetentionNote.mockResolvedValue({
    auditRetentionNotes: 'Updated local note',
    updatedAt: '2026-04-14T11:00:00.000Z',
  })
  restoreBackup.mockResolvedValue({ diagrams: 2, users: 1 })
})

async function mountProfileView() {
  const { default: ProfileView } = await import('../src/views/ProfileView.vue')
  return mount(ProfileView)
}

function findButtonByText(wrapper, text) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) {
    throw new Error(`Button not found: ${text}`)
  }
  return button
}

describe('ProfileView integration', () => {
  it('requires explicit confirmation before saving the audit retention note', async () => {
    const wrapper = await mountProfileView()
    await flushPromises()

    const textarea = wrapper.get('textarea')
    await textarea.setValue('Updated local note')
    await findButtonByText(wrapper, 'Save Retention Note').trigger('click')
    await flushPromises()

    expect(saveAuditRetentionNote).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('SAVE AUDIT RETENTION NOTE')

    const confirmInput = wrapper.get('.modal input')
    await confirmInput.setValue('SAVE AUDIT RETENTION NOTE')
    const actionButtons = wrapper.findAll('.modal-actions button')
    await actionButtons[actionButtons.length - 1].trigger('click')
    await flushPromises()

    expect(saveAuditRetentionNote).toHaveBeenCalledWith('user-1', 'Updated local note', 'user-1')
    expect(showToast).toHaveBeenCalledWith('Audit retention note saved locally.', 'success')
  })

  it('purges auth state and redirects to login after restore completes', async () => {
    const wrapper = await mountProfileView()
    await flushPromises()

    const fileInput = wrapper.get('input[type="file"]')
    const restoreFile = new File(['{}'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [restoreFile],
      configurable: true,
    })
    await fileInput.trigger('change')
    await flushPromises()

    expect(restoreBackup).toHaveBeenCalledWith(restoreFile, 'user-1')
    expect(authPurge).toHaveBeenCalled()
    expect(routerPush).toHaveBeenCalledWith('/login')
    expect(showToast).toHaveBeenCalledWith(
      'Restore complete. 2 diagram(s) and 1 user account(s) restored. Sign in again to continue.',
      'success',
      6000
    )
  })
})
