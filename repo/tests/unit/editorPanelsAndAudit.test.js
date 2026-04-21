import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { flushPromises, mount } from '@vue/test-utils'
import VersionPanel from '@/components/diagrams/VersionPanel.vue'
import VerificationPanel from '@/components/diagrams/VerificationPanel.vue'
import PublishModal from '@/components/diagrams/PublishModal.vue'
import RetractModal from '@/components/diagrams/RetractModal.vue'
import ImportModal from '@/components/diagrams/ImportModal.vue'
import HistoryModal from '@/components/diagrams/HistoryModal.vue'
import ConflictBanner from '@/components/diagrams/ConflictBanner.vue'
import { useUIStore } from '@/stores/ui'
import { useHistoryStore } from '@/stores/history'
import { auditService } from '@/services/auditService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { traceabilityService } from '@/services/traceabilityService'
import { versionService } from '@/services/versionService'
import { createTestPinia, createUserSession, resetDatabase } from './helpers/testHarness'

async function mountWithPinia(component, options = {}) {
  const pinia = createTestPinia()
  const wrapper = mount(component, {
    ...options,
    global: {
      plugins: [pinia],
      ...(options.global || {}),
    },
  })
  await flushPromises()
  return { wrapper, pinia }
}

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function createDiagramWithFlow(ownerUserId, title = 'Panel Diagram') {
  const diagram = await diagramService.create({
    title,
    description: `${title} description`,
    ownerUserId,
  })
  const start = await canvasService.addNode(
    diagram.diagramId,
    { type: 'start', name: 'Start', x: 100, y: 120 },
    ownerUserId
  )
  const action = await canvasService.addNode(
    diagram.diagramId,
    { type: 'action', name: 'Review', x: 280, y: 120 },
    ownerUserId
  )
  const end = await canvasService.addNode(
    diagram.diagramId,
    { type: 'end', name: 'End', x: 460, y: 120 },
    ownerUserId
  )
  await canvasService.addEdge(diagram.diagramId, {
    sourceNodeId: start.nodeId,
    targetNodeId: action.nodeId,
    label: 'Begin',
  })
  await canvasService.addEdge(diagram.diagramId, {
    sourceNodeId: action.nodeId,
    targetNodeId: end.nodeId,
    label: 'Finish',
  })
  return { diagram, nodes: [start, action, end] }
}

beforeEach(async () => {
  localStorage.clear()
  await resetDatabase()
})

describe('VersionPanel', () => {
  it('loads snapshots and emits rollback for the selected version', async () => {
    const account = await createUserSession({ username: 'version-user' })
    const { diagram } = await createDiagramWithFlow(account.user.userId, 'Version Diagram')
    await versionService.createSnapshot(diagram.diagramId, 'manual', account.user.userId)

    const { wrapper } = await mountWithPinia(VersionPanel, {
      props: { diagramId: diagram.diagramId },
    })
    await settle()

    expect(wrapper.text()).toContain('Version History')
    expect(wrapper.text()).toContain('Version 2')

    await wrapper.get('.btn.btn-sm.btn-secondary').trigger('click')
    expect(wrapper.emitted('rollback')?.[0]).toEqual([expect.any(String)])
  })

  it('surfaces a real snapshot id that can be restored to recover prior diagram state', async () => {
    const account = await createUserSession({ username: 'version-restore-user' })
    const { diagram } = await createDiagramWithFlow(account.user.userId, 'Restore Baseline')
    const baseline = await versionService.createSnapshot(diagram.diagramId, 'manual', account.user.userId)

    await diagramService.update(diagram.diagramId, { title: 'Restore Mutated' }, account.user.userId)
    await versionService.createSnapshot(diagram.diagramId, 'manual', account.user.userId)

    const { wrapper } = await mountWithPinia(VersionPanel, {
      props: { diagramId: diagram.diagramId },
    })
    await settle()

    const restoreButtons = wrapper.findAll('.btn.btn-sm.btn-secondary')
    expect(restoreButtons).toHaveLength(2)
    await restoreButtons[1].trigger('click')

    const emittedSnapshotId = wrapper.emitted('rollback')?.[0]?.[0]
    expect(emittedSnapshotId).toBe(baseline.snapshot.snapshotId)

    await versionService.rollback(diagram.diagramId, emittedSnapshotId, account.user.userId)
    const restored = await diagramService.getById(diagram.diagramId)
    expect(restored.title).toBe('Restore Baseline')
  })
})

