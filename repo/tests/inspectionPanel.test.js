import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockGetInspections = vi.fn()
const mockGetResults = vi.fn()

vi.mock('@/services/inspectionService', () => ({
  inspectionService: {
    getInspections: mockGetInspections,
    getResults: mockGetResults,
    createInspection: vi.fn(),
    addResult: vi.fn(),
    completeInspection: vi.fn(),
  },
}))

beforeEach(() => {
  mockGetInspections.mockReset()
  mockGetResults.mockReset()
})

describe('InspectionPanel', () => {
  it('shows readable node names and traceability codes in inspection results', async () => {
    mockGetInspections.mockResolvedValue([
      {
        inspectionId: 'insp-1',
        summary: 'Inspection v3',
        diagramVersionNumber: 3,
        status: 'open',
        createdAt: '2026-04-14T12:00:00.000Z',
      },
    ])
    mockGetResults.mockResolvedValue([
      {
        resultId: 'result-1',
        nodeId: 'node-123456789',
        traceabilityCode: null,
        result: 'pass',
        reviewerName: 'Inspector',
        notes: '',
        timestamp: '2026-04-14T12:05:00.000Z',
      },
      {
        resultId: 'result-2',
        nodeId: 'deleted-node',
        traceabilityCode: null,
        result: 'fail',
        reviewerName: 'Inspector',
        notes: 'Removed later',
        timestamp: '2026-04-14T12:06:00.000Z',
      },
      {
        resultId: 'result-3',
        nodeId: null,
        traceabilityCode: 'MANUAL-001',
        result: 'pass',
        reviewerName: 'Inspector',
        notes: '',
        timestamp: '2026-04-14T12:07:00.000Z',
      },
    ])

    const { default: InspectionPanel } = await import('../src/components/diagrams/InspectionPanel.vue')
    const wrapper = mount(InspectionPanel, {
      props: {
        diagramId: 'diagram-1',
        diagramVersion: 3,
        userId: 'user-1',
        userName: 'Inspector',
        nodes: [
          { nodeId: 'node-123456789', name: 'Start Review', type: 'start', traceabilityCode: 'SOP-001-S1' },
        ],
      },
    })

    await flushPromises()
    await wrapper.get('div[style*="cursor: pointer"]').trigger('click')
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Start Review (SOP-001-S1)')
    expect(text).toContain('Deleted node')
    expect(text).toContain('MANUAL-001')
    expect(text).not.toContain('node-1234')
  })
})
