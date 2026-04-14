import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetTabId = vi.fn(() => 'local-tab')
const mockNotifyDiagramOpened = vi.fn()
const mockNotifyDiagramClosed = vi.fn()
const mockCheckConflict = vi.fn()
const mockDestroy = vi.fn()
const mockInit = vi.fn()
let messageHandler = null

vi.mock('@/composables/useAutosave', () => ({
  getTabId: mockGetTabId,
}))

vi.mock('@/services/concurrencyService', () => ({
  concurrencyService: {
    init: mockInit,
    destroy: mockDestroy,
    notifyDiagramOpened: mockNotifyDiagramOpened,
    notifyDiagramClosed: mockNotifyDiagramClosed,
    checkConflict: mockCheckConflict,
    onMessage: vi.fn((callback) => {
      messageHandler = callback
      return vi.fn()
    }),
  },
}))

beforeEach(() => {
  messageHandler = null
  mockGetTabId.mockClear()
  mockNotifyDiagramOpened.mockClear()
  mockNotifyDiagramClosed.mockClear()
  mockCheckConflict.mockReset()
  mockDestroy.mockClear()
  mockInit.mockClear()
})

describe('useConcurrency', () => {
  it('flags concurrent tabs and saved-version conflicts from other tabs', async () => {
    mockCheckConflict.mockReturnValue('newer_version')

    const { useConcurrency } = await import('../src/composables/useConcurrency.js')
    const diagramStore = {
      currentDiagram: {
        diagramId: 'diagram-1',
        currentVersionNumber: 2,
        currentRevisionHash: 'local-hash',
      },
      openDiagram: vi.fn(),
    }
    const uiStore = { showToast: vi.fn() }

    const concurrency = useConcurrency(diagramStore, uiStore)
    concurrency.init('diagram-1')

    expect(mockNotifyDiagramOpened).toHaveBeenCalledWith('diagram-1', 'local-tab')

    messageHandler({
      type: 'diagram_opened',
      diagramId: 'diagram-1',
      tabId: 'remote-tab',
    })
    expect(concurrency.concurrentTabWarning.value).toBe(true)

    messageHandler({
      type: 'diagram_saved',
      diagramId: 'diagram-1',
      versionNumber: 3,
      revisionHash: 'remote-hash',
      tabId: 'remote-tab',
    })
    expect(mockCheckConflict).toHaveBeenCalledWith(2, 'local-hash', 3, 'remote-hash')
    expect(concurrency.conflictState.value).toEqual({
      type: 'newer_version',
      remoteVersion: 3,
      remoteHash: 'remote-hash',
    })

    messageHandler({
      type: 'diagram_closed',
      diagramId: 'diagram-1',
      tabId: 'remote-tab',
    })
    expect(concurrency.concurrentTabWarning.value).toBe(false)
  })
})
