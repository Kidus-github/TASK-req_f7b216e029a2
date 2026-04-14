import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasEdge from '../src/components/diagrams/CanvasEdge.vue'

function mountEdge(edgeOverrides = {}, nodesOverrides, opts = {}) {
  const defaultNodes = [
    { nodeId: 'n1', x: 0, y: 0, width: 160, height: 80 },
    { nodeId: 'n2', x: 300, y: 200, width: 160, height: 80 },
  ]
  const defaultEdge = {
    edgeId: 'e1',
    sourceNodeId: 'n1',
    targetNodeId: 'n2',
    label: '',
    routingMode: 'orthogonal',
    arrowed: true,
  }
  return mount(CanvasEdge, {
    props: {
      edge: { ...defaultEdge, ...edgeOverrides },
      nodes: nodesOverrides || defaultNodes,
      ...opts,
    },
    attachTo: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  })
}

describe('CanvasEdge', () => {
  it('renders a path with orthogonal routing containing L commands', () => {
    const wrapper = mountEdge({ routingMode: 'orthogonal' })
    const paths = wrapper.findAll('path')
    // There should be at least the visible path and the click-target path
    expect(paths.length).toBeGreaterThanOrEqual(2)
    const d = paths[0].attributes('d')
    expect(d).toContain('L')
    expect(d).toContain('M')
  })

  it('renders a path with curve routing containing C command', () => {
    const wrapper = mountEdge({ routingMode: 'curve' })
    const paths = wrapper.findAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
    const d = paths[0].attributes('d')
    expect(d).toContain('C')
    expect(d).toContain('M')
    expect(d).not.toContain('L')
  })

  it('shows label text when edge has a label', () => {
    const wrapper = mountEdge({ label: 'my-label' })
    const textEl = wrapper.find('text')
    expect(textEl.exists()).toBe(true)
    expect(textEl.text()).toBe('my-label')
  })

  it('does not show label when edge.label is empty', () => {
    const wrapper = mountEdge({ label: '' })
    const textEl = wrapper.find('text')
    expect(textEl.exists()).toBe(false)
  })

  it('shows arrowhead marker-end when edge.arrowed is true', () => {
    const wrapper = mountEdge({ arrowed: true })
    // The visible path is the second <path> (first is the invisible click target)
    const visiblePath = wrapper.findAll('path')[1]
    expect(visiblePath.attributes('marker-end')).toBe('url(#arrowhead)')
  })

  it('does not show marker-end when edge.arrowed is false', () => {
    const wrapper = mountEdge({ arrowed: false })
    const visiblePath = wrapper.findAll('path')[1]
    const markerEnd = visiblePath.attributes('marker-end')
    expect(!markerEnd || markerEnd === '').toBe(true)
  })

  it('shows selection indicator circle when selected is true', () => {
    const wrapper = mountEdge({}, undefined, { selected: true })
    const circle = wrapper.find('circle')
    expect(circle.exists()).toBe(true)
  })

  it('does not show selection indicator when selected is false', () => {
    const wrapper = mountEdge({}, undefined, { selected: false })
    const circle = wrapper.find('circle')
    expect(circle.exists()).toBe(false)
  })

  it('emits select on click with shiftKey info', async () => {
    const wrapper = mountEdge()
    // Click the root <g> element
    const g = wrapper.find('g.canvas-edge')
    await g.trigger('click', { shiftKey: true })
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0][0]).toEqual({ shiftKey: true })
  })

  it('emits select on click with shiftKey false', async () => {
    const wrapper = mountEdge()
    const g = wrapper.find('g.canvas-edge')
    await g.trigger('click', { shiftKey: false })
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0][0]).toEqual({ shiftKey: false })
  })

  it('has invisible wider click target path with stroke-width 12', () => {
    const wrapper = mountEdge()
    const clickTarget = wrapper.findAll('path')[0]
    expect(clickTarget.attributes('stroke')).toBe('transparent')
    expect(clickTarget.attributes('stroke-width')).toBe('12')
  })

  it('pathD is empty string when source node is missing', () => {
    const nodes = [
      { nodeId: 'n2', x: 300, y: 200, width: 160, height: 80 },
    ]
    const wrapper = mountEdge({ sourceNodeId: 'n1' }, nodes)
    const paths = wrapper.findAll('path')
    // Both paths should have empty d attribute
    for (const p of paths) {
      expect(p.attributes('d')).toBe('')
    }
  })

  it('clipToNodeBorder produces correct clipped coordinates in the rendered path', () => {
    // n1 center = (80, 40), n2 center = (380, 240)
    // Direction from n1 to n2: dx=300, dy=200
    // For n1 (hw=80, hh=40): absDx*hh=300*40=12000, absDy*hw=200*80=16000
    //   absDx*hh < absDy*hw => t = hh/absDy = 40/200 = 0.2
    //   clipped source = (80 + 300*0.2, 40 + 200*0.2) = (140, 80)
    // Direction from n2 to n1: dx=-300, dy=-200
    // For n2 (hw=80, hh=40): absDx*hh=300*40=12000, absDy*hw=200*80=16000
    //   absDx*hh < absDy*hw => t = hh/absDy = 40/200 = 0.2
    //   clipped target = (380 + (-300)*0.2, 240 + (-200)*0.2) = (320, 200)
    const wrapper = mountEdge({ routingMode: 'orthogonal' })
    const d = wrapper.findAll('path')[0].attributes('d')
    // Orthogonal: M sx sy L mx sy L mx ty L tx ty
    // sx=140, sy=80, tx=320, ty=200, mx=(140+320)/2=230
    expect(d).toBe('M 140 80 L 230 80 L 230 200 L 320 200')
  })

  it('labelPos is at midpoint between clipped source and target, offset by -8 in y', () => {
    // clipped source = (140, 80), clipped target = (320, 200)
    // labelPos = ((140+320)/2, (80+200)/2 - 8) = (230, 132)
    const wrapper = mountEdge({ label: 'test-label' })
    const textEl = wrapper.find('text')
    expect(textEl.attributes('x')).toBe('230')
    expect(textEl.attributes('y')).toBe('132')
  })
})
