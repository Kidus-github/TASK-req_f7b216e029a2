import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ImportModal from '@/components/diagrams/ImportModal.vue'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { useUIStore } from '@/stores/ui'
import { resetDatabase } from './helpers/testHarness'

// jsdom File object lacks .text(); this small wrapper mirrors the File shape
// the real importService consumes. No service behavior is mocked.
function makeFile(content, name = 'import.json') {
  return {
    name,
    size: content.length,
    text: () => Promise.resolve(content),
  }
}

function makeExplodingFile(message = 'simulated file metadata failure') {
  return {
    get name() {
      throw new Error(message)
    },
    size: 1,
    text: () => Promise.resolve('{}'),
  }
}

async function mountModal(diagramId, userId = 'user-1') {
  const wrapper = mount(ImportModal, {
    props: { diagramId, userId },
  })
  return wrapper
}

async function injectFile(wrapper, file) {
  // jsdom intentionally does not permit constructing HTMLInputElement.files directly,
  // so we override the accessor for this one element and fire the change event the
  // component already listens for. Browser primitive only — not a service mock.
  const input = wrapper.find('input[type="file"]').element
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await wrapper.find('input[type="file"]').trigger('change')
}

async function waitFor(predicate, timeoutMs = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await flushPromises()
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('waitFor timed out')
}

async function runImport(wrapper) {
  const importBtn = wrapper.findAll('button').find((b) => b.text() === 'Import')
  await importBtn.trigger('click')
  await waitFor(() => !wrapper.text().includes('Importing...'))
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await resetDatabase()
})

describe('ImportModal (integration with real importService)', () => {
  it('writes nodes and edges to IndexedDB on a successful import and shows success toast', async () => {
    const diagram = await diagramService.create({ title: 'Import target', ownerUserId: 'user-1' })
    const wrapper = await mountModal(diagram.diagramId)

    const payload = JSON.stringify({
      nodes: [
        { nodeId: 'n1', type: 'start', name: 'Start' },
        { nodeId: 'n2', type: 'end', name: 'End' },
      ],
      edges: [{ sourceNodeId: 'n1', targetNodeId: 'n2' }],
    })
    await injectFile(wrapper, makeFile(payload, 'import.json'))
    await runImport(wrapper)

    const ui = useUIStore()
    expect(ui.toasts.some((t) => t.message === 'Import completed successfully.' && t.type === 'success')).toBe(true)

    const persistedNodes = await canvasService.getNodes(diagram.diagramId)
    const persistedEdges = await canvasService.getEdges(diagram.diagramId)
    expect(persistedNodes).toHaveLength(2)
    expect(persistedEdges).toHaveLength(1)

    expect(wrapper.emitted('imported')).toBeTruthy()
  })

  it('renders real service errors and opens the errors modal on invalid JSON', async () => {
    const diagram = await diagramService.create({ title: 'Import target', ownerUserId: 'user-1' })
    const wrapper = await mountModal(diagram.diagramId)

    await injectFile(wrapper, makeFile('not-a-json-file', 'bad.json'))
    await runImport(wrapper)

    expect(wrapper.text()).toContain('Status: failed')
    expect(wrapper.text()).toContain('Import Errors')
    expect(wrapper.text()).toContain('INVALID_JSON')

    const nodes = await canvasService.getNodes(diagram.diagramId)
    expect(nodes).toHaveLength(0)
  })

  it('shows partial_success warning for duplicate-merged imports and still commits deduped records', async () => {
    const diagram = await diagramService.create({ title: 'Dedup target', ownerUserId: 'user-1' })
    const wrapper = await mountModal(diagram.diagramId)

    const payload = JSON.stringify({
      nodes: [
        { nodeId: 'a', type: 'action', name: 'Task' },
        { nodeId: 'b', type: 'action', name: 'Task' }, // duplicate name+type
        { nodeId: 'c', type: 'end', name: 'End' },
      ],
      edges: [
        { sourceNodeId: 'a', targetNodeId: 'c' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
      ],
    })
    await injectFile(wrapper, makeFile(payload, 'dupes.json'))
    await runImport(wrapper)

    expect(wrapper.text()).toContain('Status: partial_success')
    expect(wrapper.text()).toContain('Duplicates removed: 1')

    const ui = useUIStore()
    expect(ui.toasts.some((t) => t.type === 'warning')).toBe(true)
    expect(wrapper.emitted('imported')).toBeTruthy()

    const nodes = await canvasService.getNodes(diagram.diagramId)
    expect(nodes).toHaveLength(2) // duplicate merged
  })

  it('surfaces IMPORT_DANGLING_EDGE error with full path and field context', async () => {
    const diagram = await diagramService.create({ title: 'Dangling', ownerUserId: 'user-1' })
    const wrapper = await mountModal(diagram.diagramId)

    const payload = JSON.stringify({
      nodes: [{ nodeId: 'n1', type: 'start', name: 'S' }],
      edges: [{ sourceNodeId: 'n1', targetNodeId: 'missing' }],
    })
    await injectFile(wrapper, makeFile(payload, 'dangling.json'))
    await runImport(wrapper)

    expect(wrapper.text()).toContain('IMPORT_DANGLING_EDGE')
    expect(wrapper.text()).toContain('$.edges[0].targetNodeId')
    expect(wrapper.text()).toContain('targetNodeId')
  })

  it('emits close when the overlay backdrop is clicked', async () => {
    const diagram = await diagramService.create({ title: 'Close test', ownerUserId: 'user-1' })
    const wrapper = await mountModal(diagram.diagramId)

    await wrapper.find('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('keeps the Import button disabled until a file is chosen', async () => {
    const diagram = await diagramService.create({ title: 'Disabled test', ownerUserId: 'user-1' })
    const wrapper = await mountModal(diagram.diagramId)

    const importBtn = wrapper.findAll('button').find((b) => b.text() === 'Import')
    expect(importBtn.attributes('disabled')).toBeDefined()
  })

  it('catches unexpected runImport exceptions and surfaces them as an error toast and inline error row', async () => {
    // Injects a real exception path through importService.importJSON so the component\'s
    // outer try/catch (not the structured-failure branch) fires — the only way to
    // reach that code is for importJSON to throw, not return a failed job.
    const { importService } = await import('@/services/importService')
    const originalRun = importService.importJSON
    importService.importJSON = async () => { throw new Error('simulated transport failure') }

    try {
      const diagram = await diagramService.create({ title: 'Catch path', ownerUserId: 'user-1' })
      const wrapper = await mountModal(diagram.diagramId)
      await injectFile(wrapper, makeFile('{"nodes":[],"edges":[]}', 'catch.json'))
      await runImport(wrapper)

      const ui = useUIStore()
      expect(ui.toasts.some((t) => t.message.includes('Import error: simulated transport failure'))).toBe(true)
    } finally {
      importService.importJSON = originalRun
    }
  })

  it('surfaces a real runtime failure from malformed file metadata without overriding the import service', async () => {
    const diagram = await diagramService.create({ title: 'Real catch path', ownerUserId: 'user-1' })
    const wrapper = await mountModal(diagram.diagramId)
    await injectFile(wrapper, makeExplodingFile())
    await runImport(wrapper)

    const ui = useUIStore()
    expect(ui.toasts.some((t) => t.message.includes('Import error: simulated file metadata failure'))).toBe(true)
    expect(wrapper.text()).toContain('View 1 Error(s) / Warning(s)')
  })
})
