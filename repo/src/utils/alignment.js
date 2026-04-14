const SNAP_THRESHOLD = 8

export function computeAlignmentGuides(draggedNode, allNodes, threshold = SNAP_THRESHOLD) {
  const guides = []
  const snappedX = { value: null, delta: Infinity }
  const snappedY = { value: null, delta: Infinity }

  const d = {
    left: draggedNode.x,
    centerX: draggedNode.x + draggedNode.width / 2,
    right: draggedNode.x + draggedNode.width,
    top: draggedNode.y,
    centerY: draggedNode.y + draggedNode.height / 2,
    bottom: draggedNode.y + draggedNode.height,
  }

  for (const other of allNodes) {
    if (other.nodeId === draggedNode.nodeId) continue

    const o = {
      left: other.x,
      centerX: other.x + other.width / 2,
      right: other.x + other.width,
      top: other.y,
      centerY: other.y + other.height / 2,
      bottom: other.y + other.height,
    }

    // Horizontal alignment (snap X position)
    checkAlign(d.left,    o.left,    threshold, snappedX, guides, 'vertical', o.left,    draggedNode, other, 'left-left')
    checkAlign(d.centerX, o.centerX, threshold, snappedX, guides, 'vertical', o.centerX, draggedNode, other, 'center-center-x')
    checkAlign(d.right,   o.right,   threshold, snappedX, guides, 'vertical', o.right,   draggedNode, other, 'right-right')
    checkAlign(d.left,    o.right,   threshold, snappedX, guides, 'vertical', o.right,   draggedNode, other, 'left-right')
    checkAlign(d.right,   o.left,    threshold, snappedX, guides, 'vertical', o.left,    draggedNode, other, 'right-left')

    // Vertical alignment (snap Y position)
    checkAlign(d.top,     o.top,     threshold, snappedY, guides, 'horizontal', o.top,     draggedNode, other, 'top-top')
    checkAlign(d.centerY, o.centerY, threshold, snappedY, guides, 'horizontal', o.centerY, draggedNode, other, 'center-center-y')
    checkAlign(d.bottom,  o.bottom,  threshold, snappedY, guides, 'horizontal', o.bottom,  draggedNode, other, 'bottom-bottom')
    checkAlign(d.top,     o.bottom,  threshold, snappedY, guides, 'horizontal', o.bottom,  draggedNode, other, 'top-bottom')
    checkAlign(d.bottom,  o.top,     threshold, snappedY, guides, 'horizontal', o.top,     draggedNode, other, 'bottom-top')
  }

  return { guides, snappedX: snappedX.value, snappedY: snappedY.value }
}

function checkAlign(dragEdge, otherEdge, threshold, bestSnap, guides, orientation, linePos, draggedNode, otherNode, type) {
  const delta = Math.abs(dragEdge - otherEdge)
  if (delta > threshold) return

  if (delta < bestSnap.delta) {
    bestSnap.delta = delta
    if (orientation === 'vertical') {
      // Snap X: shift so the dragged edge aligns with otherEdge
      bestSnap.value = otherEdge - (dragEdge - draggedNode.x)
    } else {
      // Snap Y: shift so the dragged edge aligns with otherEdge
      bestSnap.value = otherEdge - (dragEdge - draggedNode.y)
    }
  }

  guides.push(buildGuideLine(orientation, linePos, draggedNode, otherNode, type))
}

function buildGuideLine(orientation, pos, draggedNode, otherNode, type) {
  if (orientation === 'vertical') {
    const minY = Math.min(draggedNode.y, otherNode.y) - 20
    const maxY = Math.max(draggedNode.y + draggedNode.height, otherNode.y + otherNode.height) + 20
    return { orientation, x: pos, y1: minY, y2: maxY, type }
  }
  const minX = Math.min(draggedNode.x, otherNode.x) - 20
  const maxX = Math.max(draggedNode.x + draggedNode.width, otherNode.x + otherNode.width) + 20
  return { orientation, y: pos, x1: minX, x2: maxX, type }
}

export function applyAlignmentSnap(baseX, baseY, guides) {
  let x = baseX
  let y = baseY
  if (guides.snappedX !== null) x = guides.snappedX
  if (guides.snappedY !== null) y = guides.snappedY
  return { x, y }
}

export { SNAP_THRESHOLD }
