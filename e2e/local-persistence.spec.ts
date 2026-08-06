import { test, expect } from '@playwright/test'

const NICKNAME = 'E2E测试员'
const LOCAL_ROOM_ID = `e2e-local-${Date.now()}`
const LOCAL_ROOM_NAME = `本地房间 ${Date.now()}`

function buildSeedScript(
  roomId: string,
  roomName: string,
  nickname: string,
  mode: 'local' | 'expired' = 'local',
) {
  return `
(() => {
  localStorage.setItem('aa_privacy_accepted', '1')
  localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
    ["${roomId}"]: {
      id: "${roomId}",
      name: "${roomName}",
      description: "仅存于本地的过期房间",
      version: 1,
      created_at: "2026-05-27T08:00:00.000Z",
      updated_at: "2026-05-27T08:00:00.000Z",
      settings: {},
      owner_id: null,
      mode: "${mode}",
      self_member_id: "member-1",
      members: [
        { id: "member-1", name: "${nickname}", user_id: null, is_unsubmitted: false, created_at: "2026-05-27T08:00:00.000Z" },
      ],
    },
  }))
  localStorage.setItem('aa_local_bills_v2', JSON.stringify({
    ["${roomId}"]: [
      {
        local_id: "bill-1",
        room_id: "${roomId}",
        content: "本地测试账单内容",
        amount: 88.5,
        paid_at: "2026-05-27T08:00:00+0800",
        shared_by: ["member-1"],
        created_by: "member-1",
        creator_name: "${nickname}",
        created_at: "2026-05-27T08:00:00.000Z",
        synced: false,
      },
    ],
  }))
})()
`
}

