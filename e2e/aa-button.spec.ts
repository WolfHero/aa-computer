import { test, expect, type Page } from '@playwright/test'

const NICKNAME = 'AA按钮测试员'

function extractRoomId(url: string): string {
  const m = url.match(/\/room\/([a-f0-9-]+)/)
  return m ? m[1] : ''
}

async function createLocalRoom(page: Page, roomName: string) {
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

async function addMember(page: Page, name: string) {
  await page.getByText('添加成员').click()
  await page.waitForSelector('.van-dialog', { state: 'visible' })
  await page.locator('.van-dialog .van-field__control').fill(name)
  await page.getByRole('button', { name: '确认' }).click()
  await page.waitForTimeout(800)
}

async function goToRoomDetail(page: Page, roomId: string) {
  await page.goto(`/room/${roomId}`)
  await page.waitForSelector('.room-detail', { timeout: 10000 })
}

test.describe('房间详情页计算AA按钮 E2E', () => {
  test.beforeEach(({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`  [page error] ${msg.text()}`)
    })
    page.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
  })

  test('空账单房间：点击计算AA 弹出「请先添加账单」', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `AA按钮-空-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    expect(roomId).toBeTruthy()

    await goToRoomDetail(page, roomId)

    // 常驻按钮可见
    const aaBtn = page.locator('.calculate-aa-btn')
    await expect(aaBtn).toBeVisible()
    await expect(aaBtn).toContainText('计算AA')

    // 空房间点击 → toast，且不跳转
    await aaBtn.click()
    await expect(page.getByText('请先添加账单')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.room-detail')).toBeVisible()
  })

  test('房间菜单中不再包含「计算AA」', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `AA按钮-菜单-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await goToRoomDetail(page, roomId)

    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await expect(page.locator('.van-action-sheet').getByText('计算AA')).toHaveCount(0)
    await expect(page.locator('.van-action-sheet').getByText('房间设置')).toBeVisible()
  })

  test('有账单时：点击计算AA 跳转 AA 页面并展示结果', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `AA按钮-有账单-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await addMember(page, '朋友B')
    await goToRoomDetail(page, roomId)

    const billContent = `AA按钮账单 ${Date.now()}`
    await page.locator('.van-nav-bar__right').getByText('新增').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(billContent)
    await page.locator('.van-dialog input').nth(1).fill('88')
    const checkboxes = page.locator('.van-dialog .van-checkbox__label')
    for (let i = 0; i < await checkboxes.count(); i++) {
      await checkboxes.nth(i).click()
    }
    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await expect(page.getByText(billContent)).toBeVisible({ timeout: 20000 })

    // 点击常驻按钮 → AA 页面
    await page.locator('.calculate-aa-btn').click()
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(2500)
    await expect(page.locator('.aa-summary')).toBeVisible()
  })
})
