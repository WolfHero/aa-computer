import { test, expect } from '@playwright/test'

// PWA 验证针对生产构建：先运行 pnpm build && pnpm preview --port 4173 --strictPort
test.use({ baseURL: 'http://localhost:4173' })

const NICKNAME = 'PWA测试员'
const LOCAL_ROOM_ID = `e2e-pwa-${Date.now()}`
const LOCAL_ROOM_NAME = `PWA本地房间 ${Date.now()}`

function buildSeedScript() {
  return `
(() => {
  localStorage.setItem('aa_privacy_accepted', '1')
  localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
    ["${LOCAL_ROOM_ID}"]: {
      id: "${LOCAL_ROOM_ID}",
      name: "${LOCAL_ROOM_NAME}",
      description: "仅存于本地的 PWA 测试房间",
      version: 1,
      created_at: "2026-08-04T08:00:00.000Z",
      updated_at: "2026-08-04T08:00:00.000Z",
      settings: {},
      owner_id: null,
      mode: "local",
      self_member_id: "member-1",
      members: [
        { id: "member-1", name: "${NICKNAME}", user_id: null, is_unsubmitted: false, created_at: "2026-08-04T08:00:00.000Z" },
      ],
    },
  }))
  localStorage.setItem('aa_local_bills_v2', JSON.stringify({
    ["${LOCAL_ROOM_ID}"]: [
      {
        local_id: "bill-1",
        room_id: "${LOCAL_ROOM_ID}",
        content: "PWA 离线测试账单",
        amount: 66.6,
        paid_at: "2026-08-04T08:00:00+0800",
        shared_by: ["member-1"],
        created_by: "member-1",
        creator_name: "${NICKNAME}",
        created_at: "2026-08-04T08:00:00.000Z",
        synced: false,
      },
    ],
  }))
})()
`
}

test.describe('PWA 安装与离线访问', () => {
  let previewUp = false

  test.beforeAll(async () => {
    try {
      const res = await fetch('http://localhost:4173/', {
        signal: AbortSignal.timeout(3000),
      })
      previewUp = res.ok
    } catch {
      previewUp = false
    }
    test.skip(!previewUp, '未检测到 preview 服务，请先运行 pnpm build && pnpm preview --port 4173 --strictPort')
  })

  test('manifest 可用，SW 注册后断网仍能打开应用并显示本地房间', async ({ page, context }) => {
    await context.addInitScript(buildSeedScript())

    const manifestResponse = await page.request.get('/manifest.webmanifest')
    expect(manifestResponse.status()).toBe(200)
    expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json')

    await page.goto('/')
    await expect(page.getByText(LOCAL_ROOM_NAME)).toBeVisible()

    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText(LOCAL_ROOM_NAME)).toBeVisible()
    await context.setOffline(false)
  })

  test('断网后本地房间仍可新增/编辑账单并本地计算 AA', async ({ page, context }) => {
    const roomId = `e2e-pwa-offline-${Date.now()}`
    const roomName = `PWA离线操作 ${Date.now()}`
    const billContent = `离线新增账单 ${Date.now()}`
    const editedContent = `离线编辑账单 ${Date.now()}`

    await context.addInitScript(({ rid, rname }) => {
      localStorage.setItem('aa_privacy_accepted', '1')
      localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
        [rid]: {
          id: rid,
          name: rname,
          description: 'PWA 离线操作测试房间',
          version: 1,
          owner_id: null,
          mode: 'local',
          self_member_id: 'member-1',
          settings: {},
          created_at: '2026-08-04T08:00:00.000Z',
          updated_at: '2026-08-04T08:00:00.000Z',
          members: [
            { id: 'member-1', name: '测试员', user_id: null, is_unsubmitted: false, created_at: '2026-08-04T08:00:00.000Z' },
            { id: 'member-2', name: '朋友', user_id: null, is_unsubmitted: false, created_at: '2026-08-04T08:00:00.000Z' },
          ],
        },
      }))
      localStorage.setItem('aa_local_bills_v2', JSON.stringify({ [rid]: [] }))
    }, { rid: roomId, rname: roomName })

    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText(roomName)).toBeVisible()

    // 断网新增成员
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page')
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog .van-field__control').fill('离线成员')
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(800)
    await expect(page.getByText('离线成员')).toBeVisible()
    await page.locator('.van-nav-bar__left').click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })

    // 断网新增账单
    await page.locator('.van-nav-bar__right').getByText('新增').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(billContent)
    await page.locator('.van-dialog input').nth(1).fill('90')
    const checkboxes = page.locator('.van-dialog .van-checkbox__label')
    for (let i = 0; i < await checkboxes.count(); i++) {
      await checkboxes.nth(i).click()
    }
    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await expect(page.getByText(billContent)).toBeVisible({ timeout: 20000 })

    // 断网编辑账单
    await page.locator('.bill-item').filter({ hasText: billContent }).click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    const contentInput = page.locator('.van-dialog input').nth(0)
    await contentInput.clear()
    await contentInput.fill(editedContent)
    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await expect(page.getByText(editedContent)).toBeVisible({ timeout: 20000 })

    // 断网本地 AA 计算
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('计算AA').click()
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(2500)
    await expect(page.locator('.aa-summary')).toBeVisible()
    const cached = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_aa_v2')
      return raw ? JSON.parse(raw)[rid] ?? null : null
    }, roomId)
    expect(cached).not.toBeNull()
    expect(cached.version).toBeGreaterThanOrEqual(2)

    await context.setOffline(false)
  })
})