test.describe('local-room-persistence 完整设计验证', () => {
  test.beforeEach(({ page }) => {
    page.on('console', msg => console.log(`  [console:${msg.type()}] ${msg.text()}`))
    page.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
  })

  // ====================================================================
  // 测试 1：基础流程（需要后端协作）
  // 覆盖：创建房间 → 增/删/改账单 → 筛选 → 设置页
  // ====================================================================
  test('流程1: 创建房间 → 账单 CRUD → 筛选 → 设置页', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `E2E房间 ${Date.now()}`

    await test.step('创建房间', async () => {
      await page.goto('/')
      await page.waitForSelector('.home-page')

      await page.locator('.van-nav-bar__right').getByText('新增房间').click()
      await page.waitForSelector('.van-dialog', { state: 'visible' })

      await page.locator('.van-dialog input').nth(0).fill(roomName)
      await page.locator('.van-dialog textarea').fill('由 Playwright E2E 自动创建')
      await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
      await page.locator('.van-dialog .van-button--primary').click()

      // 创建成功后直接跳转到设置页，使用返回按钮回到房间详情
      await page.waitForSelector('.settings-page', { timeout: 15000 })
      await page.locator('.van-nav-bar__left').click()
      await page.waitForSelector('.room-detail', { timeout: 10000 })
      await page.waitForTimeout(1500)
    })

    const bill1Content = `午餐 ${Date.now()}`
    const bill2Content = `晚餐 ${Date.now()}`

    await test.step('添加两条账单', async () => {

      // 第一条
      await page.locator('.van-nav-bar__right').getByText('新增').click()
      await page.waitForSelector('.van-dialog', { state: 'visible' })
      await page.locator('.van-dialog input').nth(0).fill(bill1Content)
      await page.locator('.van-dialog input').nth(1).fill('100')
      await page.locator('.van-checkbox__label').filter({ hasText: NICKNAME }).click()
      await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
      await expect(page.getByText(bill1Content)).toBeVisible({ timeout: 20000 })

      // 第二条
      await page.locator('.van-nav-bar__right').getByText('新增').click()
      await page.waitForSelector('.van-dialog', { state: 'visible' })
      await page.locator('.van-dialog input').nth(0).fill(bill2Content)
      await page.locator('.van-dialog input').nth(1).fill('200')
      await page.locator('.van-checkbox__label').filter({ hasText: NICKNAME }).click()
      await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
      await expect(page.getByText(bill2Content)).toBeVisible({ timeout: 20000 })
    })

    await test.step('按内容搜索筛选', async () => {
      const searchInput = page.locator('input[placeholder="搜索付款内容"]')
      await searchInput.fill('午餐')
      await page.waitForTimeout(2000)
      await expect(page.getByText(bill1Content)).toBeVisible()
      await searchInput.fill('')
      await page.waitForTimeout(2000)
    })

    await test.step('编辑账单内容', async () => {
      const editedContent = `更新午餐 ${Date.now()}`
      await page.locator('.bill-item').filter({ hasText: bill1Content }).click()
      await page.waitForSelector('.van-dialog', { state: 'visible' })
      const input = page.locator('.van-dialog input').nth(0)
      await input.clear()
      await input.fill(editedContent)
      await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
      await expect(page.getByText(editedContent)).toBeVisible({ timeout: 20000 })
    })

    await test.step('删除账单', async () => {
      await page.locator('.bill-item').filter({ hasText: bill2Content }).click()
      await page.waitForSelector('.van-dialog', { state: 'visible' })
      await page.getByText('删除').click()
      await page.waitForSelector('.van-dialog__confirm', { state: 'visible', timeout: 5000 })
      await page.locator('.van-dialog__confirm').click()
      await page.waitForTimeout(2000)
      await expect(page.locator('.bill-item').filter({ hasText: bill2Content })).toHaveCount(0)
    })

    await test.step('房间设置页面', async () => {
      await page.locator('.van-nav-bar__right').getByText('菜单').click()
      await page.waitForSelector('.van-action-sheet', { state: 'visible' })
      await page.getByText('房间设置').click()
      await page.waitForSelector('.settings-page', { state: 'visible' })
      await expect(page.getByText(roomName)).toBeVisible()
      await expect(page.getByText(NICKNAME)).toBeVisible()
      await expect(page.getByText('你')).toBeVisible()
      await expect(page.getByText('复制公共邀请链接')).toBeVisible()
    })
  })

  // ====================================================================
  // 测试 2：本地房间持久化
  // 设计规格：首页房间列表 = 本地 + 后端返回去重，本地房间带标记
  // ====================================================================
  test('流程2: 本地房间在首页显示并标记为本地', async ({ page }) => {
    await page.addInitScript(buildSeedScript(LOCAL_ROOM_ID, LOCAL_ROOM_NAME, NICKNAME, 'local'))

    await page.goto('/')
    await page.waitForSelector('.home-page')

    // 本地房间出现在列表中
    await expect(page.getByText(LOCAL_ROOM_NAME)).toBeVisible({ timeout: 15000 })

    // 验证「本地」标记可见
    const badgeLocator = page.locator('.van-cell').filter({ hasText: LOCAL_ROOM_NAME })
      .locator('.local-badge')
    await expect(badgeLocator).toBeVisible({ timeout: 5000 })
  })

  // ====================================================================
  // 测试 3：过期房间只读模式
  // 设计规格：点击本地房间 → 过期横幅 → 可查看不可新增/编辑
  // ====================================================================
  test('流程3: 过期房间只读模式 · 可查看不可修改', async ({ page }) => {
    await page.addInitScript(buildSeedScript(LOCAL_ROOM_ID, LOCAL_ROOM_NAME, NICKNAME, 'expired'))

    // 直接导航到房间页面
    await page.goto(`/room/${LOCAL_ROOM_ID}`)
    await page.waitForSelector('.room-detail', { timeout: 10000 })

    // 验证过期横幅
    const expiredBanner = page.locator('.expired-banner')
    await expect(expiredBanner).toBeVisible({ timeout: 10000 })
    await expect(expiredBanner).toContainText('房间已过期')

    // 验证本地账单可见
    await expect(page.getByText('本地测试账单内容')).toBeVisible()

    // 验证没有「新增」按钮（只读）
    await expect(page.locator('.van-nav-bar__right').getByText('新增')).not.toBeVisible()
  })

  // ====================================================================
  // 测试 4：删除本地房间
  // 设计规格：设置页有删除按钮 → 确认弹窗 → 房间从列表消失
  // ====================================================================
  test('流程4: 从设置页删除本地房间', async ({ page }) => {
    await page.addInitScript(buildSeedScript(LOCAL_ROOM_ID, LOCAL_ROOM_NAME, NICKNAME, 'local'))

    // 直接导航到房间页面
    await page.goto(`/room/${LOCAL_ROOM_ID}`)
    await page.waitForSelector('.room-detail', { timeout: 10000 })

    // 打开菜单 → 房间设置
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('房间设置').click()
    await page.waitForURL(`/room/${LOCAL_ROOM_ID}/settings`, { timeout: 5000 })
    await page.waitForSelector('.settings-page', { state: 'visible' })

    // 点击「删除本地数据」
    const deleteBtn = page.getByText('删除本地数据')
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    // 确认弹窗
    await page.waitForSelector('.van-dialog__confirm', { state: 'visible', timeout: 5000 })
    await page.locator('.van-dialog__confirm').click()

    // 等待重定向回首页
    await page.waitForURL('/', { timeout: 5000 })
    await expect(page.getByText(LOCAL_ROOM_NAME)).not.toBeVisible()
  })
})
