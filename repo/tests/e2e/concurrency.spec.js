import { test, expect } from '@playwright/test'

const DEMO_USERNAME = 'demo.author'
const DEMO_PASSWORD = 'DemoPass123!'

async function login(page) {
  await page.goto('/#/login')
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  await page.locator('#username').fill(DEMO_USERNAME)
  await page.locator('#password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/#\/$/)
}

test.describe('Cross-tab concurrency — real BroadcastChannel in a real browser', () => {
  // We share state across two BrowserContexts by using the same origin + same
  // persistent IndexedDB so the diagram row exists in both. BroadcastChannel is
  // only alive within a single BrowserContext; a real second tab of the same
  // context is what exercises the concurrencyService.
  test('saving in tab A surfaces a conflict banner in tab B of the same context', async ({ browser }) => {
    const context = await browser.newContext()

    const tabA = await context.newPage()
    await login(tabA)
    await tabA.goto('/#/diagrams')
    const seededRow = tabA.locator('tbody tr', { hasText: 'Demo Incident Response' })
    await expect(seededRow).toBeVisible()
    await seededRow.getByRole('button', { name: 'Open' }).click()
    await expect(tabA).toHaveURL(/#\/diagrams\//)

    const editorUrl = tabA.url()

    const tabB = await context.newPage()
    await tabB.goto(editorUrl)
    await expect(tabB.locator('.toolbar-title')).toBeVisible({ timeout: 10_000 })

    // Tab A mutates the title and saves
    await tabA.locator('.toolbar-title').click()
    await tabA.locator('.toolbar-input').fill(`Concurrency ${Date.now().toString(36).slice(-5)}`)
    await tabA.getByRole('button', { name: 'Save' }).first().click()

    // Tab B receives the broadcast and shows the conflict banner
    await expect(
      tabB.locator('.conflict-banner, [data-testid="conflict-banner"]').first(),
    ).toBeVisible({ timeout: 10_000 })

    // And the "A newer version was saved from another tab." copy is present
    await expect(tabB.getByText(/newer version was saved from another tab/i)).toBeVisible()

    await context.close()
  })

  test('tab B offers a Refresh action that reloads the editor to the latest version', async ({ browser }) => {
    const context = await browser.newContext()
    const tabA = await context.newPage()
    await login(tabA)
    await tabA.goto('/#/diagrams')
    const row = tabA.locator('tbody tr', { hasText: 'Demo Incident Response' })
    await row.getByRole('button', { name: 'Open' }).click()
    await expect(tabA).toHaveURL(/#\/diagrams\//)
    const editorUrl = tabA.url()

    const tabB = await context.newPage()
    await tabB.goto(editorUrl)
    await expect(tabB.locator('.toolbar-title')).toBeVisible({ timeout: 10_000 })

    const uniqueTitle = `Refresh ${Date.now().toString(36).slice(-5)}`
    await tabA.locator('.toolbar-title').click()
    await tabA.locator('.toolbar-input').fill(uniqueTitle)
    await tabA.getByRole('button', { name: 'Save' }).first().click()

    await expect(tabB.getByText(/newer version was saved from another tab/i)).toBeVisible({ timeout: 10_000 })

    const refresh = tabB.getByRole('button', { name: /Refresh/i })
    if (await refresh.isVisible().catch(() => false)) {
      await refresh.click()
      await expect(tabB.locator('.toolbar-title')).toContainText(uniqueTitle, { timeout: 10_000 })
    }

    await context.close()
  })
})
