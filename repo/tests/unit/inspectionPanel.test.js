import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import InspectionPanel from '@/components/diagrams/InspectionPanel.vue'
import { inspectionService } from '@/services/inspectionService'
import { resetDatabase } from './helpers/testHarness'

const DIAGRAM_ID = 'diagram-1'
const USER_ID = 'user-1'

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await flushPromises()
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('waitFor timed out')
}

function findButtonByText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

async function mountPanel(extraProps = {}) {
  const wrapper = mount(InspectionPanel, {
    props: {
      diagramId: DIAGRAM_ID,
      diagramVersion: 3,
      userId: USER_ID,
      userName: 'Inspector',
      nodes: [
        { nodeId: 'node-123456789', name: 'Start Review', type: 'start', traceabilityCode: 'SOP-001-S1' },
        { nodeId: 'node-2', name: 'Verify Input', type: 'action', traceabilityCode: 'SOP-001-S2' },
      ],
      ...extraProps,
    },
  })
  await waitFor(() => !wrapper.text().includes('Loading...'))
  return wrapper
}

function findInspectionRow(wrapper, summary) {
  return wrapper
    .findAll('div')
    .find((d) => d.attributes('style')?.includes('cursor: pointer') && d.text().includes(summary))
}

beforeEach(async () => {
  await resetDatabase()
})

