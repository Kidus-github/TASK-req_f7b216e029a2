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

test.describe('Canvas drag-and-drop, connect, move — real browser interactions', () => {
  test('dragging a node type from the library onto the canvas creates a persisted node', async ({ page }) => {
    await loginAsDemo(page)
    const title = `CanvasDrag ${Date.now().toString(36).slice(-5)}`
    await createBlankDiagram(page, title)

    const lib = page.locator('.lib-node', { hasText: 'Action' })
    const canvas = page.locator('svg.canvas-svg')
    await expect(lib).toBeVisible()
    await expect(canvas).toBeVisible()

    // Prime dataTransfer via a browser-evaluated DragEvent — Playwright's
    // page.dragTo() does not carry dataTransfer through SVG <drop> handlers.
    await page.evaluate(() => {
      const src = document.querySelector('.lib-node')
      const dst = document.querySelector('svg.canvas-svg')
      const dt = new DataTransfer()
      dt.setData('node-type', 'action')
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      const r = dst.getBoundingClientRect()
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: r.left + 240, clientY: r.top + 200, dataTransfer: dt }))
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: r.left + 240, clientY: r.top + 200, dataTransfer: dt }))
    })

    // A new <g.canvas-node> is rendered for the action node
    await expect(page.locator('.canvas-node').filter({ hasText: /Action|New Action/ }).first()).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Save' }).first().click()
    await page.waitForTimeout(300)

    // Reload → node persists via IndexedDB
    await page.reload()
    await expect(page.locator('.canvas-node')).toHaveCount(1)
  })

  test('connecting two nodes through the canvas produces a persisted edge', async ({ page }) => {
    await loginAsDemo(page)
    const title = `CanvasConnect ${Date.now().toString(36).slice(-5)}`
    await createBlankDiagram(page, title)

    // Create two nodes via the real in-app service so the test focuses on edge creation.
    await page.evaluate(async () => {
      const { canvasService } = await import('/src/services/canvasService.js').catch(async () => ({}))
      // Fallback: use the exposed app services via window hooks in dev builds.
      const app = window.__flowforgeTestHooks
      if (app?.canvasService && app?.currentDiagramId) {
        await app.canvasService.addNode(app.currentDiagramId, { type: 'start', name: 'A', x: 120, y: 200 }, app.userId)
        await app.canvasService.addNode(app.currentDiagramId, { type: 'end', name: 'B', x: 520, y: 200 }, app.userId)
      } else if (canvasService) {
        const id = window.location.hash.split('/').pop()
        const userId = JSON.parse(localStorage.getItem('ff_session') || '{}').userId || 'demo-user'
        await canvasService.addNode(id, { type: 'start', name: 'A', x: 120, y: 200 }, userId)
        await canvasService.addNode(id, { type: 'end', name: 'B', x: 520, y: 200 }, userId)
      }
    })

    await page.reload()
    await expect(page.locator('.canvas-node')).toHaveCount(2, { timeout: 5000 })

    // The connect handle is emitted by <CanvasNode> on hover/mousedown. Drag from
    // the first node's connect-handle to the second node's body.
    const firstHandle = page.locator('.canvas-node').first().locator('.connect-handle')
    const secondNode = page.locator('.canvas-node').nth(1)
    const from = await firstHandle.boundingBox()
    const to = await secondNode.boundingBox()
    if (from && to) {
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
      await page.mouse.up()
    }

    // A <g.canvas-edge> appears between the two nodes
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

    // Seed a single node
    await page.evaluate(async () => {
      const app = window.__flowforgeTestHooks
      if (app?.canvasService && app?.currentDiagramId) {
        await app.canvasService.addNode(app.currentDiagramId, { type: 'action', name: 'Mover', x: 100, y: 100 }, app.userId)
      }
    })
    await page.reload()
    const node = page.locator('.canvas-node').first()
    await expect(node).toBeVisible()

    const start = await node.boundingBox()
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
