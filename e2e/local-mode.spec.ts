import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const NICKNAME = '本地模式测试员'

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
  return res.json()
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
  await page.getByText('添加成员').click()
  await page.waitForSelector('.van-dialog', { state: 'visible' })
  await page.locator('.van-dialog .van-field__control').fill(name)
  await page.getByRole('button', { name: '确认' }).click()
  await page.waitForTimeout(800)
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

async function addBillWithPayer(page: Page, content: string, amount: string, payerName: string) {
  await page.locator('.van-nav-bar__left').click()
  await page.waitForSelector('.room-detail', { timeout: 10000 })
  await page.waitForTimeout(800)
  await page.locator('.van-nav-bar__right').getByText('新增').click()
  await page.waitForSelector('.van-dialog:visible')
  await page.locator('.van-dialog input').nth(0).fill(content)
  await page.locator('.van-dialog input').nth(1).fill(amount)

  // 选择付款人
  await page.locator('.van-dialog .van-field').filter({ hasText: '付款人' }).click()
  await page.waitForSelector('.van-action-sheet', { state: 'visible' })
  await page.locator('.van-action-sheet').getByText(payerName).click()

  const checkboxes = page.locator('.van-dialog .van-checkbox__label')
  for (let i = 0; i < await checkboxes.count(); i++) {
    await checkboxes.nth(i).click()
  }
  await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
  await expect(page.getByText(content)).toBeVisible({ timeout: 20000 })
}

async function convertToOnline(page: Page, roomId: string) {
  await page.goto(`/room/${roomId}/settings`)
  await page.waitForSelector('.settings-page', { timeout: 10000 })
  await page.getByText('复制公共邀请链接').click()
  await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 5000 })
  await page.getByRole('button', { name: '确认转换' }).click()
  await page.waitForTimeout(3000)
}

