import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ImportModal from '@/components/diagrams/ImportModal.vue'
import { diagramService } from '@/services/diagramService'
import { useUIStore } from '@/stores/ui'
import { resetDatabase } from './helpers/testHarness'

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

async function waitFor(predicate, timeoutMs = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return
    await flushPromises()
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('waitFor timed out')
}

async function mountModal(diagramId, userId = 'runtime-user') {
  return mount(ImportModal, {
    props: { diagramId, userId },
  })
}

async function injectFile(wrapper, file) {
  const input = wrapper.find('input[type="file"]').element
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await wrapper.find('input[type="file"]').trigger('change')
}

async function runImport(wrapper) {
  await wrapper.findAll('button').find((b) => b.text() === 'Import').trigger('click')
}

beforeEach(async () => {
  setActivePinia(createPinia())
  await resetDatabase()
})

describe('ImportModal runtime-backed failure paths', () => {
  it('surfaces the real FILE_TOO_LARGE validation failure without overriding the import service', async () => {
    const diagram = await diagramService.create({ title: 'TooBig', ownerUserId: 'runtime-user' })
    const wrapper = await mountModal(diagram.diagramId)
    const oversized = {
      name: 'huge.json',
      size: 10 * 1024 * 1024 + 1,
      text: () => Promise.resolve('{"nodes":[],"edges":[]}'),
    }

    await injectFile(wrapper, oversized)
    await runImport(wrapper)
    await waitFor(() => wrapper.text().includes('FILE_TOO_LARGE'))

    expect(wrapper.text()).toContain('Status: failed')
    expect(wrapper.text()).toContain('FILE_TOO_LARGE')
  })

  it('surfaces the real TOO_MANY_RECORDS validation failure without overriding the import service', async () => {
    const diagram = await diagramService.create({ title: 'TooMany', ownerUserId: 'runtime-user' })
    const wrapper = await mountModal(diagram.diagramId)
    const nodes = Array.from({ length: 1001 }, (_, i) => ({
      nodeId: `n-${i}`,
      type: 'action',
      name: `Node ${i}`,
    }))

    await injectFile(wrapper, makeFile(JSON.stringify({ nodes, edges: [] }), 'too-many.json'))
    await runImport(wrapper)
    await waitFor(() => wrapper.text().includes('TOO_MANY_RECORDS'))

    expect(wrapper.text()).toContain('Status: failed')
    expect(wrapper.text()).toContain('TOO_MANY_RECORDS')
  })

  it('surfaces a real runtime failure from malformed file metadata without overriding the import service', async () => {
    const diagram = await diagramService.create({ title: 'MetadataFail', ownerUserId: 'runtime-user' })
    const wrapper = await mountModal(diagram.diagramId)

    await injectFile(wrapper, makeExplodingFile())
    await runImport(wrapper)

    const ui = useUIStore()
    await waitFor(() => ui.toasts.length > 0)
    expect(ui.toasts.some((t) => t.message.includes('Import error: simulated file metadata failure'))).toBe(true)
    expect(wrapper.text()).toContain('View 1 Error(s) / Warning(s)')
  })
})