describe('VerificationPanel', () => {
  it('verifies a real traceability code and highlights matching nodes', async () => {
    const account = await createUserSession({ username: 'verify-user' })
    const { diagram, nodes } = await createDiagramWithFlow(account.user.userId, 'Verification Diagram')
    const assignments = await traceabilityService.generateCodes(
      diagram.diagramId,
      nodes.map((node) => node.nodeId),
      account.user.userId
    )

    const { wrapper } = await mountWithPinia(VerificationPanel, {
      props: { diagramId: diagram.diagramId, nodes },
    })
    await settle()

    await wrapper.get('input').setValue(assignments[0].traceabilityCode)
    await wrapper.get('.btn.btn-primary').trigger('click')
    await settle()

    expect(wrapper.text()).toContain('Code matched 1 node(s).')
    expect(wrapper.emitted('highlight')?.at(-1)).toEqual([[assignments[0].nodeId]])
  })

  it('handles invalid codes and highlight-all controls', async () => {
    const account = await createUserSession({ username: 'verify-controls-user' })
    const { diagram, nodes } = await createDiagramWithFlow(account.user.userId, 'Verification Controls Diagram')
    await traceabilityService.generateCodes(
      diagram.diagramId,
      nodes.map((node) => node.nodeId),
      account.user.userId
    )

    const { wrapper } = await mountWithPinia(VerificationPanel, {
      props: { diagramId: diagram.diagramId, nodes },
    })
    await settle()

    await wrapper.get('input').setValue('BAD-CODE')
    await wrapper.get('.btn.btn-primary').trigger('click')
    expect(wrapper.text()).toContain('Invalid code format.')

    await wrapper.get('.btn.btn-sm.btn-secondary').trigger('click')
    expect(wrapper.emitted('highlight')?.at(-1)?.[0].slice().sort()).toEqual(
      nodes.map((node) => node.nodeId).slice().sort()
    )

    const clearButton = wrapper.findAll('button').find((button) => button.text() === 'Clear')
    await clearButton.trigger('click')
    expect(wrapper.emitted('highlight')?.at(-1)).toEqual([[]])
  })
})

describe('PublishModal', () => {
  it('blocks publish for invalid diagrams with visible validation feedback', async () => {
    const account = await createUserSession({ username: 'publish-user' })
    const invalidDiagram = await diagramService.create({
      title: 'Invalid Diagram',
      description: '',
      ownerUserId: account.user.userId,
    })

    let mounted = await mountWithPinia(PublishModal, {
      props: { diagramId: invalidDiagram.diagramId, isDirty: false },
    })
    await settle()
    expect(mounted.wrapper.text()).toContain('Cannot publish. Fix the following issues:')
    expect(mounted.wrapper.get('.btn.btn-primary').attributes('disabled')).toBeDefined()
  })

  it('enables publish and emits publish for a valid persisted diagram', async () => {
    const account = await createUserSession({ username: 'publish-ready-user' })
    const { diagram } = await createDiagramWithFlow(account.user.userId, 'Publish Ready Diagram')

    const { wrapper } = await mountWithPinia(PublishModal, {
      props: { diagramId: diagram.diagramId, isDirty: false },
    })
    await settle()

    expect(wrapper.text()).toContain('All validation checks passed. Ready to publish.')
    const publishButton = wrapper.get('.btn.btn-primary')
    expect(publishButton.attributes('disabled')).toBeUndefined()

    await publishButton.trigger('click')
    expect(wrapper.emitted('publish')).toHaveLength(1)
  })
})

