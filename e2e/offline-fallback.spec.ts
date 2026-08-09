import { test, expect, type Page } from '@playwright/test'

const NICKNAME = '断网回退测试员'

function extractRoomId(url: string): string {
  const m = url.match(/\/room\/([a-f0-9-]+)/)
  return m ? m[1] : ''
}

async function createOnlineRoom(page: Page, roomName: string): Promise<string> {
  await page.goto('/')
  await page.waitForSelector('.home-page')
  await page.locator('.van-nav-bar__right').getByText('新增房间').click()
  await page.waitForSelector('.van-dialog', { state: 'visible' })
  await page.locator('.van-dialog input').nth(0).fill(roomName)
  await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
  await page.locator('.van-dialog .van-button--primary').click()
  await page.waitForSelector('.settings-page', { timeout: 15000 })
  const roomId = extractRoomId(page.url())

  await page.getByText('复制公共邀请链接').click()
  await page.waitForSelector('.van-dialog', { state: 'visible' })
  await page.getByRole('button', { name: '确认转换' }).click()
  await page.waitForTimeout(2500)

  // 访问一次房间详情，确保本地缓存存在且为 online
  await page.goto(`/room/${roomId}`)
  await page.waitForSelector('.room-detail')
  await page.waitForTimeout(1500)
  return roomId
}

async function roomMode(page: Page, roomId: string): Promise<string> {
  return page.evaluate(id => {
    const rooms = JSON.parse(localStorage.getItem('aa_local_rooms_v2') ?? '{}')
    return rooms[id]?.mode ?? ''
  }, roomId)
}

async function expiredRooms(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('aa_expired_rooms') ?? '[]') as string[]
    } catch {
      return []
    }
  })
}

test.describe('在线房间断网回退 E2E', () => {
  test('断网 → 首页离线横幅；打开在线房间显示本地缓存而非转为过期；恢复网络后横幅消失且列表无重复', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
    const roomName = `断网回退-${Date.now()}`
    const roomId = await createOnlineRoom(page, roomName)

    // 模拟后端不可达（应用本身可达，只拦 API）
    await page.route('**/rest/v1/**', route => route.abort())
    await page.goto('/')
    await page.waitForSelector('.home-page')

    // 打开页面时的网络探测（快速重试最多 3 次）失败 → 进入离线模式，首页显示横幅
    await expect(page.locator('.offline-banner')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('网络就绪后请刷新页面', { exact: false })).toBeVisible()

    // 离线打开在线房间：请求快速失败并回退本地缓存，不转为过期
    await page.locator('.van-cell').filter({ hasText: roomName }).click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.getByText('网络异常，正在显示本地缓存（只读）')).toBeVisible({ timeout: 5000 })
    expect(await roomMode(page, roomId)).toBe('online')
    expect(await expiredRooms(page)).toEqual([])

    // 恢复网络 → 刷新页面 → 横幅消失，列表只有一条在线条目
    await page.unroute('**/rest/v1/**')
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await expect(page.locator('.offline-banner')).not.toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500)
    await expect(page.getByText('在线', { exact: true })).toHaveCount(1)
    await expect(page.getByText('过期只读', { exact: true })).toHaveCount(0)
    await expect(page.locator('.van-cell').filter({ hasText: roomName })).toHaveCount(1)
  })

  test('已标记过期的本地缓存：打开房间时自动从服务器恢复在线', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })
    const roomName = `过期恢复-${Date.now()}`
    const roomId = await createOnlineRoom(page, roomName)

    // 模拟修复前留下的损坏状态：本地缓存被标记为过期
    await page.evaluate(id => {
      const rooms = JSON.parse(localStorage.getItem('aa_local_rooms_v2') ?? '{}')
      const room = rooms[id]
      room.mode = 'expired'
      room.owner_id = null
      room.members = room.members.map((m: { user_id: string | null; is_unsubmitted: boolean }) => ({
        ...m,
        user_id: null,
        is_unsubmitted: false,
      }))
      room.updated_at = new Date().toISOString()
      localStorage.setItem('aa_local_rooms_v2', JSON.stringify(rooms))
      localStorage.setItem('aa_expired_rooms', JSON.stringify([id]))
    }, roomId)

    // 联网时首页只显示远端在线条目，不显示本地过期条目
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.waitForTimeout(1500)
    await expect(page.getByText('过期只读', { exact: true })).toHaveCount(0)
    await expect(page.locator('.van-cell').filter({ hasText: roomName })).toHaveCount(1)

    // 打开房间 → 自动恢复在线
    await page.locator('.van-cell').filter({ hasText: roomName }).click()
    await page.waitForSelector('.room-detail', { timeout: 15000 })
    await page.waitForTimeout(2000)
    expect(await roomMode(page, roomId)).toBe('online')
    expect(await expiredRooms(page)).toEqual([])
    await expect(page.getByText('房间已过期', { exact: false })).not.toBeVisible()
  })
})