test.describe('本地模式 E2E', () => {
  test.beforeEach(({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`  [page error] ${msg.text()}`)
    })
    page.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
  })

  test('流程1: 本地创建 → 账单 → 本地AA → 转在线（数据上传）', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `本地模式-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    expect(roomId).toBeTruthy()

    // 本地房间标识
    await expect(page.locator('.local-banner')).toBeVisible()

    // 添加成员 + 账单（纯本地）
    await addMember(page, '朋友A')
    const billContent = `本地账单 ${Date.now()}`
    await addBill(page, billContent, '66')

    // 本地 AA 计算
    await page.goto(`/room/${roomId}/aa`)
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(2500)
    await expect(page.locator('.aa-summary')).toBeVisible()
    const cached = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_aa_v2')
      return raw ? JSON.parse(raw)[rid] ?? null : null
    }, roomId)
    expect(cached).not.toBeNull()
    expect(cached.version).toBeGreaterThanOrEqual(2)

    // 转在线
    await convertToOnline(page, roomId)
    await expect(page.locator('.expired-banner')).not.toBeVisible()

    // 服务端数据存在
    const rooms = await adminFetch(`rooms?id=eq.${roomId}&select=owner_id,version`)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].owner_id).toBeTruthy()
    expect(rooms[0].version).toBeGreaterThanOrEqual(2)
    const bills = await adminFetch(`bills?room_id=eq.${roomId}&select=id,content`)
    expect(bills).toHaveLength(1)
    expect(bills[0].content).toBe(billContent)
    const members = await adminFetch(`room_members?room_id=eq.${roomId}&select=user_id`)
    expect(members).toHaveLength(2)

    // 首页不再显示“本地”标识
    await page.goto('/')
    await page.waitForSelector('.home-page')
    const cell = page.locator('.van-cell').filter({ hasText: roomName })
    await expect(cell.locator('.online-badge')).toBeVisible()
    await expect(cell.locator('.local-badge')).not.toBeVisible()
  })

  test('流程2: 过期房间只读 → 重建为本地房间', async ({ page }) => {
    const oldId = `exp-${Date.now()}`
    const roomName = `过期重建-${Date.now()}`
    const billContent = '过期账单'

    await page.addInitScript(({ rid, rname, content }) => {
      localStorage.setItem('aa_privacy_accepted', '1')
      if (sessionStorage.getItem('aa-flow2-seeded')) return
      sessionStorage.setItem('aa-flow2-seeded', '1')
      localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
        [rid]: {
          id: rid,
          name: rname,
          description: 'E2E过期房间',
          version: 2,
          owner_id: null,
          mode: 'expired',
          self_member_id: 'm-1',
          settings: {},
          created_at: '2026-07-01T08:00:00.000Z',
          updated_at: '2026-07-01T08:00:00.000Z',
          members: [
            { id: 'm-1', name: '测试员', user_id: null, is_unsubmitted: false, created_at: '2026-07-01T08:00:00.000Z' },
            { id: 'm-2', name: '朋友', user_id: null, is_unsubmitted: false, created_at: '2026-07-01T08:00:00.000Z' },
          ],
        },
      }))
      localStorage.setItem('aa_local_bills_v2', JSON.stringify({
        [rid]: [{
          local_id: 'b-1',
          room_id: rid,
          content,
          amount: 60,
          paid_at: '2026-07-01T08:00:00+0800',
          shared_by: ['m-1', 'm-2'],
          created_by: 'm-1',
          creator_name: '测试员',
          created_at: '2026-07-01T08:00:00.000Z',
          synced: false,
        }],
      }))
    }, { rid: oldId, rname: roomName, content: billContent })

    // 只读查看
    await page.goto(`/room/${oldId}`)
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.locator('.expired-banner')).toBeVisible()
    await expect(page.locator('.van-nav-bar__right').getByText('新增')).not.toBeVisible()
    await expect(page.getByText(billContent)).toBeVisible()

    // 菜单 → 重建为本地房间
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('重建为本地房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog__confirm').click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.locator('.local-banner')).toBeVisible()

    const newId = extractRoomId(page.url())
    expect(newId).not.toBe(oldId)
    await expect(page.getByText(billContent)).toBeVisible()

    // 旧过期房间已移除
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await expect(page.locator('.van-cell').filter({ hasText: roomName })).toHaveCount(1)
    const cell = page.locator('.van-cell').filter({ hasText: roomName })
    await expect(cell.locator('.local-badge')).toBeVisible()
  })

  test('流程3: 本地房间导出 → 删除 → 导入恢复', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `导出导入-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)

    // 添加账单后导出
    const billContent = `备份账单 ${Date.now()}`
    await addBill(page, billContent, '42')
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page', { timeout: 10000 })

    const downloadPromise = page.waitForEvent('download')
    await page.getByText('导出本地房间').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`aa-room-${roomName}.json`)
    const filePath = await download.path()
    expect(filePath).toBeTruthy()
    const exported = JSON.parse(fs.readFileSync(filePath!, 'utf-8'))
    expect(exported.format).toBe('aa-local-room')
    expect('aa_result' in exported).toBe(true)
    expect('aaResult' in exported).toBe(false)
    expect(exported.room.id).toBe(roomId)
    expect(exported.bills.some((b: { content: string }) => b.content === billContent)).toBe(true)

    // 删除本地房间
    await page.getByText('删除本地数据').click()
    await page.waitForSelector('.van-dialog__confirm', { state: 'visible' })
    await page.locator('.van-dialog__confirm').click()
    await page.waitForSelector('.home-page', { timeout: 10000 })
    await expect(page.locator('.van-cell').filter({ hasText: roomName })).toHaveCount(0)

    // 导入恢复（同 id 覆盖场景：先验证无冲突直接导入）
    await page.locator('.van-nav-bar__right').getByText('设置').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('导入本地房间').click()
    await page.setInputFiles('input[type=file]', {
      name: 'room-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    })
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.locator('.local-banner')).toBeVisible()
    await expect(page.getByText(billContent)).toBeVisible()
  })

  test('流程4: 本地AA与服务端 calculate_aa 结果一致（100/3）', async ({ page }) => {
    const roomId = crypto.randomUUID()
    const m1 = crypto.randomUUID()
    const m2 = crypto.randomUUID()
    const m3 = crypto.randomUUID()
    const billId = crypto.randomUUID()
    const roomName = `AA一致性-${Date.now()}`

    await page.addInitScript(({ rid, members, bid, rname }) => {
      localStorage.setItem('aa_privacy_accepted', '1')
      localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
        [rid]: {
          id: rid,
          name: rname,
          description: '',
          version: 1,
          owner_id: null,
          mode: 'local',
          self_member_id: members[0],
          settings: {},
          created_at: '2026-08-01T08:00:00.000Z',
          updated_at: '2026-08-01T08:00:00.000Z',
          members: members.map((id, i) => ({
            id,
            name: `成员${i + 1}`,
            user_id: null,
            is_unsubmitted: false,
            created_at: '2026-08-01T08:00:00.000Z',
          })),
        },
      }))
      localStorage.setItem('aa_local_bills_v2', JSON.stringify({
        [rid]: [{
          local_id: bid,
          room_id: rid,
          content: '三人聚餐',
          amount: 100,
          paid_at: '2026-08-01T08:00:00+0800',
          shared_by: members,
          created_by: members[0],
          creator_name: '成员1',
          created_at: '2026-08-01T08:00:00.000Z',
          synced: false,
        }],
      }))
    }, { rid: roomId, members: [m1, m2, m3], bid: billId, rname: roomName })

    // 本地 AA
    await page.goto(`/room/${roomId}/aa`)
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(2500)
    const localResult = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_aa_v2')
      return raw ? JSON.parse(raw)[rid] ?? null : null
    }, roomId)
    expect(localResult).not.toBeNull()
    // 转账明细展示全体成员的结算方案（2 笔：成员2→成员1、成员3→成员1）
    await expect(page.locator('.transfer-item')).toHaveCount(2)
    await expect(page.locator('.transfer-section')).toContainText('成员2')
    await expect(page.locator('.transfer-section')).toContainText('成员3')

    // 转在线后调用服务端算法
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page', { timeout: 10000 })
    await page.getByText('复制公共邀请链接').click()
    await page.waitForSelector('.van-dialog:visible', { timeout: 5000 })
    await page.getByRole('button', { name: '确认转换' }).click()
    await page.waitForTimeout(3000)

    const serverResult = await adminRpc('calculate_aa', { p_room_id: roomId })
    const sortMembers = (arr: any[]) => [...arr].sort((a, b) => a.member_id.localeCompare(b.member_id))
    const sortTransfers = (arr: any[]) => [...arr].sort(
      (a, b) => (a.from_member_id + a.to_member_id).localeCompare(b.from_member_id + b.to_member_id),
    )
    expect(sortMembers(localResult.results.members)).toEqual(sortMembers(serverResult.results.members))
    expect(sortTransfers(localResult.results.transfers)).toEqual(sortTransfers(serverResult.results.transfers))
  })

  test('流程5: 自付账单不参与AA，本地与服务端结果一致', async ({ page }) => {
    const roomId = crypto.randomUUID()
    const m1 = crypto.randomUUID()
    const m2 = crypto.randomUUID()
    const sharedBillId = crypto.randomUUID()
    const selfBillId = crypto.randomUUID()
    const roomName = `自付AA-${Date.now()}`

    await page.addInitScript(({ rid, members, sharedBid, selfBid, rname }) => {
      if (sessionStorage.getItem('aa-flow5-seeded')) return
      sessionStorage.setItem('aa-flow5-seeded', '1')
      localStorage.setItem('aa_privacy_accepted', '1')
      localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
        [rid]: {
          id: rid,
          name: rname,
          description: '',
          version: 1,
          owner_id: null,
          mode: 'local',
          self_member_id: members[0],
          settings: {},
          created_at: '2026-08-01T08:00:00.000Z',
          updated_at: '2026-08-01T08:00:00.000Z',
          members: members.map((id, i) => ({
            id,
            name: `成员${i + 1}`,
            user_id: null,
            is_unsubmitted: false,
            created_at: '2026-08-01T08:00:00.000Z',
          })),
        },
      }))
      localStorage.setItem('aa_local_bills_v2', JSON.stringify({
        [rid]: [
          {
            local_id: sharedBid,
            room_id: rid,
            content: '共享账单',
            amount: 100,
            paid_at: '2026-08-01T08:00:00+0800',
            shared_by: members,
            created_by: members[0],
            creator_name: '成员1',
            created_at: '2026-08-01T08:00:00.000Z',
            synced: false,
          },
          {
            local_id: selfBid,
            room_id: rid,
            content: '自付账单',
            amount: 50,
            paid_at: '2026-08-01T09:00:00+0800',
            shared_by: [members[0]],
            created_by: members[0],
            creator_name: '成员1',
            created_at: '2026-08-01T09:00:00.000Z',
            synced: false,
          },
        ],
      }))
    }, { rid: roomId, members: [m1, m2], sharedBid: sharedBillId, selfBid: selfBillId, rname: roomName })

    await page.goto(`/room/${roomId}/aa`)
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(2500)
    const localResult = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_aa_v2')
      return raw ? JSON.parse(raw)[rid] ?? null : null
    }, roomId)
    expect(localResult).not.toBeNull()
    // 转账明细展示全部：自付场景下仅 1 笔（成员2→成员1）
    await expect(page.locator('.transfer-item')).toHaveCount(1)
    await expect(page.locator('.transfer-section')).toContainText('成员2')
    await expect(page.locator('.transfer-section')).toContainText('成员1')

    // 自付账单被排除：成员1 total_paid=100（仅共享）、self_pay=50、net=50
    const selfMember = localResult.results.members.find((m: any) => m.member_id === m1)
    const otherMember = localResult.results.members.find((m: any) => m.member_id === m2)
    expect(selfMember.total_paid).toBe(100)
    expect(selfMember.total_share).toBe(50)
    expect(selfMember.self_pay).toBe(50)
    expect(selfMember.net).toBe(50)
    expect(otherMember.net).toBe(-50)
    expect(localResult.results.transfers).toHaveLength(1)
    expect(localResult.results.transfers[0]).toMatchObject({
      from_member_id: m2,
      to_member_id: m1,
      amount: 50,
    })

    // 转在线后服务端算法一致
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page')
    await page.getByText('复制公共邀请链接').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.getByRole('button', { name: '确认转换' }).click()
    await page.waitForTimeout(3000)
    const serverResult = await adminRpc('calculate_aa', { p_room_id: roomId })
    const sortMembers = (arr: any[]) => [...arr].sort((a, b) => a.member_id.localeCompare(b.member_id))
    expect(sortMembers(localResult.results.members)).toEqual(sortMembers(serverResult.results.members))
    expect(localResult.results.transfers).toEqual(serverResult.results.transfers)
  })

  test('流程6: 本地房间账单列表无「本地」标记，滚动到底部不卡加载中', async ({ page }) => {
    const roomId = crypto.randomUUID()
    const memberId = crypto.randomUUID()
    const roomName = `列表加载-${Date.now()}`

    await page.addInitScript(({ rid, mid, rname }) => {
      localStorage.setItem('aa_privacy_accepted', '1')
      localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
        [rid]: {
          id: rid,
          name: rname,
          description: '',
          version: 1,
          owner_id: null,
          mode: 'local',
          self_member_id: mid,
          settings: {},
          created_at: '2026-08-01T08:00:00.000Z',
          updated_at: '2026-08-01T08:00:00.000Z',
          members: [{
            id: mid,
            name: '列表测试员',
            user_id: null,
            is_unsubmitted: false,
            created_at: '2026-08-01T08:00:00.000Z',
          }],
        },
      }))
      const bills = Array.from({ length: 25 }, (_, i) => ({
        local_id: crypto.randomUUID(),
        room_id: rid,
        content: `账单${i + 1}`,
        amount: 10 + i,
        paid_at: `2026-08-01T0${String((i % 9) + 1).padStart(2, '0')}:00:00+0800`,
        shared_by: [mid],
        created_by: mid,
        creator_name: '列表测试员',
        created_at: `2026-08-01T0${String((i % 9) + 1).padStart(2, '0')}:00:00.000Z`,
        synced: false,
      }))
      localStorage.setItem('aa_local_bills_v2', JSON.stringify({ [rid]: bills }))
    }, { rid: roomId, mid: memberId, rname: roomName })

    await page.goto(`/room/${roomId}`)
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await expect(page.getByText('账单1', { exact: true })).toBeVisible()

    // 账单卡片不显示「本地」标记
    await expect(page.locator('.bill-card .local-badge')).toHaveCount(0)

    // 滚动到底部：分页正常结束，不出现持续「加载中」
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(page.getByText('没有更多了')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('加载中')).not.toBeVisible()
  })

  test('流程7: 创建人/付款人分离，只有创建人能改付款人且仅限自己或未绑定成员', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `付款人-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await addMember(page, '王五')

    // 新增账单：付款人改为未绑定成员王五，创建人仍是自己
    const billContent = `付款人账单 ${Date.now()}`
    await addBillWithPayer(page, billContent, '60', '王五')

    const membersInfo = await page.evaluate((rid: string) => {
      const rooms = JSON.parse(localStorage.getItem('aa_local_rooms_v2') || '{}')
      return rooms[rid].members.map((m: any) => ({ id: m.id, name: m.name }))
    }, roomId)
    const wangId = membersInfo.find((m: any) => m.name === '王五').id
    const selfId = membersInfo.find((m: any) => m.name === NICKNAME).id
    expect(wangId).toBeTruthy()
    expect(selfId).toBeTruthy()

    let localBill = await page.evaluate((rid: string) => {
      const bills = JSON.parse(localStorage.getItem('aa_local_bills_v2') || '{}')
      return bills[rid][0]
    }, roomId)
    expect(localBill.payer_id).toBe(wangId)
    expect(localBill.created_by).toBe(selfId)

    // 账单卡片显示付款人王五
    const card = page.locator('.bill-item').filter({ hasText: billContent })
    await expect(card).toContainText('王五')

    // 创建人（自己）可把付款人改回自己
    await card.click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog .van-field').filter({ hasText: '付款人' }).click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.locator('.van-action-sheet').getByText(NICKNAME).click()
    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await page.waitForTimeout(1000)
    localBill = await page.evaluate((rid: string) => {
      const bills = JSON.parse(localStorage.getItem('aa_local_bills_v2') || '{}')
      return bills[rid][0]
    }, roomId)
    expect(localBill.payer_id).toBe(selfId)
    expect(localBill.created_by).toBe(selfId)

    // 转在线后修改付款人，服务端记录 payer_id
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page')
    await page.getByText('复制公共邀请链接').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.getByRole('button', { name: '确认转换' }).click()
    await page.waitForTimeout(3000)

    await page.goto(`/room/${roomId}`)
    await page.waitForSelector('.room-detail')
    await page.locator('.bill-item').filter({ hasText: billContent }).click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog .van-field').filter({ hasText: '付款人' }).click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.locator('.van-action-sheet').getByText('王五').click()
    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await page.waitForTimeout(1500)

    const serverBill = await adminFetch(`bills?room_id=eq.${roomId}&select=id,created_by,payer_id`)
    expect(serverBill).toHaveLength(1)
    expect(serverBill[0].created_by).toBe(selfId)
    expect(serverBill[0].payer_id).toBe(wangId)

    // 服务端权限：非创建人改付款人被拒绝，创建人可改
    const ownerToken = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
          return JSON.parse(localStorage.getItem(key)!).access_token
        }
      }
      return null
    })
    expect(ownerToken).toBeTruthy()

    const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    })
    const outsider = await signupRes.json()
    expect(outsider.access_token).toBeTruthy()

    const joinRes = await fetch(`${SUPABASE_URL}/rest/v1/room_members`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${outsider.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ room_id: roomId, user_id: outsider.user.id, name: '外人' }),
    })
    expect(joinRes.ok).toBe(true)

    const outsiderAttempt = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_bill`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${outsider.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_bill_id: serverBill[0].id ?? '',
        p_room_id: roomId,
        p_content: '付款人账单',
        p_amount: 60,
        p_paid_at: '2026-08-06T08:00:00+08:00',
        p_shared_by: [selfId, wangId],
        p_payer_id: selfId,
        p_creator_name: NICKNAME,
      }),
    })
    expect(outsiderAttempt.status).toBe(400)
    const outsiderError = await outsiderAttempt.text()
    expect(outsiderError).toContain('ONLY_CREATOR_CAN_CHANGE_PAYER')

    const ownerAttempt = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_bill`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_bill_id: serverBill[0].id ?? '',
        p_room_id: roomId,
        p_content: '付款人账单',
        p_amount: 60,
        p_paid_at: '2026-08-06T08:00:00+08:00',
        p_shared_by: [selfId, wangId],
        p_payer_id: selfId,
        p_creator_name: NICKNAME,
      }),
    })
    expect(ownerAttempt.ok).toBe(true)
  })
})
