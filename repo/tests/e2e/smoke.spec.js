import { test, expect } from '@playwright/test'

test.describe('Application smoke tests', () => {
  test('loads the index page and mounts the Vue app', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await expect(page.locator('#app')).toBeAttached()
    await expect(page).toHaveURL(/#\/(login)?$/)
    expect(errors, `page errors: ${errors.join('\n')}`).toEqual([])
  })

  test('registration route is reachable without being signed in', async ({ page }) => {
    await page.goto('/#/register')
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible()
    await expect(page.locator('#reg-username')).toBeVisible()
  })

  test('clicking "Create one" link navigates from login to register', async ({ page }) => {
    await page.goto('/#/login')
    await page.getByRole('link', { name: 'Create one' }).click()
    await expect(page).toHaveURL(/#\/register$/)
  })
})
