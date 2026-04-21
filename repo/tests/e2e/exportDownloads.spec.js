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

async function openSeededDiagram(page) {
  await login(page)
  await page.goto('/#/diagrams')
  const row = page.locator('tbody tr', { hasText: 'Demo Incident Response' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveURL(/#\/diagrams\//)
  await expect(page.locator('.canvas-svg')).toBeVisible()
}

test.describe('Editor export downloads', () => {
  test('SVG export produces a downloadable SVG file with the expected XML namespace', async ({ page }) => {
    await openSeededDiagram(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'SVG' }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(download.suggestedFilename()).toMatch(/\.svg$/)
    expect(path).toBeTruthy()

    const raw = readFileSync(path, 'utf8')
    expect(raw).toContain('<svg')
    expect(raw).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  test('JSON export produces a downloadable JSON file with the diagram payload and checksum', async ({ page }) => {
    await openSeededDiagram(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'JSON' }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(download.suggestedFilename()).toMatch(/\.json$/)
    expect(path).toBeTruthy()

    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.diagram.title).toBe('Demo Incident Response')
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(parsed.nodes.length).toBeGreaterThan(0)
    expect(typeof parsed.checksum).toBe('string')
  })
})