describe('InspectionPanel (integration with real inspectionService)', () => {
  it('shows empty state when no inspections exist in IndexedDB', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.text()).toContain('No inspections yet.')
  })

  it('creates a new inspection through the real service and activates it', async () => {
    const wrapper = await mountPanel()

    await findButtonByText(wrapper, 'New Inspection').trigger('click')
    await waitFor(() => wrapper.text().includes('Add Result'))

    // Active inspection section now visible; summary is rendered
    expect(wrapper.text()).toContain('Inspection v3')

    const persisted = await inspectionService.getInspections(DIAGRAM_ID)
    expect(persisted).toHaveLength(1)
    expect(persisted[0].status).toBe('open')
    expect(persisted[0].diagramVersionNumber).toBe(3)
  })

  it('renders readable node names, traceability codes, and Deleted node / Manual fallbacks', async () => {
    const inspection = await inspectionService.createInspection(DIAGRAM_ID, 3, USER_ID, 'Inspection v3')

    await inspectionService.addResult(inspection.inspectionId, {
      nodeId: 'node-123456789',
      result: 'pass',
      reviewerName: 'Inspector',
      reviewerUserId: USER_ID,
    })
    await inspectionService.addResult(inspection.inspectionId, {
      nodeId: 'deleted-node',
      result: 'fail',
      notes: 'Removed later',
      reviewerName: 'Inspector',
      reviewerUserId: USER_ID,
    })
    await inspectionService.addResult(inspection.inspectionId, {
      traceabilityCode: 'MANUAL-001',
      result: 'pass',
      reviewerName: 'Inspector',
      reviewerUserId: USER_ID,
    })

    const wrapper = await mountPanel()
    await waitFor(() => !!findInspectionRow(wrapper, 'Inspection v3'))

    await findInspectionRow(wrapper, 'Inspection v3').trigger('click')
    // Wait for the results table (not the select option) to have loaded persisted rows
    await waitFor(() => wrapper.text().includes('MANUAL-001'))

    const text = wrapper.text()
    expect(text).toContain('Start Review (SOP-001-S1)')
    expect(text).toContain('Deleted node')
    expect(text).toContain('MANUAL-001')
    // Opaque node ids must not leak through into the results table
    const resultsSection = wrapper.find('table')
    expect(resultsSection.exists()).toBe(true)
    expect(resultsSection.text()).not.toContain('node-1234')
  })

  it('persists a new result via the real service and updates pass/fail counters', async () => {
    const inspection = await inspectionService.createInspection(DIAGRAM_ID, 3, USER_ID, 'Inspection v3')

    const wrapper = await mountPanel()
    await waitFor(() => !!findInspectionRow(wrapper, 'Inspection v3'))
    await findInspectionRow(wrapper, 'Inspection v3').trigger('click')
    await waitFor(() => wrapper.text().includes('Add Result'))

    const nodeSelect = wrapper.find('select')
    await nodeSelect.setValue('node-2')

    await findButtonByText(wrapper, 'Add Result').trigger('click')
    await waitFor(() => wrapper.text().includes('Pass: 1'))

    const stored = await inspectionService.getResults(inspection.inspectionId)
    expect(stored).toHaveLength(1)
    expect(stored[0].nodeId).toBe('node-2')
    expect(stored[0].result).toBe('pass')
  })

  it('surfaces real service validation errors for missing notes on a fail result', async () => {
    const inspection = await inspectionService.createInspection(DIAGRAM_ID, 3, USER_ID, 'Inspection v3')

    const wrapper = await mountPanel()
    await waitFor(() => !!findInspectionRow(wrapper, 'Inspection v3'))
    await findInspectionRow(wrapper, 'Inspection v3').trigger('click')
    await waitFor(() => wrapper.text().includes('Add Result'))

    const selects = wrapper.findAll('select')
    await selects[0].setValue('node-2')
    await selects[1].setValue('fail')

    await findButtonByText(wrapper, 'Add Result').trigger('click')
    await waitFor(() => wrapper.text().includes('Notes are required when result is fail.'))

    const stored = await inspectionService.getResults(inspection.inspectionId)
    expect(stored).toHaveLength(0)
  })

  it('renders Manual label for results that have neither nodeId nor traceabilityCode', async () => {
    // Real service rejects results missing both nodeId+traceabilityCode, so we write a
    // legacy-shaped row directly to the underlying store — the service layer would
    // never produce this today, but the component\'s formatResultNode still handles it.
    const inspection = await inspectionService.createInspection(DIAGRAM_ID, 3, USER_ID, 'Inspection v3')
    const { getDB } = await import('@/db/schema')
    const db = await getDB()
    await db.put('inspectionResults', {
      resultId: 'res-manual-1',
      inspectionId: inspection.inspectionId,
      result: 'pass',
      reviewerName: 'Inspector',
      reviewerUserId: USER_ID,
      createdAt: new Date().toISOString(),
    })

    const wrapper = await mountPanel()
    await waitFor(() => !!findInspectionRow(wrapper, 'Inspection v3'))
    await findInspectionRow(wrapper, 'Inspection v3').trigger('click')
    await waitFor(() => wrapper.find('table').exists())

    expect(wrapper.find('table').text()).toContain('Manual')
  })

  it('falls back to Untitled node when the looked-up node has no name', async () => {
    const inspection = await inspectionService.createInspection(DIAGRAM_ID, 3, USER_ID, 'Inspection v3')
    await inspectionService.addResult(inspection.inspectionId, {
      nodeId: 'node-2',
      result: 'pass',
      reviewerName: 'Inspector',
      reviewerUserId: USER_ID,
    })

    // Override the nameless prop for node-2 on mount
    const wrapper = await mountPanel({
      nodes: [
        { nodeId: 'node-123456789', name: 'Start Review', type: 'start', traceabilityCode: 'SOP-001-S1' },
        { nodeId: 'node-2', name: '', type: 'action', traceabilityCode: '' },
      ],
    })
    await waitFor(() => !!findInspectionRow(wrapper, 'Inspection v3'))
    await findInspectionRow(wrapper, 'Inspection v3').trigger('click')
    await waitFor(() => wrapper.find('table').exists())

    expect(wrapper.find('table').text()).toContain('Untitled node')
  })

  it('completes an inspection end-to-end; status changes in IndexedDB and in the UI', async () => {
    await inspectionService.createInspection(DIAGRAM_ID, 3, USER_ID, 'Inspection v3')

    const wrapper = await mountPanel()
    await waitFor(() => !!findInspectionRow(wrapper, 'Inspection v3'))
    await findInspectionRow(wrapper, 'Inspection v3').trigger('click')
    await waitFor(() => wrapper.text().includes('Complete Inspection'))

    await findButtonByText(wrapper, 'Complete Inspection').trigger('click')
    await waitFor(() => wrapper.text().includes('completed'))

    const persisted = await inspectionService.getInspections(DIAGRAM_ID)
    expect(persisted[0].status).toBe('completed')
  })
})