describe('RetractModal', () => {
  it('validates the reason and emits the trimmed retraction text', async () => {
    const { wrapper } = await mountWithPinia(RetractModal)

    await wrapper.get('#retract-reason').setValue('short')
    await wrapper.get('.btn.btn-danger').trigger('click')
    expect(wrapper.text()).toContain('Retraction reason must be at least 10 characters.')

    await wrapper.get('#retract-reason').setValue('  Retraction reason provided  ')
    await wrapper.get('.btn.btn-danger').trigger('click')
    expect(wrapper.emitted('retract')?.[0]).toEqual(['Retraction reason provided'])
  })
})

describe('ImportModal (real importService, real IndexedDB)', () => {
  it('runs a real import that merges duplicate nodes, reports partial_success, and persists the deduped records', async () => {
    const account = await createUserSession({ username: 'import-user' })
    const { diagram } = await createDiagramWithFlow(account.user.userId, 'Import Target')

    // Craft a JSON payload that hits the real importService duplicate-merge path —
    // two nodes with identical (name, type) collapse into one during validation.
    const payload = JSON.stringify({
      nodes: [
        { nodeId: 'imp-a', type: 'action', name: 'Shared Task' },
        { nodeId: 'imp-b', type: 'action', name: 'Shared Task' },
        { nodeId: 'imp-c', type: 'end', name: 'End Step' },
      ],
      edges: [
        { sourceNodeId: 'imp-a', targetNodeId: 'imp-c' },
        { sourceNodeId: 'imp-b', targetNodeId: 'imp-c' },
      ],
    })

    const { wrapper } = await mountWithPinia(ImportModal, {
      props: { diagramId: diagram.diagramId, userId: account.user.userId },
    })
    const ui = useUIStore()

    const fileInput = wrapper.get('input[type="file"]')
    // jsdom rejects File construction with a real body; wrap a plain object that
    // satisfies the real importService's `.name`, `.size`, and `.text()` contract.
    const file = {
      name: 'diagram.json',
      size: payload.length,
      text: () => Promise.resolve(payload),
    }
    Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
    await fileInput.trigger('change')
    await wrapper.get('.modal-actions .btn.btn-primary').trigger('click')

    // Wait for the real service to finish and update the template
    for (let i = 0; i < 60; i++) {
      if (wrapper.text().includes('Status: partial_success')) break
      await flushPromises()
      await new Promise((r) => setTimeout(r, 25))
    }

    expect(wrapper.text()).toContain('Status: partial_success')
    expect(wrapper.text()).toContain('Duplicates removed: 1')
    expect(wrapper.emitted('imported')).toHaveLength(1)
    expect(ui.toasts.at(-1)?.message).toContain('Import completed with warnings.')

    // Open the errors modal; a real validation warning was produced
    await wrapper.get('.btn.btn-sm.btn-secondary').trigger('click')
    expect(wrapper.text()).toContain('Import Errors')

    // IndexedDB actually holds the deduped nodes — the original 3 seeded + 2 imported
    // (one deduped away), and no dangling rows from the failed duplicate.
    const persistedNodes = await canvasService.getNodes(diagram.diagramId)
    expect(persistedNodes.length).toBe(5)
  })

  it('reports failed status with a structured error row when the file is not valid JSON', async () => {
    const account = await createUserSession({ username: 'bad-import-user' })
    const { diagram } = await createDiagramWithFlow(account.user.userId, 'Bad Import Target')

    const { wrapper } = await mountWithPinia(ImportModal, {
      props: { diagramId: diagram.diagramId, userId: account.user.userId },
    })

    const file = { name: 'broken.json', size: 10, text: () => Promise.resolve('not-json') }
    const fileInput = wrapper.get('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
    await fileInput.trigger('change')
    await wrapper.get('.modal-actions .btn.btn-primary').trigger('click')

    for (let i = 0; i < 40; i++) {
      if (wrapper.text().includes('Status: failed')) break
      await flushPromises()
      await new Promise((r) => setTimeout(r, 20))
    }

    expect(wrapper.text()).toContain('Status: failed')
    expect(wrapper.text()).toContain('INVALID_JSON')
  })
})

describe('HistoryModal', () => {
  it('renders history entries and delegates undo and redo to the real store', async () => {
    const undo = vi.fn(async () => {})
    const redo = vi.fn(async () => {})
    const { wrapper } = await mountWithPinia(HistoryModal)
    const history = useHistoryStore()

    history.pushEntry({ label: 'Add node', undo, redo })
    history.pushEntry({ label: 'Connect edge', undo, redo })
    await flushPromises()

    expect(wrapper.text()).toContain('Edit History')
    expect(wrapper.text()).toContain('Add node')
    expect(wrapper.text()).toContain('Connect edge')

    const [undoButton, redoButton] = wrapper.findAll('button')
    await undoButton.trigger('click')
    await redoButton.trigger('click')

    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).toHaveBeenCalledTimes(1)
  })
})

