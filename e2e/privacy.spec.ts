import { test, expect } from '@playwright/test'

test.describe('使用说明与隐私政策 E2E', () => {
  test('首次进入：使用说明 → 跳转隐私政策 → 知道了并记录已同意', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.home-page')

    // 首次进入默认显示「使用说明」
    await page.waitForSelector('.van-dialog:visible', { timeout: 10000 })
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('使用说明')
    // 平板/电脑档位：弹窗明显宽于手机默认
    const desktopBox = await page.locator('.van-dialog:visible').boundingBox()
    expect(desktopBox!.width).toBeGreaterThan(400)
    await expect(page.getByRole('button', { name: '隐私政策', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '知道了', exact: true })).toBeVisible()

    // 跳转到隐私政策
    await page.getByRole('button', { name: '隐私政策', exact: true }).click()
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('隐私政策')
    await expect(page.getByRole('button', { name: '隐私政策', exact: true })).not.toBeVisible()
    await expect(page.getByText('上传到服务器', { exact: false })).toBeVisible()

    // 知道了 → 关闭并标记已同意
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
    const accepted = await page.evaluate(() => localStorage.getItem('aa_privacy_accepted'))
    expect(accepted).toBe('1')
  })

  test('主页菜单拆分为两个独立入口', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
    await page.goto('/')
    await page.waitForSelector('.home-page')

    // 使用说明入口
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.locator('.van-action-sheet').getByText('使用说明').click()
    await page.waitForSelector('.van-dialog:visible')
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('使用说明')
    // 手机档位：宽度不超过 420px
    const mobileBox = await page.locator('.van-dialog:visible').boundingBox()
    expect(mobileBox!.width).toBeLessThanOrEqual(420)
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()

    // 隐私政策入口直接打开隐私政策视图
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.locator('.van-action-sheet').getByText('隐私政策').click()
    await page.waitForSelector('.van-dialog:visible')
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('隐私政策')
    await expect(page.getByRole('button', { name: '知道了', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
  })
})
