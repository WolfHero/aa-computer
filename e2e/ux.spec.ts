import { test, expect, type Page } from '@playwright/test'

const NICKNAME = 'UX测试员'

function extractRoomId(url: string): string {
  const m = url.match(/\/room\/([a-f0-9-]+)/)
  return m ? m[1] : ''
}

async function stubClipboardFail(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      get: () => ({ writeText: () => Promise.reject(new Error('clipboard permission denied')) }),
      configurable: true,
    })
  })
}

async function createLocalRoom(page: Page, roomName: string): Promise<string> {
  await page.goto('/')
  await page.waitForSelector('.home-page')
  await page.locator('.van-nav-bar__right').getByText('新增房间').click()
  await page.waitForSelector('.van-dialog', { state: 'visible' })
  await page.locator('.van-dialog input').nth(0).fill(roomName)
  await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
  await page.locator('.van-dialog .van-button--primary').click()
  await page.waitForSelector('.settings-page', { timeout: 15000 })
  return extractRoomId(page.url())
}

async function addBill(page: Page, content: string, amount: string) {
  await page.locator('.van-nav-bar__left').click()
  await page.waitForSelector('.room-detail', { timeout: 10000 })
  await page.waitForTimeout(800)
  await page.locator('.van-nav-bar__right').getByText('新增').click()
  await page.waitForSelector('.van-dialog', { state: 'visible' })
  await page.locator('.van-dialog input').nth(0).fill(content)
  await page.locator('.van-dialog input').nth(1).fill(amount)
  const checkboxes = page.locator('.van-dialog .van-checkbox__label')
  for (let i = 0; i < await checkboxes.count(); i++) {
    await checkboxes.nth(i).click()
  }
  await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
  await expect(page.getByText(content)).toBeVisible({ timeout: 20000 })
}

async function convertToOnline(page: Page) {
  await page.goto(`/room/${extractRoomId(page.url())}/settings`)
  await page.waitForSelector('.settings-page', { timeout: 10000 })
  await page.getByText('复制公共邀请链接').click()
  await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 5000 })
  await page.getByRole('button', { name: '确认转换' }).click()
  await page.waitForTimeout(2500)
}

test.describe('复制失败手动复制弹窗 E2E', () => {
  test.beforeEach(({ page }) => {
    page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
  })

  test('复制公共邀请链接失败 → 弹出可手动复制的链接弹窗，关闭后可继续操作', async ({ page }) => {
    await stubClipboardFail(page)
    const roomName = `UX-复制-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)

    await page.getByText('复制公共邀请链接').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.getByRole('button', { name: '确认转换' }).click()
    await page.waitForTimeout(2500)

    await page.waitForSelector('.copy-link-dialog', { state: 'visible' })
    await expect(page.locator('.copy-link-dialog .van-dialog__header')).toContainText('复制失败')
    await expect(page.locator('.copy-link-dialog .link-box')).toContainText(`/invite?room_id=${roomId}`)

    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.copy-link-dialog')).not.toBeVisible()

    // 弹窗关闭后页面操作不再被拦截
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 3000 })
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('添加成员')
  })

  test('复制匿名账号登录凭证失败 → 弹出可手动复制的凭证弹窗', async ({ page }) => {
    const roomName = `UX-凭证-${Date.now()}`
    await createLocalRoom(page, roomName)
    await convertToOnline(page)

    await stubClipboardFail(page)
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.locator('.van-action-sheet').getByText('登录当前匿名账号到其他浏览器').click()

    await page.waitForSelector('.copy-link-dialog', { state: 'visible' })
    await expect(page.locator('.copy-link-dialog .van-dialog__header')).toContainText('复制失败')
    const tokenText = await page.locator('.copy-link-dialog .link-box').textContent()
    expect(tokenText!.trim().length).toBeGreaterThan(0)
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.copy-link-dialog')).not.toBeVisible()
  })

  test('房间详情菜单复制公共邀请链接失败 → 弹出可手动复制的链接弹窗', async ({ page }) => {
    const roomName = `UX-菜单-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await convertToOnline(page)

    await stubClipboardFail(page)
    await page.goto(`/room/${roomId}`)
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.locator('.van-action-sheet').getByText('复制公共邀请链接').click()

    await page.waitForSelector('.copy-link-dialog', { state: 'visible' })
    await expect(page.locator('.copy-link-dialog .van-dialog__header')).toContainText('复制失败')
    await expect(page.locator('.copy-link-dialog .link-box')).toContainText(`/invite?room_id=${roomId}`)
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.copy-link-dialog')).not.toBeVisible()
  })

  test('成员专属邀请链接复制失败 → 弹出可手动复制的链接弹窗', async ({ page }) => {
    const roomName = `UX-专属-${Date.now()}`
    await createLocalRoom(page, roomName)
    await convertToOnline(page)

    await stubClipboardFail(page)
    await page.goto(`/room/${extractRoomId(page.url())}/settings`)
    await page.waitForSelector('.settings-page', { timeout: 10000 })

    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog .van-field__control').fill('专属成员')
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    await page.locator('.van-cell').filter({ hasText: '专属成员' }).locator('.van-icon-link-o').click()
    await page.waitForSelector('.copy-link-dialog', { state: 'visible' })
    await expect(page.locator('.copy-link-dialog .van-dialog__header')).toContainText('复制失败')
    await expect(page.locator('.copy-link-dialog .dialog-message')).toContainText('专属成员')
    await expect(page.locator('.copy-link-dialog .link-box')).toContainText('/invite/member?token=')
    await page.getByRole('button', { name: '知道了', exact: true }).click()
    await expect(page.locator('.copy-link-dialog')).not.toBeVisible()
  })
})