describe('ConflictBanner', () => {
  it('shows concurrent-tab and conflict actions and emits the selected resolution', async () => {
    const { wrapper } = await mountWithPinia(ConflictBanner, {
      props: { concurrentTab: true, conflictType: 'newer_version' },
    })

    expect(wrapper.text()).toContain('A newer version was saved from another tab.')
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')

    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('duplicate')).toHaveLength(1)
    expect(wrapper.emitted('ignore')).toHaveLength(1)
  })

  it('renders the concurrent-tab warning branch when no explicit conflict exists', async () => {
    const { wrapper } = await mountWithPinia(ConflictBanner, {
      props: { concurrentTab: true, conflictType: '' },
    })

    expect(wrapper.text()).toContain('This diagram is open in another tab.')
  })
})

describe('auditService', () => {
  it('stores, filters, orders, and prunes audit events from the real IndexedDB store', async () => {
    const account = await createUserSession({ username: 'audit-user' })

    const created = await auditService.log({
      entityType: 'diagram',
      entityId: 'diagram-1',
      actionType: 'diagram_created',
      afterSummary: { title: 'Audit Diagram' },
      actedByUserId: account.user.userId,
    })
    // Guarantee distinct ISO timestamps so ordering is deterministic across runs.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await auditService.log({
      entityType: 'diagram',
      entityId: 'diagram-1',
      actionType: 'diagram_updated',
      afterSummary: { title: 'Audit Diagram v2' },
      actedByUserId: account.user.userId,
    })

    const byEntity = await auditService.getByEntity('diagram', 'diagram-1')
    const byActor = await auditService.getByActor(account.user.userId)
    const recent = await auditService.getRecent(1)

    expect(created.actionType).toBe('diagram_created')
    expect(byEntity).toHaveLength(2)
    expect(byActor.length).toBeGreaterThanOrEqual(2)
    expect(recent).toHaveLength(1)
    expect(recent[0].actionType).toBe('diagram_updated')
  })

  it('prunes old events beyond the retention cap and returns all persisted records', async () => {
    const { getDB } = await import('@/db/schema')
    const db = await getDB()
    const tx = db.transaction('auditEvents', 'readwrite')
    for (let index = 0; index < 1002; index += 1) {
      await tx.store.put({
        auditEventId: `audit-${index}`,
        entityType: 'system',
        entityId: null,
        actionType: `evt_${index}`,
        beforeSummary: null,
        afterSummary: null,
        actedByUserId: null,
        actedAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
        actedAtOffset: 0,
        reason: null,
      })
    }
    await tx.done

    await auditService.pruneEvents()

    const all = await auditService.getAll()
    expect(all).toHaveLength(1000)
    expect(all.some((entry) => entry.actionType === 'evt_0')).toBe(false)
    expect(all.some((entry) => entry.actionType === 'evt_1001')).toBe(true)
  }, 10000)
})
