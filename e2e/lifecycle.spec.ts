import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const NICKNAME = '生命周期测试员'

async function adminFetch(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`adminFetch ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function adminRpc(functionName: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`adminRpc ${functionName} → ${res.status} ${await res.text()}`)
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

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
  await page.locator('.add-member').click()
  await page.waitForSelector('.van-dialog:visible')
  await page.locator('.van-dialog .van-field__control').fill(name)
  await page.getByRole('button', { name: '确认' }).click()
  await page.waitForTimeout(800)
}

async function addBillSharedByAll(page: Page, content: string, amount: string) {
  await page.locator('.van-nav-bar__left').click()
  await page.waitForSelector('.room-detail', { timeout: 10000 })
  await page.waitForTimeout(800)
  await page.locator('.van-nav-bar__right').getByText('新增').click()
  await page.waitForSelector('.van-dialog:visible')
  await page.locator('.van-dialog input').nth(0).fill(content)
  await page.locator('.van-dialog input').nth(1).fill(amount)
  const checkboxes = page.locator('.van-dialog .van-checkbox__label')
  for (let i = 0; i < await checkboxes.count(); i++) {
    await checkboxes.nth(i).click()
  }
  await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
  await expect(page.getByText(content)).toBeVisible({ timeout: 20000 })
}

async function convertToOnline(page: Page, roomId: string) {
  await page.goto(`/room/${roomId}/settings`)
  await page.waitForSelector('.settings-page')
  await page.getByText('复制公共邀请链接').click()
  await page.waitForSelector('.van-dialog:visible')
  await page.getByRole('button', { name: '确认转换' }).click()
  await page.waitForTimeout(3000)
}

test.describe('生命周期与真实使用场景 E2E', () => {
  test('双用户：房主转在线后，第二位用户通过公共邀请加入并看到账单', async ({ browser }) => {
    const contextA: BrowserContext = await browser.newContext()
    const pageA = await contextA.newPage()
    await pageA.addInitScript(() => localStorage.setItem('aa_privacy_accepted', '1'))

    const roomName = `双用户房间-${Date.now()}`
    const roomId = await createLocalRoom(pageA, roomName)
    const billContent = `双用户账单 ${Date.now()}`
    await addBillSharedByAll(pageA, billContent, '55')
    await convertToOnline(pageA, roomId)

    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    await pageB.addInitScript(() => localStorage.setItem('aa_privacy_accepted', '1'))
    await pageB.goto(`/invite?room_id=${roomId}`)
    await pageB.waitForSelector('.invite-page')
    await pageB.locator('.van-field__control').fill(`新成员-${Date.now()}`)
    await pageB.getByRole('button', { name: '加入房间' }).click()
    await pageB.waitForSelector('.room-detail', { timeout: 15000 })
    await expect(pageB.getByText(billContent)).toBeVisible({ timeout: 20000 })

    await pageB.goto('/')
    await pageB.waitForSelector('.home-page')
    const cell = pageB.locator('.van-cell').filter({ hasText: roomName })
    await expect(cell).toBeVisible()
    await expect(cell.locator('.online-badge')).toBeVisible()

    await contextA.close()
    await contextB.close()
  })

  test('服务端删除房间 → 本地回退过期只读 → 重建本地 → 再次转在线', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aa_privacy_accepted', '1'))

    const roomName = `过期重建循环-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    const billContent = `循环账单 ${Date.now()}`
    await addBillSharedByAll(page, billContent, '30')
    await convertToOnline(page, roomId)

    // 服务端整房删除，模拟 7 天清理
    await adminRpc('delete_room', { p_room_id: roomId })
    expect(await adminFetch(`rooms?id=eq.${roomId}&select=id`)).toHaveLength(0)

    // 再次进入 → 过期只读
    await page.goto(`/room/${roomId}`)
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.locator('.expired-banner')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(billContent)).toBeVisible()
    await expect(page.locator('.van-nav-bar__right').getByText('新增')).not.toBeVisible()

    // 重建为本地房间
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('重建为本地房间').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog:visible .van-dialog__confirm').click()
    await page.waitForSelector('.local-banner', { timeout: 10000 })
    const newId = extractRoomId(page.url())
    expect(newId).not.toBe(roomId)
    await expect(page.getByText(billContent)).toBeVisible()

    // 重建后的本地房间再次转在线
    await convertToOnline(page, newId)
    const rooms = await adminFetch(`rooms?id=eq.${newId}&select=id,owner_id`)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].owner_id).toBeTruthy()
    expect(await adminFetch(`bills?room_id=eq.${newId}&select=id`)).toHaveLength(1)
  })

  test('本地成员：增改删 + 被账单引用的成员不可删除', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aa_privacy_accepted', '1'))

    const roomName = `成员管理-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await addMember(page, '张三')
    await addMember(page, '李四')

    // 本地房间：自己不能生成专属邀请链接，未绑定成员可以
    const selfCell = page.locator('.van-cell').filter({ hasText: NICKNAME })
    await expect(selfCell.locator('.van-icon-link-o')).toHaveCount(0)
    const zhangLinkCell = page.locator('.van-cell').filter({ hasText: '张三' })
    await expect(zhangLinkCell.locator('.van-icon-link-o')).toHaveCount(1)

    // 添加引用张三的账单（分摊含张三）
    await page.locator('.van-nav-bar__left').click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await page.locator('.van-nav-bar__right').getByText('新增').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog input').nth(0).fill('引用账单')
    await page.locator('.van-dialog input').nth(1).fill('20')
    await page.locator('.van-dialog .van-checkbox__label').filter({ hasText: '张三' }).click()
    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await expect(page.getByText('引用账单')).toBeVisible()

    // 改昵称
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page')
    const zhangCell = page.locator('.van-cell').filter({ hasText: '张三' })
    await zhangCell.locator('.van-icon-edit').click()
    await page.waitForSelector('.van-dialog:visible')
    const nameInput = page.locator('.van-dialog .van-field__control')
    await nameInput.clear()
    await nameInput.fill('张三改名')
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(800)
    await expect(page.getByText('张三改名')).toBeVisible()

    // 被引用成员不可删除
    const renamedCell = page.locator('.van-cell').filter({ hasText: '张三改名' })
    await renamedCell.locator('.van-icon-delete-o').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog:visible .van-dialog__confirm').click()
    await expect(page.getByText('该成员已被账单引用，无法删除')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('张三改名', { exact: true })).toBeVisible()

    // 未引用成员可删除
    const liCell = page.locator('.van-cell').filter({ hasText: '李四' })
    await liCell.locator('.van-icon-delete-o').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog:visible .van-dialog__confirm').click()
    await page.waitForTimeout(800)
    await expect(page.getByText('李四')).not.toBeVisible()
  })

  test('导入：同 id 本地房间覆盖成功；与在线房间冲突被拒绝', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('aa_privacy_accepted', '1'))

    // 房间 A：导出 → 修改账单内容 → 同 id 导入覆盖
    const roomNameA = `覆盖房间-${Date.now()}`
    const roomIdA = await createLocalRoom(page, roomNameA)
    await addBillSharedByAll(page, '旧账单', '10')
    await page.goto(`/room/${roomIdA}/settings`)
    await page.waitForSelector('.settings-page')

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('导出本地房间').click()
    const download = await downloadPromise
    const filePath = await download.path()
    const exported = JSON.parse(fs.readFileSync(filePath!, 'utf-8'))
    exported.bills[0].content = '覆盖后账单'

    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('导入本地房间').click()
    await page.setInputFiles('input[type=file]', {
      name: 'overwrite.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    })
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog:visible .van-dialog__confirm').click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.getByText('覆盖后账单')).toBeVisible()
    await expect(page.getByText('旧账单')).not.toBeVisible()

    // 房间 B：转在线后，同 id 导入被拒绝
    const roomNameB = `冲突房间-${Date.now()}`
    const roomIdB = await createLocalRoom(page, roomNameB)
    await convertToOnline(page, roomIdB)

    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('导入本地房间').click()
    const conflictFile = {
      format: 'aa-local-room',
      version: 1,
      exported_at: new Date().toISOString(),
      room: {
        id: roomIdB,
        name: '冲突房间',
        description: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        settings: {},
        version: 1,
        owner_id: null,
        mode: 'local',
        self_member_id: crypto.randomUUID(),
        members: [],
      },
      bills: [],
    }
    await page.setInputFiles('input[type=file]', {
      name: 'conflict.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conflictFile)),
    })
    await expect(page.getByText('备份的房间 id 与在线/过期房间冲突，无法导入')).toBeVisible({ timeout: 5000 })
  })

  test('v1 旧缓存：可迁移为本地房间；也可暂不迁移保持只读', async ({ page }) => {
    const legacyId1 = crypto.randomUUID()
    const legacyId2 = crypto.randomUUID()
    const legacyName1 = `旧缓存迁移-${Date.now()}`
    const legacyName2 = `旧缓存只读-${Date.now()}`

    await page.addInitScript(({ id1, id2, name1, name2 }) => {
      if (sessionStorage.getItem('aa-legacy-seeded')) return
      sessionStorage.setItem('aa-legacy-seeded', '1')
      localStorage.setItem('aa_privacy_accepted', '1')
      localStorage.setItem('aa_cached_rooms', JSON.stringify({
        [id1]: {
          id: id1,
          name: name1,
          description: '旧缓存房间1',
          version: 2,
          owner_id: 'old-owner',
          created_at: '2026-06-01T08:00:00.000Z',
          updated_at: '2026-06-01T08:00:00.000Z',
          members: [
            { id: 'old-member-1', name: '旧成员', user_id: 'old-owner', is_unsubmitted: false, created_at: '2026-06-01T08:00:00.000Z' },
          ],
        },
        [id2]: {
          id: id2,
          name: name2,
          description: '旧缓存房间2',
          version: 1,
          owner_id: 'old-owner',
          created_at: '2026-06-01T08:00:00.000Z',
          updated_at: '2026-06-01T08:00:00.000Z',
          members: [
            { id: 'old-member-2', name: '只读成员', user_id: 'old-owner', is_unsubmitted: false, created_at: '2026-06-01T08:00:00.000Z' },
          ],
        },
      }))
      localStorage.setItem('aa_local_bills', JSON.stringify({
        [id1]: [{
          local_id: 'old-bill-1',
          room_id: id1,
          content: '旧缓存账单',
          amount: 12,
          paid_at: '2026-06-01T08:00:00+0800',
          shared_by: ['old-member-1'],
          created_by: 'old-member-1',
          creator_name: '旧成员',
          created_at: '2026-06-01T08:00:00.000Z',
          synced: false,
        }],
      }))
      localStorage.setItem('aa_expired_rooms', JSON.stringify([id1, id2]))
      localStorage.setItem('aa_room_versions', JSON.stringify({ [id1]: 2, [id2]: 1 }))
    }, { id1: legacyId1, id2: legacyId2, name1: legacyName1, name2: legacyName2 })

    // 迁移第一个旧房间
    await page.goto(`/room/${legacyId1}`)
    await page.waitForSelector('.van-dialog:visible', { timeout: 10000 })
    await page.getByRole('button', { name: '迁移', exact: true }).click()
    await page.waitForSelector('.local-banner', { timeout: 10000 })
    await expect(page.getByText('旧缓存账单')).toBeVisible()
    await expect(page.locator('.van-nav-bar__right').getByText('新增')).toBeVisible()

    const migrated = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_rooms_v2')
      const room = raw ? (JSON.parse(raw)[rid] ?? null) : null
      const legacyRooms = JSON.parse(localStorage.getItem('aa_cached_rooms') || '{}')
      return { mode: room?.mode, selfMemberId: room?.self_member_id, legacyStillThere: rid in legacyRooms }
    }, legacyId1)
    expect(migrated.mode).toBe('local')
    expect(migrated.selfMemberId).toBeTruthy()
    expect(migrated.legacyStillThere).toBe(false)

    // 暂不迁移第二个旧房间 → 只读
    await page.goto(`/room/${legacyId2}`)
    await page.waitForSelector('.van-dialog:visible', { timeout: 10000 })
    await page.getByRole('button', { name: '暂不迁移' }).click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.getByText('旧版本地数据（只读）')).toBeVisible()
    await expect(page.locator('.van-nav-bar__right').getByText('新增')).not.toBeVisible()
  })
})
