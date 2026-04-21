import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasNode from '@/components/diagrams/CanvasNode.vue'

function mountNode(props = {}, opts = {}) {
  const defaultNode = {
    nodeId: 'n1',
    type: 'action',
    name: 'Test Node',
    shortDescription: 'A description',
    x: 100,
    y: 200,
    width: 160,
    height: 80,
    color: '#3b82f6',
    ownerTag: '',
    departmentTag: '',
    icon: 'none',
    statusStyle: 'default',
    embeddedImageDataUrl: null,
    imageId: null,
  }
  const { node: nodeOverrides, ...restProps } = props
  return mount(CanvasNode, {
    props: { node: { ...defaultNode, ...nodeOverrides }, ...restProps },
    global: { ...opts.global },
    attachTo: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  })
}

describe('CanvasNode', () => {
  describe('rendering', () => {
    it('renders with correct transform translation', () => {
      const wrapper = mountNode({ node: { x: 150, y: 250 } })
      const g = wrapper.find('g.canvas-node')
      expect(g.attributes('transform')).toBe('translate(150, 250)')
    })

    it('shows rect shape for action type', () => {
      const wrapper = mountNode({ node: { type: 'action' } })
      expect(wrapper.find('rect').exists()).toBe(true)
      expect(wrapper.find('polygon').exists()).toBe(false)
    })

    it('shows rect shape for start type', () => {
      const wrapper = mountNode({ node: { type: 'start' } })
      expect(wrapper.find('rect').exists()).toBe(true)
      expect(wrapper.find('polygon').exists()).toBe(false)
    })

    it('shows rect shape for end type', () => {
      const wrapper = mountNode({ node: { type: 'end' } })
      expect(wrapper.find('rect').exists()).toBe(true)
      expect(wrapper.find('polygon').exists()).toBe(false)
    })

    it('shows rect shape for note type', () => {
      const wrapper = mountNode({ node: { type: 'note' } })
      expect(wrapper.find('rect').exists()).toBe(true)
      expect(wrapper.find('polygon').exists()).toBe(false)
    })

    it('shows polygon (diamond) for decision type', () => {
      const wrapper = mountNode({ node: { type: 'decision' } })
      expect(wrapper.find('polygon').exists()).toBe(true)
      // The decision type should not render the main shape rect
      // (selection/highlight rects may still exist, but the first shape element is polygon)
      const rects = wrapper.findAll('rect')
      // No shape rect for decision; any rects present are for selection/highlight/image
      const shapeRect = rects.filter(
        (r) => !r.attributes('stroke-dasharray') && r.attributes('fill') !== 'none' &&
               r.attributes('fill') !== 'rgba(34, 197, 94, 0.15)' &&
               r.attributes('fill') !== 'rgba(255,255,255,0.7)'
      )
      expect(shapeRect.length).toBe(0)
    })
  })

  describe('text display', () => {
    it('displays truncated name when longer than 18 chars', () => {
      const longName = 'This Is A Very Long Node Name'
      const wrapper = mountNode({ node: { name: longName } })
      const texts = wrapper.findAll('text')
      const nameText = texts.find((t) => t.text().includes('...') && !t.text().includes('|'))
      expect(nameText).toBeTruthy()
      expect(nameText.text()).toBe(longName.slice(0, 16) + '...')
    })

    it('displays full name when 18 chars or fewer', () => {
      const shortName = 'Short Name'
      const wrapper = mountNode({ node: { name: shortName } })
      const texts = wrapper.findAll('text')
      const nameText = texts.find((t) => t.text() === shortName)
      expect(nameText).toBeTruthy()
      expect(nameText.text()).toBe(shortName)
    })

    it('displays truncated shortDescription when longer than 24 chars', () => {
      const longDesc = 'This is a very long description text'
      const wrapper = mountNode({ node: { shortDescription: longDesc } })
      const texts = wrapper.findAll('text')
      const descText = texts.find((t) => t.text() === longDesc.slice(0, 22) + '...')
      expect(descText).toBeTruthy()
    })

    it('displays full shortDescription when 24 chars or fewer', () => {
      const shortDesc = 'A short description'
      const wrapper = mountNode({ node: { shortDescription: shortDesc } })
      const texts = wrapper.findAll('text')
      const descText = texts.find((t) => t.text() === shortDesc)
      expect(descText).toBeTruthy()
    })

    it('shows type label ACTION for action type', () => {
      const wrapper = mountNode({ node: { type: 'action' } })
      const texts = wrapper.findAll('text')
      const typeText = texts.find((t) => t.text() === 'ACTION')
      expect(typeText).toBeTruthy()
    })

    it('shows type label START for start type', () => {
      const wrapper = mountNode({ node: { type: 'start' } })
      const texts = wrapper.findAll('text')
      const typeText = texts.find((t) => t.text() === 'START')
      expect(typeText).toBeTruthy()
    })

    it('shows type label DECISION for decision type', () => {
      const wrapper = mountNode({ node: { type: 'decision' } })
      const texts = wrapper.findAll('text')
      const typeText = texts.find((t) => t.text() === 'DECISION')
      expect(typeText).toBeTruthy()
    })

    it('shows type label END for end type', () => {
      const wrapper = mountNode({ node: { type: 'end' } })
      const texts = wrapper.findAll('text')
      const typeText = texts.find((t) => t.text() === 'END')
      expect(typeText).toBeTruthy()
    })

    it('shows type label NOTE for note type', () => {
      const wrapper = mountNode({ node: { type: 'note' } })
      const texts = wrapper.findAll('text')
      const typeText = texts.find((t) => t.text() === 'NOTE')
      expect(typeText).toBeTruthy()
    })
  })

  describe('selection and highlight', () => {
    it('shows selection indicator when selected=true', () => {
      const wrapper = mountNode({ selected: true })
      const rects = wrapper.findAll('rect')
      const selectionRect = rects.find(
        (r) => r.attributes('stroke-dasharray') === '4,2'
      )
      expect(selectionRect).toBeTruthy()
    })

    it('does not show selection indicator when selected=false', () => {
      const wrapper = mountNode({ selected: false })
      const rects = wrapper.findAll('rect')
      const selectionRect = rects.find(
        (r) => r.attributes('stroke-dasharray') === '4,2'
      )
      expect(selectionRect).toBeUndefined()
    })

    it('shows highlight rect when highlighted=true', () => {
      const wrapper = mountNode({ highlighted: true })
      const rects = wrapper.findAll('rect')
      const highlightRect = rects.find(
        (r) => r.attributes('stroke') === '#22c55e'
      )
      expect(highlightRect).toBeTruthy()
    })

    it('does not show highlight rect when highlighted=false', () => {
      const wrapper = mountNode({ highlighted: false })
      const rects = wrapper.findAll('rect')
      const highlightRect = rects.find(
        (r) => r.attributes('stroke') === '#22c55e'
      )
      expect(highlightRect).toBeUndefined()
    })
  })

  describe('connect handles', () => {
    it('shows connect handle circles when editable=true', () => {
      const wrapper = mountNode({ editable: true })
      const circles = wrapper.findAll('circle.connect-handle')
      expect(circles.length).toBe(4)
    })

    it('hides connect handle circles when editable=false', () => {
      const wrapper = mountNode({ editable: false })
      const circles = wrapper.findAll('circle.connect-handle')
      expect(circles.length).toBe(0)
    })
  })

  describe('events', () => {
    it('emits select on mousedown', async () => {
      const wrapper = mountNode()
      const g = wrapper.find('g.canvas-node')
      await g.trigger('mousedown', { clientX: 0, clientY: 0 })
      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select').length).toBeGreaterThanOrEqual(1)
    })

    it('emits select with shiftKey value on mousedown', async () => {
      const wrapper = mountNode()
      const g = wrapper.find('g.canvas-node')
      await g.trigger('mousedown', { clientX: 0, clientY: 0, shiftKey: true })
      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select')[0]).toEqual([true])
    })

    it('emits connect-start on connect handle mousedown', async () => {
      const wrapper = mountNode({ editable: true })
      const handle = wrapper.find('circle.connect-handle')
      await handle.trigger('mousedown')
      expect(wrapper.emitted('connect-start')).toBeTruthy()
    })

    it('emits connect-end on mouseup', async () => {
      const wrapper = mountNode()
      const g = wrapper.find('g.canvas-node')
      await g.trigger('mouseup')
      expect(wrapper.emitted('connect-end')).toBeTruthy()
    })
  })

  describe('tags', () => {
    it('shows owner and department tags', () => {
      const wrapper = mountNode({
        node: { ownerTag: 'Alice', departmentTag: 'Engineering' },
      })
      const texts = wrapper.findAll('text')
      const tagText = texts.find((t) => t.text().includes('Alice') && t.text().includes('Engineering'))
      expect(tagText).toBeTruthy()
      expect(tagText.text()).toBe('Alice | Engineering')
    })

    it('shows only owner tag when department is empty', () => {
      const wrapper = mountNode({
        node: { ownerTag: 'Bob', departmentTag: '' },
      })
      const texts = wrapper.findAll('text')
      const tagText = texts.find((t) => t.text() === 'Bob')
      expect(tagText).toBeTruthy()
    })

    it('does not show tags text when both are empty', () => {
      const wrapper = mountNode({
        node: { ownerTag: '', departmentTag: '' },
      })
      const texts = wrapper.findAll('text')
      // No tag text should contain a pipe separator or stand alone as a tag
      const tagText = texts.find((t) => t.text().includes('|'))
      expect(tagText).toBeUndefined()
    })
  })

  describe('computed properties', () => {
    it('uses default color #6b7280 when node has no color', () => {
      const wrapper = mountNode({ node: { color: '' } })
      // The shape rect should use the fallback color
      const rect = wrapper.find('rect')
      expect(rect.attributes('fill')).toBe('#6b7280')
    })

    it('uses node color when provided', () => {
      const wrapper = mountNode({ node: { color: '#ef4444' } })
      const rect = wrapper.find('rect')
      expect(rect.attributes('fill')).toBe('#ef4444')
    })

    it('iconLabel returns empty string for icon none', () => {
      const wrapper = mountNode({ node: { icon: 'none' } })
      const texts = wrapper.findAll('text')
      // When icon is 'none', iconLabel is '' which is falsy, so the icon text should not render.
      // Verify none of the known icon labels appear in any text element.
      const knownIcons = ['CHK', 'ALT', 'SAFE', 'DOC', 'TEAM']
      const iconTexts = texts.filter((t) => knownIcons.includes(t.text()))
      expect(iconTexts.length).toBe(0)
    })

    it('iconLabel returns CHK for check icon', () => {
      const wrapper = mountNode({ node: { icon: 'check' } })
      const texts = wrapper.findAll('text')
      const iconText = texts.find((t) => t.text() === 'CHK')
      expect(iconText).toBeTruthy()
    })

    it('iconLabel returns ALT for alert icon', () => {
      const wrapper = mountNode({ node: { icon: 'alert' } })
      const texts = wrapper.findAll('text')
      const iconText = texts.find((t) => t.text() === 'ALT')
      expect(iconText).toBeTruthy()
    })

    it('iconLabel returns SAFE for shield icon', () => {
      const wrapper = mountNode({ node: { icon: 'shield' } })
      const texts = wrapper.findAll('text')
      const iconText = texts.find((t) => t.text() === 'SAFE')
      expect(iconText).toBeTruthy()
    })

    it('iconLabel returns DOC for document icon', () => {
      const wrapper = mountNode({ node: { icon: 'document' } })
      const texts = wrapper.findAll('text')
      const iconText = texts.find((t) => t.text() === 'DOC')
      expect(iconText).toBeTruthy()
    })

    it('iconLabel returns TEAM for people icon', () => {
      const wrapper = mountNode({ node: { icon: 'people' } })
      const texts = wrapper.findAll('text')
      const iconText = texts.find((t) => t.text() === 'TEAM')
      expect(iconText).toBeTruthy()
    })

    it('statusLabel defaults to DEFAULT', () => {
      const wrapper = mountNode({ node: { statusStyle: '' } })
      const texts = wrapper.findAll('text')
      const statusText = texts.find((t) => t.text() === 'DEFAULT')
      expect(statusText).toBeTruthy()
    })

    it('statusLabel uppercases the statusStyle value', () => {
      const wrapper = mountNode({ node: { statusStyle: 'approved' } })
      const texts = wrapper.findAll('text')
      const statusText = texts.find((t) => t.text() === 'APPROVED')
      expect(statusText).toBeTruthy()
    })

    it('borderColor uses --ff-primary when selected', () => {
      const wrapper = mountNode({ selected: true, node: { type: 'action' } })
      const rect = wrapper.find('rect')
      expect(rect.attributes('stroke')).toBe('var(--ff-primary)')
    })

    it('borderColor uses nodeColor when not selected', () => {
      const wrapper = mountNode({ selected: false, node: { color: '#3b82f6', type: 'action' } })
      const rect = wrapper.find('rect')
      expect(rect.attributes('stroke')).toBe('#3b82f6')
    })
  })
})
