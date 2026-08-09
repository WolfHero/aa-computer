import { test, expect, type Browser, type Page } from '@playwright/test'

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_WECHAT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002835)'
const IPHONE_QQ_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQ/8.9.28.610 MQQBrowser/6.0'
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'

async function newIPhonePage(browser: Browser, userAgent: string): Promise<Page> {
  const context = await browser.newContext({ userAgent })
  await context.addInitScript(() => {
    localStorage.setItem('aa_privacy_accepted', '1')
  })
  return context.newPage()
}

test.describe('iPhone 首次打开提示 E2E', () => {
  test('iPhone Safari 首次进首页弹「iPhone 使用提示」，刷新后不再弹', async ({ browser }) => {
    const page = await newIPhonePage(browser, IPHONE_SAFARI_UA)
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.waitForSelector('.van-dialog:visible')
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('iPhone 使用提示')
    await expect(page.getByText('主屏幕入口的 AA计算器与浏览器的数据不共通', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('aa_iphone_hint_shown'))).toBe('1')

    await page.reload()
    await page.waitForSelector('.home-page')
    await page.waitForTimeout(500)
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
  })

  test('iPhone 微信首次进首页弹 QQ/微信提示，之后再打开邀请链接不再弹', async ({ browser }) => {
    const page = await newIPhonePage(browser, IPHONE_WECHAT_UA)
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.waitForSelector('.van-dialog:visible')
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('使用提示')
    await expect(page.getByText('您好像是在QQ/微信中打开了AA计算器', { exact: false })).toBeVisible()
    // 微信环境不弹 Safari 专属提示
    await expect(page.getByText('主屏幕入口', { exact: false })).not.toBeVisible()

    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('aa_inapp_hint_shown'))).toBe('1')

    // 共享标记：再打开邀请链接不再弹
    await page.goto('/invite?room_id=00000000-0000-0000-0000-000000000000')
    await page.waitForSelector('.invite-page')
    await page.waitForTimeout(500)
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
  })

  test('iPhone 微信首次打开邀请链接弹提示，之后进首页不再弹', async ({ browser }) => {
    const page = await newIPhonePage(browser, IPHONE_WECHAT_UA)
    await page.goto('/invite?room_id=00000000-0000-0000-0000-000000000000')
    await page.waitForSelector('.invite-page')
    await page.waitForSelector('.van-dialog:visible')
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('使用提示')
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()

    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.waitForTimeout(500)
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
  })

  test('iPhone QQ 首次进首页弹 QQ/微信提示', async ({ browser }) => {
    const page = await newIPhonePage(browser, IPHONE_QQ_UA)
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.waitForSelector('.van-dialog:visible')
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('使用提示')
    await expect(page.getByText('您好像是在QQ/微信中打开了AA计算器', { exact: false })).toBeVisible()
  })

  test('iPhone 其他浏览器（Chrome）什么都不弹', async ({ browser }) => {
    const page = await newIPhonePage(browser, IPHONE_CHROME_UA)
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.waitForTimeout(500)
    await expect(page.locator('.van-dialog:visible')).not.toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('aa_iphone_hint_shown'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('aa_inapp_hint_shown'))).toBeNull()
  })
})
