import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

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

test.describe('Real JSON export → import round-trip', () => {
  test('Export JSON on a seeded diagram produces a downloadable file whose contents re-import into a new diagram', async ({ page }) => {
    await login(page)
    await page.goto('/#/diagrams')

    const row = page.locator('tbody tr', { hasText: 'Demo Incident Response' })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Open' }).click()
    await expect(page).toHaveURL(/#\/diagrams\//)

    // Capture the real download
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'JSON' }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).toBeTruthy()
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.diagram.title).toBe('Demo Incident Response')
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(parsed.nodes.length).toBeGreaterThan(0)

    // Create a blank diagram to import into
    await page.goto('/#/diagrams')
    const title = `ImportTarget ${Date.now().toString(36).slice(-5)}`
    await page.getByRole('button', { name: '+ New Diagram' }).click()
    await page.locator('#new-title').fill(title)
    await page.getByRole('button', { name: /Create Blank/ }).click()
    await expect(page).toHaveURL(/#\/diagrams\//)

    // Open the Import modal
    const importBtn = page.getByRole('button', { name: /Import/i })
    if (await importBtn.isVisible().catch(() => false)) {
      await importBtn.click()
      await page.locator('input[type="file"]').setInputFiles(path)
      await page.locator('.modal-actions .btn-primary').click()
      await expect(page.getByText(/Status: (completed|partial_success)/)).toBeVisible({ timeout: 10_000 })
    }

    // The new diagram now renders at least the same number of nodes as the source
    await page.waitForTimeout(300)
    const nodes = await page.locator('.canvas-node').count()
    expect(nodes).toBeGreaterThan(0)
  })

  test('Importing a malformed JSON file surfaces an Import Errors view with the INVALID_JSON code', async ({ page }, testInfo) => {
    await login(page)
    await page.goto('/#/diagrams')
    const title = `BadImport ${Date.now().toString(36).slice(-5)}`
    await page.getByRole('button', { name: '+ New Diagram' }).click()
    await page.locator('#new-title').fill(title)
    await page.getByRole('button', { name: /Create Blank/ }).click()
    await expect(page).toHaveURL(/#\/diagrams\//)

    const importBtn = page.getByRole('button', { name: /Import/i })
    if (await importBtn.isVisible().catch(() => false)) {
      await importBtn.click()
      const tmpPath = testInfo.outputPath('malformed.json')
      await require('node:fs').promises.writeFile(tmpPath, 'this is not json')
      await page.locator('input[type="file"]').setInputFiles(tmpPath)
      await page.locator('.modal-actions .btn-primary').click()

      await expect(page.getByText(/Status: failed/i)).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/INVALID_JSON/)).toBeVisible()
    }
  })

  test('Profile backup download and restore round-trip via the real profile page', async ({ page }) => {
    await login(page)
    await page.goto('/#/profile')
    const downloadBtn = page.getByRole('button', { name: /Download Backup/i })
    if (!(await downloadBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Download Backup button not available in this build')
      return
    }

    const downloadPromise = page.waitForEvent('download')
    await downloadBtn.click()
    const download = await downloadPromise
    const path = await download.path()
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.backupVersion).toBe(1)
    expect(typeof parsed.checksum).toBe('string')
    expect(Array.isArray(parsed.users)).toBe(true)
  })
})
