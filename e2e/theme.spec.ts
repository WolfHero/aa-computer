import { test, expect, type Page } from '@playwright/test'

async function openHomeSettings(page: Page) {
  await page.goto('/')
  await page.waitForSelector('.home-page')
  await page.locator('.van-nav-bar__right').getByText('设置').click()
  await page.waitForSelector('.van-action-sheet', { state: 'visible' })
}

async function clickThemeAndReopen(page: Page) {
  await page.locator('.van-action-sheet').getByText('深色模式').click()
  // 等待关闭动画结束再重新打开，避免动画期间点击被吞掉
  await page.waitForSelector('.van-action-sheet', { state: 'hidden' })
  await page.locator('.van-nav-bar__right').getByText('设置').click()
  await page.waitForSelector('.van-action-sheet', { state: 'visible' })
}

test.describe('深色模式三态 E2E', () => {
  test.beforeEach(({ page }) => {
    page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
  })

  test('默认跟随系统，点击按 跟随系统 → 开启 → 关闭 → 跟随系统 轮换并持久化', async ({ page }) => {
    await openHomeSettings(page)
    await expect(page.locator('.van-action-sheet')).toContainText('深色模式')
    await expect(page.locator('.van-action-sheet')).toContainText('跟随系统')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

    // 第一次点击 → 开启
    await clickThemeAndReopen(page)
    await expect(page.locator('.van-action-sheet')).toContainText('已开启')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
    expect(await page.evaluate(() => localStorage.getItem('aa_theme'))).toBe('dark')

    // 第二次点击 → 关闭
    await clickThemeAndReopen(page)
    await expect(page.locator('.van-action-sheet')).toContainText('已关闭')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

    // 第三次点击 → 跟随系统
    await clickThemeAndReopen(page)
    await expect(page.locator('.van-action-sheet')).toContainText('跟随系统')
    expect(await page.evaluate(() => localStorage.getItem('aa_theme'))).toBe('system')

    // 刷新后保持跟随系统
    await page.reload()
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await expect(page.locator('.van-action-sheet')).toContainText('跟随系统')
  })

  test('已存储 dark 时直接以深色打开', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_theme', 'dark')
    })
    await page.goto('/')
    await page.waitForSelector('.home-page')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  })
})
