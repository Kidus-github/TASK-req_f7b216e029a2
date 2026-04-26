import { test, expect } from '@playwright/test'

const DEMO_USERNAME = 'demo.author'
const DEMO_PASSWORD = 'DemoPass123!'

async function loginAsDemo(page) {
  await page.goto('/#/login')
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  await page.locator('#username').fill(DEMO_USERNAME)
  await page.locator('#password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/#\/$/)
}

async function createBlankDiagram(page, title) {
  await page.goto('/#/diagrams')
  await page.getByRole('button', { name: '+ New Diagram' }).click()
  await page.locator('#new-title').fill(title)
  await page.getByRole('button', { name: /Create Blank/ }).click()
  await expect(page).toHaveURL(/#\/diagrams\//)
  await expect(page.locator('.toolbar-title')).toContainText(title)
}

// HTML5 drag-and-drop in Chromium requires synthetic DragEvent dispatch with a
// shared DataTransfer — page.mouse and page.dragTo do not propagate it. We
// fire dragstart on the lib-node so the app's own handler populates dt with
// node-type, then fire dragover+drop on the canvas at the requested screen
// coordinates derived from the canvas SVG's bounding rect.
async function dropNodeOnCanvas(page, label, canvasOffsetX, canvasOffsetY) {
  await page.evaluate(
    ({ label, canvasOffsetX, canvasOffsetY }) => {
      const lib = [...document.querySelectorAll('.lib-node')].find((el) =>
        el.textContent.includes(label),
      )
      if (!lib) throw new Error(`Lib node not found: ${label}`)
      const svg = document.querySelector('svg.canvas-svg')
      if (!svg) throw new Error('Canvas SVG not found')

      const dt = new DataTransfer()
      lib.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))

      const r = svg.getBoundingClientRect()
      svg.dispatchEvent(new DragEvent('dragover', {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: r.left + canvasOffsetX, clientY: r.top + canvasOffsetY,
      }))
      svg.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: r.left + canvasOffsetX, clientY: r.top + canvasOffsetY,
      }))
    },
    { label, canvasOffsetX, canvasOffsetY },
  )
}

test.describe('Canvas drag-and-drop, connect, move — real browser interactions', () => {
  test('dragging a node type from the library onto the canvas creates a persisted node', async ({ page }) => {
    await loginAsDemo(page)
    const title = `CanvasDrag ${Date.now().toString(36).slice(-5)}`
    await createBlankDiagram(page, title)

    await expect(page.locator('.lib-node', { hasText: 'Action' })).toBeVisible()
    await expect(page.locator('svg.canvas-svg')).toBeVisible()

    await dropNodeOnCanvas(page, 'Action', 240, 200)

    await expect(page.locator('.canvas-node').filter({ hasText: /Action/i }).first()).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(300)

    await page.reload()
    await expect(page.locator('.canvas-node')).toHaveCount(1)
  })

  test('connecting two nodes through the canvas produces a persisted edge', async ({ page }) => {
    await loginAsDemo(page)
    const title = `CanvasConnect ${Date.now().toString(36).slice(-5)}`
    await createBlankDiagram(page, title)

    await dropNodeOnCanvas(page, 'Start', 120, 200)
    await dropNodeOnCanvas(page, 'End', 520, 200)
    await expect(page.locator('.canvas-node')).toHaveCount(2, { timeout: 5000 })

    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(300)

    // Drag from the first node's connect-handle to the second node's body.
    // Each canvas-node renders 4 connect handles (top/right/bottom/left); use
    // .first() to pick the topmost one and avoid Playwright strict-mode errors.
    const firstNode = page.locator('.canvas-node').first()
    const secondNode = page.locator('.canvas-node').nth(1)
    await firstNode.hover()
    const firstHandle = firstNode.locator('.connect-handle').first()
    const from = await firstHandle.boundingBox()
    const to = await secondNode.boundingBox()
    expect(from).not.toBeNull()
    expect(to).not.toBeNull()
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect(page.locator('.canvas-edge')).toHaveCount(1, { timeout: 5000 })

    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(300)
    await page.reload()
    await expect(page.locator('.canvas-edge')).toHaveCount(1)
  })

  test('moving a node with the mouse updates its persisted (x,y) after save and reload', async ({ page }) => {
    await loginAsDemo(page)
    const title = `CanvasMove ${Date.now().toString(36).slice(-5)}`
    await createBlankDiagram(page, title)

    await dropNodeOnCanvas(page, 'Action', 100, 100)
    const node = page.locator('.canvas-node').first()
    await expect(node).toBeVisible()

    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(300)

    const start = await node.boundingBox()
    expect(start).not.toBeNull()
    await page.mouse.move(start.x + 40, start.y + 20)
    await page.mouse.down()
    await page.mouse.move(start.x + 240, start.y + 140, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(100)

    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(300)
    await page.reload()
    const after = await page.locator('.canvas-node').first().boundingBox()
    expect(after).not.toBeNull()
    expect(Math.abs(after.x - start.x)).toBeGreaterThan(50)
  })
})