test.describe('接受邀请加入房间 E2E', () => {
  test('粘贴完整邀请链接 → 跳转到加入页并显示房间信息', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
    const roomName = `UX-邀请-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await convertToOnline(page)

    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.locator('.van-action-sheet').getByText('接受邀请加入房间').click()

    await page.waitForSelector('.van-dialog:visible')
    await expect(page.locator('.van-dialog:visible .van-dialog__header')).toContainText('加入房间')
    await page.locator('.van-dialog .van-field__control').fill(`http://localhost:5173/invite?room_id=${roomId}`)
    await page.getByRole('button', { name: '加入', exact: true }).click()

    await page.waitForSelector('.invite-page', { timeout: 10000 })
    await expect(page.locator('.room-name')).toContainText(roomName)
    await expect(page.locator('.room-creator')).toContainText('创建人')
  })
})

test.describe('首页 UI 细节 E2E', () => {
  test('设置菜单没有取消按钮', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await expect(page.locator('.van-action-sheet').getByText('取消', { exact: true })).toHaveCount(0)
  })

  test('只有一个房间时列表容器仍占满剩余高度，保证可下拉刷新', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
    await createLocalRoom(page, `UX-高度-${Date.now()}`)
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.waitForSelector('.van-cell', { timeout: 10000 })

    const { containerHeight, viewportHeight } = await page.evaluate(() => {
      const el = document.querySelector('.van-pull-refresh')
      return {
        containerHeight: el ? el.getBoundingClientRect().height : 0,
        viewportHeight: window.innerHeight,
      }
    })
    expect(containerHeight).toBeGreaterThanOrEqual(viewportHeight - 100)
  })
})

test.describe('在线房间账单加载态 E2E', () => {
  test('进入在线房间加载账单时显示 loading，不闪现「暂无账单记录」', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
    const roomName = `UX-加载-${Date.now()}`
    const billContent = `UX账单${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await addBill(page, billContent, '12.5')
    await convertToOnline(page)

    // 延迟 Supabase 请求，让加载态可被观测（覆盖房间信息与账单两种请求）
    await page.route('**/rest/v1/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.goto(`/room/${roomId}`)
    await page.waitForSelector('.room-detail')

    await expect(page.locator('.bill-loading-state')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('暂无账单记录')).not.toBeVisible()
    await expect(page.getByText(billContent)).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.bill-loading-state')).not.toBeVisible()
  })
})
