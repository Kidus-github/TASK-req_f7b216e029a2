import { test, expect } from '@playwright/test'

const DEMO_USERNAME = 'demo.author'
const DEMO_PASSWORD = 'DemoPass123!'

function uniqueUser(prefix) {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}_${stamp}_${rand}`
}

async function loginAsDemo(page) {
  await page.goto('/#/login')
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  await page.locator('#username').fill(DEMO_USERNAME)
  await page.locator('#password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/#\/$/)
}

test.describe('Auth guards and session persistence', () => {
  test('unauthenticated access to a protected route redirects to login', async ({ page }) => {
    await page.goto('/#/diagrams')
    await expect(page).toHaveURL(/#\/login/)
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  })

  test('demo credentials land on the dashboard and show user-specific chrome', async ({ page }) => {
    await loginAsDemo(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText(/Welcome back,/)).toBeVisible()
    // topbar (only shown when authenticated)
    await expect(page.getByRole('link', { name: 'Diagrams' }).first()).toBeVisible()
  })

  test('registration + login puts the new user on the dashboard with user-specific chrome', async ({ page }) => {
    const username = uniqueUser('tester')
    const password = 'S3cret-pa55word'

    await page.goto('/#/register')
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible()
    await page.locator('#reg-username').fill(username)
    await page.locator('#reg-password').fill(password)
    await page.locator('#reg-confirm').fill(password)
    await page.locator('#reg-realname').fill('Persisted User')
    await page.getByRole('button', { name: 'Create Account' }).click()

    await expect(page).toHaveURL(/#\/login$/)

    await page.locator('#username').fill(username)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })
})

test.describe('Diagrams list to editor to persisted update', () => {
  test('renaming a diagram persists across a full page reload', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/diagrams')

    const row = page.locator('tbody tr', { hasText: 'Demo Incident Response' })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Open' }).click()

    await expect(page).toHaveURL(/#\/diagrams\//)
    await expect(page.locator('.toolbar-title')).toContainText('Demo Incident Response')

    const newTitle = `Demo Incident Response ${Date.now().toString(36).slice(-5)}`
    await page.locator('.toolbar-title').click()
    await page.locator('.toolbar-input').fill(newTitle)
    await page.getByRole('button', { name: 'Save' }).first().click()
    await expect(page.locator('.toolbar-title')).toContainText(newTitle)

    // Reload: IndexedDB-backed title should survive
    await page.reload()
    await expect(page.locator('.toolbar-title')).toContainText(newTitle)

    // And the listing page should reflect the new title too
    await page.goto('/#/diagrams')
    await expect(page.locator('tbody')).toContainText(newTitle)

    // Reset to the original name so we don't poison future test runs
    const restoredRow = page.locator('tbody tr', { hasText: newTitle })
    await restoredRow.getByRole('button', { name: 'Open' }).click()
    await expect(page.locator('.toolbar-title')).toContainText(newTitle)
    await page.locator('.toolbar-title').click()
    await page.locator('.toolbar-input').fill('Demo Incident Response')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await expect(page.locator('.toolbar-title')).toContainText('Demo Incident Response')
  })
})

test.describe('Library route rich assertions', () => {
  test('published demo content is listed with publish timestamps and opens to the editor', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/library')

    await expect(page.getByRole('heading', { name: 'Approved Library' })).toBeVisible()
    const libraryRow = page.locator('tbody tr', { hasText: 'Demo Approval Library' })
    await expect(libraryRow).toBeVisible()
    // Published column should render a formatted date, not '-'
    await expect(libraryRow.locator('td').nth(1)).not.toHaveText('-')

    await libraryRow.getByRole('button', { name: 'View' }).click()
    await expect(page).toHaveURL(/#\/diagrams\//)
    await expect(page.locator('.toolbar-title')).toContainText('Demo Approval Library')
    // Disambiguate from <text>Published</text> stamps drawn inside published
    // canvas nodes — target the toolbar status badge directly.
    await expect(page.locator('.badge-published')).toBeVisible()
  })
})

test.describe('Profile preference persistence', () => {
  test('switching persona on profile page survives a full reload', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/profile')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()

    // Make sure we start on Author then switch to Viewer
    await page.getByRole('button', { name: 'Viewer', exact: true }).click()
    await expect(page.locator('button.btn-primary', { hasText: 'Viewer' })).toBeVisible()

    // Reload and confirm persistence (Viewer stays highlighted as primary)
    await page.reload()
    await expect(page.locator('button.btn-primary', { hasText: 'Viewer' })).toBeVisible()

    // Restore to Author so other tests aren't affected
    await page.getByRole('button', { name: 'Author' }).click()
    await expect(page.locator('button.btn-primary', { hasText: 'Author' })).toBeVisible()
  })

  test('viewer persona hides diagram creation on the diagrams list page', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/profile')
    await page.getByRole('button', { name: 'Viewer', exact: true }).click()
    await expect(page.locator('button.btn-primary', { hasText: 'Viewer' })).toBeVisible()

    await page.goto('/#/diagrams')
    await expect(page.getByText('View diagrams with reduced edit affordances.')).toBeVisible()
    const newBtn = page.getByRole('button', { name: '+ New Diagram' })
    await expect(newBtn).toBeVisible()
    await expect(newBtn).toBeDisabled()

    // Restore persona
    await page.goto('/#/profile')
    await page.getByRole('button', { name: 'Author' }).click()
    await expect(page.locator('button.btn-primary', { hasText: 'Author' })).toBeVisible()
  })

  test('saving an audit retention note persists across a full reload', async ({ page }) => {
    await loginAsDemo(page)
    await page.goto('/#/profile')

    const uniqueNote = `Retain local audit events for 12 months (edit ${Date.now().toString(36).slice(-5)}).`
    const textarea = page.locator('textarea')
    await textarea.fill(uniqueNote)
    await page.getByRole('button', { name: 'Save Retention Note' }).click()

    // TextConfirmModal flow — exact match avoids the case-insensitive
    // <h2>Save Audit Retention Note</h2> in the same modal.
    await expect(page.getByText('SAVE AUDIT RETENTION NOTE', { exact: true })).toBeVisible()
    await page.locator('.modal input').fill('SAVE AUDIT RETENTION NOTE')
    await page.locator('.modal-actions button').last().click()

    await expect(page.locator('textarea')).toHaveValue(uniqueNote)

    // Reload: note still there because it was saved to IndexedDB
    await page.reload()
    await expect(page.locator('textarea')).toHaveValue(uniqueNote)
  })
})
