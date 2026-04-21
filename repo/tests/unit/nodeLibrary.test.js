import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeLibrary from '@/components/diagrams/NodeLibrary.vue'

describe('NodeLibrary', () => {
  const expectedNodes = [
    { type: 'start', label: 'Start', color: '#22c55e', desc: 'Entry point' },
    { type: 'end', label: 'End', color: '#ef4444', desc: 'Exit point' },
    { type: 'decision', label: 'Decision', color: '#f59e0b', desc: 'Branch logic' },
    { type: 'action', label: 'Action', color: '#3b82f6', desc: 'Process step' },
    { type: 'note', label: 'Note', color: '#8b5cf6', desc: 'Annotation' },
  ]

  it('renders all 5 node types', () => {
    const wrapper = mount(NodeLibrary)
    const nodes = wrapper.findAll('.lib-node')
    expect(nodes).toHaveLength(5)
  })

  it('shows correct labels: Start, End, Decision, Action, Note', () => {
    const wrapper = mount(NodeLibrary)
    const labels = wrapper.findAll('.lib-node-label').map((w) => w.text())
    expect(labels).toEqual(['Start', 'End', 'Decision', 'Action', 'Note'])
  })

  it('shows correct descriptions for each type', () => {
    const wrapper = mount(NodeLibrary)
    const descs = wrapper.findAll('.lib-node-desc').map((w) => w.text())
    expect(descs).toEqual([
      'Entry point',
      'Exit point',
      'Branch logic',
      'Process step',
      'Annotation',
    ])
  })

  it('shows correct color swatches', () => {
    const wrapper = mount(NodeLibrary)
    const swatches = wrapper.findAll('.lib-node-color')
    const expectedRgb = [
      'rgb(34, 197, 94)',   // #22c55e - start green
      'rgb(239, 68, 68)',   // #ef4444 - end red
      'rgb(245, 158, 11)',  // #f59e0b - decision amber
      'rgb(59, 130, 246)',  // #3b82f6 - action blue
      'rgb(139, 92, 246)',  // #8b5cf6 - note purple
    ]
    swatches.forEach((swatch, i) => {
      expect(swatch.attributes('style')).toContain(
        `background: ${expectedRgb[i]}`,
      )
    })
  })

  it('each node item is draggable', () => {
    const wrapper = mount(NodeLibrary)
    const nodes = wrapper.findAll('.lib-node')
    nodes.forEach((node) => {
      expect(node.attributes('draggable')).toBe('true')
    })
  })

  it('shows "Node Library" header', () => {
    const wrapper = mount(NodeLibrary)
    expect(wrapper.find('.lib-header').text()).toBe('Node Library')
  })

  it('shows "Drag onto canvas" hint text', () => {
    const wrapper = mount(NodeLibrary)
    expect(wrapper.find('.lib-hint').text()).toBe('Drag onto canvas')
  })

  it('dragstart event sets correct node-type data on dataTransfer', async () => {
    const wrapper = mount(NodeLibrary)
    const nodes = wrapper.findAll('.lib-node')

    for (let i = 0; i < expectedNodes.length; i++) {
      const setData = vi.fn()
      await nodes[i].trigger('dragstart', {
        dataTransfer: { setData, effectAllowed: '' },
      })
      expect(setData).toHaveBeenCalledWith('node-type', expectedNodes[i].type)
    }
  })

  it('dragstart event sets effectAllowed to copy', async () => {
    const wrapper = mount(NodeLibrary)
    const node = wrapper.findAll('.lib-node')[0]
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' }

    await node.trigger('dragstart', { dataTransfer })
    expect(dataTransfer.effectAllowed).toBe('copy')
  })
})
