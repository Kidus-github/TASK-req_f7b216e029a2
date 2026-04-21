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

test.describe('Routed pages', () => {
  test('demo credentials work from the login page and load the dashboard route', async ({ page }) => {
    await loginAsDemo(page)

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Total Diagrams')).toBeVisible()
    await expect(page.getByText(/Welcome back,/)).toBeVisible()
  })

  test('diagrams route lists seeded diagrams and opens a seeded editor route', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/diagrams')

    await expect(page.getByRole('heading', { name: 'My Diagrams' })).toBeVisible()
    await expect(page.getByText('Demo Incident Response')).toBeVisible()
    await expect(page.getByText('Demo Approval Library')).toBeVisible()

    const incidentRow = page.locator('tbody tr', { hasText: 'Demo Incident Response' })
    await expect(incidentRow).toBeVisible()
    await incidentRow.getByRole('button', { name: 'Open' }).click()
    await expect(page).toHaveURL(/#\/diagrams\//)
    await expect(page.locator('.toolbar-title')).toContainText('Demo Incident Response')

    const editorUrl = page.url()
    await page.goto(editorUrl)
    await expect(page.locator('.toolbar-title')).toContainText('Demo Incident Response')
  })

  test('diagram editor route supports a real toolbar interaction', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/diagrams')

    const incidentRow = page.locator('tbody tr', { hasText: 'Demo Incident Response' })
    await expect(incidentRow).toBeVisible()
    await incidentRow.getByRole('button', { name: 'Open' }).click()
    await expect(page).toHaveURL(/#\/diagrams\//)

    await expect(page.locator('.toolbar-title')).toContainText('Demo Incident Response')
    await page.locator('.toolbar-title').click()
    const titleInput = page.locator('.toolbar-input')
    await titleInput.fill('Demo Incident Response Updated')
    await page.getByRole('button', { name: 'Save' }).first().click()

    await expect(page.locator('.toolbar-title')).toContainText('Demo Incident Response Updated')
    await page.getByRole('button', { name: 'Versions' }).click()
    await expect(page.getByRole('heading', { name: 'Version History' })).toBeVisible()
  })

  test('approved library route shows published demo content', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/library')

    await expect(page.getByRole('heading', { name: 'Approved Library' })).toBeVisible()
    await expect(page.getByText('Demo Approval Library')).toBeVisible()
    await page.getByRole('button', { name: 'View' }).click()
    await expect(page).toHaveURL(/#\/diagrams\//)
    await expect(page.locator('.toolbar-title')).toContainText('Demo Approval Library')
  })

  test('profile route shows seeded account and local compliance content', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/profile')

    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByText('demo.author')).toBeVisible()
    await expect(page.getByText('Audit Retention Notes')).toBeVisible()
    await expect(page.locator('textarea')).toHaveValue(/Retain local audit events for 12 months/)
    await expect(page.getByRole('button', { name: 'Author' })).toBeVisible()
  })
})
