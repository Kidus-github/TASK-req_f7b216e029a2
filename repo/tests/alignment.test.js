import { describe, it, expect } from 'vitest'
import { computeAlignmentGuides, applyAlignmentSnap, SNAP_THRESHOLD } from '../src/utils/alignment'

function makeNode(id, x, y, w = 160, h = 80) {
  return { nodeId: id, x, y, width: w, height: h }
}

describe('computeAlignmentGuides', () => {
  it('returns no guides when no other nodes exist', () => {
    const dragged = makeNode('a', 100, 100)
    const result = computeAlignmentGuides(dragged, [dragged])
    expect(result.guides).toHaveLength(0)
    expect(result.snappedX).toBeNull()
    expect(result.snappedY).toBeNull()
  })

  it('detects left-edge-to-left-edge alignment', () => {
    const dragged = makeNode('a', 102, 200)
    const other = makeNode('b', 100, 50)
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedX).toBe(100)
    expect(result.guides.some((g) => g.type === 'left-left')).toBe(true)
  })

  it('detects right-edge-to-right-edge alignment', () => {
    const dragged = makeNode('a', 103, 200, 160, 80)
    const other = makeNode('b', 100, 50, 160, 80)
    // right of dragged = 103+160=263, right of other = 100+160=260, diff=3
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedX).toBe(100) // snaps so right edges align
    expect(result.guides.some((g) => g.type === 'right-right')).toBe(true)
  })

  it('detects center-x-to-center-x alignment', () => {
    const dragged = makeNode('a', 105, 200, 160, 80) // center = 185
    const other = makeNode('b', 100, 50, 160, 80)   // center = 180
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedX).toBe(100) // snaps so centers align
    expect(result.guides.some((g) => g.type === 'center-center-x')).toBe(true)
  })

  it('detects top-edge-to-top-edge alignment', () => {
    const dragged = makeNode('a', 300, 53)
    const other = makeNode('b', 100, 50)
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedY).toBe(50)
    expect(result.guides.some((g) => g.type === 'top-top')).toBe(true)
  })

  it('detects bottom-edge-to-bottom-edge alignment', () => {
    const dragged = makeNode('a', 300, 55, 160, 80) // bottom = 135
    const other = makeNode('b', 100, 50, 160, 80)   // bottom = 130
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedY).toBe(50)
    expect(result.guides.some((g) => g.type === 'bottom-bottom')).toBe(true)
  })

  it('detects center-y-to-center-y alignment', () => {
    const dragged = makeNode('a', 300, 54, 160, 80) // center-y = 94
    const other = makeNode('b', 100, 50, 160, 80)   // center-y = 90
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedY).toBe(50)
    expect(result.guides.some((g) => g.type === 'center-center-y')).toBe(true)
  })

  it('returns no snap when distance exceeds threshold', () => {
    const dragged = makeNode('a', 200, 200)
    const other = makeNode('b', 100, 50)
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedX).toBeNull()
    expect(result.snappedY).toBeNull()
    expect(result.guides).toHaveLength(0)
  })

  it('snaps to the closest candidate when multiple nodes are near', () => {
    const dragged = makeNode('a', 102, 100)
    const near = makeNode('b', 100, 50)    // left diff = 2
    const far = makeNode('c', 105, 300)    // left diff = 3
    const result = computeAlignmentGuides(dragged, [dragged, near, far])
    expect(result.snappedX).toBe(100) // snaps to closer one
  })

  it('produces both X and Y snaps simultaneously', () => {
    const dragged = makeNode('a', 103, 52)
    const other = makeNode('b', 100, 50)
    const result = computeAlignmentGuides(dragged, [dragged, other])
    expect(result.snappedX).toBe(100)
    expect(result.snappedY).toBe(50)
  })

  it('guide lines are vertical for X alignment and horizontal for Y alignment', () => {
    const dragged = makeNode('a', 102, 52)
    const other = makeNode('b', 100, 50)
    const result = computeAlignmentGuides(dragged, [dragged, other])
    const verticals = result.guides.filter((g) => g.orientation === 'vertical')
    const horizontals = result.guides.filter((g) => g.orientation === 'horizontal')
    expect(verticals.length).toBeGreaterThan(0)
    expect(horizontals.length).toBeGreaterThan(0)
    // Vertical guides have x, y1, y2
    for (const g of verticals) {
      expect(g.x).toBeDefined()
      expect(g.y1).toBeDefined()
      expect(g.y2).toBeDefined()
    }
    // Horizontal guides have y, x1, x2
    for (const g of horizontals) {
      expect(g.y).toBeDefined()
      expect(g.x1).toBeDefined()
      expect(g.x2).toBeDefined()
    }
  })

  it('uses configurable threshold', () => {
    const dragged = makeNode('a', 115, 100)
    const other = makeNode('b', 100, 50)
    // Default threshold = 8, diff = 15 -> no snap
    const def = computeAlignmentGuides(dragged, [dragged, other])
    expect(def.snappedX).toBeNull()
    // Custom threshold = 20 -> snap
    const wide = computeAlignmentGuides(dragged, [dragged, other], 20)
    expect(wide.snappedX).toBe(100)
  })
})

describe('applyAlignmentSnap', () => {
  it('returns original position when no snap', () => {
    const result = applyAlignmentSnap(100, 200, { snappedX: null, snappedY: null })
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('applies X snap only', () => {
    const result = applyAlignmentSnap(103, 200, { snappedX: 100, snappedY: null })
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('applies Y snap only', () => {
    const result = applyAlignmentSnap(100, 203, { snappedX: null, snappedY: 200 })
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('applies both snaps', () => {
    const result = applyAlignmentSnap(103, 203, { snappedX: 100, snappedY: 200 })
    expect(result).toEqual({ x: 100, y: 200 })
  })
})

describe('SNAP_THRESHOLD', () => {
  it('is a reasonable pixel value', () => {
    expect(SNAP_THRESHOLD).toBeGreaterThanOrEqual(4)
    expect(SNAP_THRESHOLD).toBeLessThanOrEqual(20)
  })
})
