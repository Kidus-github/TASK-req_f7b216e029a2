import { test, expect } from '@playwright/test'

function uniqueUser(prefix) {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}_${stamp}_${rand}`
}

test.describe('Authentication flow', () => {
  test('redirects unauthenticated users to the login screen', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/#\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  })

  test('a new user can register then sign in and reach the dashboard', async ({ page }) => {
    const username = uniqueUser('tester')
    const password = 'S3cret-pa55word'

    await page.goto('/#/register')
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible()
    await page.locator('#reg-username').fill(username)
    await page.locator('#reg-password').fill(password)
    await page.locator('#reg-confirm').fill(password)
    await page.getByRole('button', { name: 'Create Account' }).click()

    await expect(page).toHaveURL(/#\/login$/)
    await page.locator('#username').fill(username)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL(/#\/$/)
  })

  test('shows an error when signing in with wrong credentials', async ({ page }) => {
    await page.goto('/#/login')
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
    await page.locator('#username').fill('does-not-exist')
    await page.locator('#password').fill('wrong-password-000')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.locator('.form-error')).toBeVisible()
  })
})
