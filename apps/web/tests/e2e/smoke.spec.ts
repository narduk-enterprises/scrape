import { expect, test, waitForBaseUrlReady, waitForHydration, warmUpApp } from './fixtures'

test.describe('web smoke', () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) {
      throw new Error('web smoke tests require Playwright baseURL to be configured.')
    }

    await waitForBaseUrlReady(baseURL)
    await warmUpApp(browser, baseURL)
  })

  test('home redirects to scrape ops dashboard', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await expect(page).toHaveURL(/\/scrape\/?$/)
    await expect(page.getByText('Scrape operations').first()).toBeVisible()
    await expect(page).toHaveTitle(/Scrape ops/)
  })
})
