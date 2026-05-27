import { test, expect } from '@playwright/test'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const NICKNAME = 'E2E测试员'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Query Supabase REST API with the service_role key (bypasses RLS). */
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

/** Call a Supabase RPC with the service_role key. */
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

/** Extract room UUID from a URL like /room/<uuid> or /room/<uuid>/settings */
function extractRoomId(url: string): string {
  const m = url.match(/\/room\/([a-f0-9-]+)/)
  return m ? m[1] : ''
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('成员管理与房主功能 E2E', () => {
  test.beforeEach(({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`  [page error] ${msg.text()}`)
    })
    page.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
  })

  test('流程1: 创建房间 → 首页显示 → 房主badge → 添加成员', async ({ page }) => {
    const roomName = `T1-${Date.now()}`

    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // -- 创建房间 --
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('新增房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(roomName)
    await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
    await page.locator('.van-dialog .van-button--primary').click()

    await page.waitForTimeout(2000)  // wait for toast + fetchRooms
    await expect(page.getByText(roomName)).toBeVisible({ timeout: 15000 })

    // -- 进入房间详情 --
    await page.getByText(roomName).click()
    await page.waitForSelector('.room-detail', { timeout: 5000 })
    const roomId = extractRoomId(page.url())
    expect(roomId).toBeTruthy()

    // 验证 DB 中 owner_id 已设置
    const rooms = await adminFetch(`rooms?id=eq.${roomId}&select=owner_id`)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].owner_id).toBeTruthy()

    // -- 进入设置页 --
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('房间设置').click()
    await page.waitForSelector('.settings-page', { state: 'visible' })

    // 验证房主 badge
    await expect(page.locator('.owner-badge')).toBeVisible()
    await expect(page.locator('.owner-badge')).toContainText('房主')

    // 验证「你」badge
    await expect(page.locator('.self-badge')).toBeVisible()
    await expect(page.locator('.self-badge')).toContainText('你')

    // -- 添加占位成员 --
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 3000 })
    await page.locator('.van-dialog .van-field__control').fill('TestUser')
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    // 验证「未绑定」badge
    await expect(page.locator('.unbound-badge').first()).toBeVisible()

    // 验证生成链接和删除图标（房主权限）
    await expect(page.locator('.van-icon-link-o').first()).toBeVisible()
    await expect(page.locator('.van-icon-delete-o').first()).toBeVisible()

    // 验证 DB 中有该占位成员
    const members = await adminFetch(`room_members?room_id=eq.${roomId}&select=id,name,user_id,invite_token`)
    const placeholder = members.find((m: any) => m.name === 'TestUser')
    expect(placeholder).toBeTruthy()
    expect(placeholder.user_id).toBeNull()
  })

  test('流程2: 生成专属邀请链接 → 验证token', async ({ page }) => {
    const roomName = `T2-${Date.now()}`

    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // 创建房间
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('新增房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(roomName)
    await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
    await page.locator('.van-dialog .van-button--primary').click()
    await page.waitForTimeout(2000)
    await expect(page.getByText(roomName)).toBeVisible({ timeout: 15000 })

    // 进入房间 → 设置
    await page.getByText(roomName).click()
    await page.waitForSelector('.room-detail', { timeout: 5000 })
    const roomId = extractRoomId(page.url())
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('房间设置').click()
    await page.waitForSelector('.settings-page', { state: 'visible' })

    // 添加占位成员
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog .van-field__control').fill('InviteUser')
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    // 通过 DB 获取该成员 ID，然后调用 RPC 生成 token
    const members = await adminFetch(`room_members?room_id=eq.${roomId}&select=id,name`)
    const placeholder = members.find((m: any) => m.name === 'InviteUser')
    expect(placeholder).toBeTruthy()

    // 通过 RPC 生成 token
    const token = await adminRpc('generate_member_invite_token', { p_member_id: placeholder.id })
    expect(token).toBeTruthy()
    expect(token.length).toBeGreaterThan(10)

    // 验证 token 格式
    const inviteLink = `http://localhost:5173/invite/member?token=${token}`
    expect(inviteLink).toContain('/invite/member?token=')
    expect(token.length).toBeGreaterThan(20)

    // 验证 DB 中有 token 记录
    const updatedMembers = await adminFetch(`room_members?id=eq.${placeholder.id}&select=invite_token`)
    expect(updatedMembers[0].invite_token).toBe(token)
  })

  test('流程3: 接受专属邀请', async ({ page }) => {
    const roomName = `T3-${Date.now()}`

    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // 创建房间（房主）
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('新增房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(roomName)
    await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
    await page.locator('.van-dialog .van-button--primary').click()
    await page.waitForTimeout(2000)
    await expect(page.getByText(roomName)).toBeVisible({ timeout: 15000 })
    await page.getByText(roomName).click()
    await page.waitForSelector('.room-detail', { timeout: 5000 })
    const roomId = extractRoomId(page.url())

    // 进入设置 → 添加占位成员
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('房间设置').click()
    await page.waitForSelector('.settings-page', { state: 'visible' })
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog .van-field__control').fill('AcceptUser')
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    // 通过 DB 获取 memberId 并生成 token
    const members = await adminFetch(`room_members?room_id=eq.${roomId}&select=id,name`)
    const placeholder = members.find((m: any) => m.name === 'AcceptUser')
    const token = await adminRpc('generate_member_invite_token', { p_member_id: placeholder.id })

    // 导航到专属邀请页
    await page.goto(`/invite/member?token=${token}`)
    await page.waitForTimeout(2000)

    // 验证页面显示房间名
    await expect(page.locator('.room-name')).toContainText(roomName)

    // 验证昵称已预填
    const nameInput = page.locator('.van-field__control')
    await expect(nameInput).toHaveValue('AcceptUser')

    // 验证接受按钮
    await expect(page.getByRole('button', { name: '接受邀请' })).toBeVisible()

    // 接受邀请 — 当前用户（相同匿名 session）已是房间成员，
    // 所以 accept_invite 应返回 already_member 并导航到房间
    await page.getByRole('button', { name: '接受邀请' }).click()
    await page.waitForTimeout(2000)

    // 验证导航到了房间页
    const currentUrl = page.url()
    expect(currentUrl).toContain(`/room/${roomId}`)
  })

  test('流程4: 编辑成员昵称', async ({ page }) => {
    const roomName = `T4-${Date.now()}`

    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // 创建房间
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('新增房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(roomName)
    await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
    await page.locator('.van-dialog .van-button--primary').click()
    await page.waitForTimeout(2000)
    await expect(page.getByText(roomName)).toBeVisible({ timeout: 15000 })
    await page.getByText(roomName).click()
    await page.waitForSelector('.room-detail', { timeout: 5000 })

    // 进入设置页
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('房间设置').click()
    await page.waitForSelector('.settings-page', { state: 'visible' })

    // 点击编辑图标（自己的昵称）
    const editIcons = page.locator('.van-icon-edit')
    await expect(editIcons.first()).toBeVisible()
    await editIcons.first().click()

    // 等待昵称编辑 dialog
    await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 3000 })
    await expect(page.locator('.van-dialog__header')).toContainText('修改昵称')

    // 修改昵称
    const newNickname = `更名${Date.now()}`
    const dialogInput = page.locator('.van-dialog .van-field__control')
    await dialogInput.clear()
    await dialogInput.fill(newNickname)

    // 确认
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    // 验证昵称已更新
    await expect(page.getByText(newNickname)).toBeVisible()
  })

  test('流程5: 无效token和已绑定token的错误提示', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // 测试无效 token
    await page.goto('/invite/member?token=invalidtoken123')
    await page.waitForTimeout(2000)
    await expect(page.getByText('邀请链接无效')).toBeVisible()

    // --- 测试已绑定的 token ---
    const roomName = `T5-${Date.now()}`
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('新增房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(roomName)
    await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
    await page.locator('.van-dialog .van-button--primary').click()
    await page.waitForTimeout(2000)
    await expect(page.getByText(roomName)).toBeVisible({ timeout: 15000 })
    await page.getByText(roomName).click()
    await page.waitForSelector('.room-detail', { timeout: 5000 })
    const roomId = extractRoomId(page.url())

    // 进入设置 → 添加成员
    await page.locator('.van-nav-bar__right').getByText('菜单').click()
    await page.waitForSelector('.van-action-sheet', { state: 'visible' })
    await page.getByText('房间设置').click()
    await page.waitForSelector('.settings-page', { state: 'visible' })
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog .van-field__control').fill('BoundUser')
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    // 获取 memberId 并生成 token
    const members = await adminFetch(`room_members?room_id=eq.${roomId}&select=id,name`)
    const placeholder = members.find((m: any) => m.name === 'BoundUser')
    const token = await adminRpc('generate_member_invite_token', { p_member_id: placeholder.id })

    // 直接标记为已绑定（将 invite_token 置空，user_id 设为已绑定用户）
    // 重新生成 token，此时 member 已有 user_id
    await adminFetch(`room_members?id=eq.${placeholder.id}`)
    await adminRpc('generate_member_invite_token', { p_member_id: placeholder.id })
    // 模拟 user_id 已绑定
    await fetch(`${SUPABASE_URL}/rest/v1/room_members?id=eq.${placeholder.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: 'already-bound-user' }),
    })
    // 重新生成 token（此时 member 已有 user_id = 已绑定的状态）
    const token2 = await adminRpc('generate_member_invite_token', { p_member_id: placeholder.id })

    // 导航到此 token
    await page.goto(`/invite/member?token=${token2}`)
    await page.waitForTimeout(2000)
    // 由于 member 的 user_id 已设置，is_bound = true → 显示"该邀请已被使用"
    await expect(page.getByText('该邀请已被使用')).toBeVisible()
  })

  test('流程6: 公共邀请链接正常可用', async ({ page }) => {
    const roomName = `T6-${Date.now()}`

    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // 创建房间
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('新增房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(roomName)
    await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
    await page.locator('.van-dialog .van-button--primary').click()
    await page.waitForTimeout(2000)
    await expect(page.getByText(roomName)).toBeVisible({ timeout: 15000 })
    await page.getByText(roomName).click()
    await page.waitForSelector('.room-detail', { timeout: 5000 })
    const roomId = extractRoomId(page.url())

    // 直接访问公共邀请页
    await page.goto(`/invite?room_id=${roomId}`)
    await page.waitForTimeout(2000)

    // 验证公共邀请页显示房间信息
    await expect(page.locator('.room-name')).toContainText(roomName)
    await expect(page.getByText('创建人')).toBeVisible()

    // 验证可输入昵称
    await expect(page.locator('.van-field__control')).toBeVisible()
    await expect(page.getByRole('button', { name: '加入房间' })).toBeVisible()
  })

  test('流程7: 过期本地房间 - 设置页只读模式', async ({ page }) => {
    const LOCAL_ROOM_ID = `e2e-local-settings-${Date.now()}`
    const LOCAL_ROOM_NAME = `E2E本地设置 ${Date.now()}`

    await page.addInitScript(({ roomId, roomName, nickname }) => {
      localStorage.setItem('aa_privacy_accepted', '1')
      // Seed room data in localStorage
      localStorage.setItem('aa_cached_rooms', JSON.stringify({
        [roomId]: {
          id: roomId,
          name: roomName,
          description: 'E2E测试过期房间',
          version: 1,
          owner_id: 'local-owner',
          created_at: '2026-05-27T08:00:00.000Z',
          updated_at: '2026-05-27T08:00:00.000Z',
          members: [
            { id: 'local-member-1', name: nickname, user_id: 'local-owner', is_unsubmitted: false, created_at: '2026-05-27T08:00:00.000Z' },
          ],
        },
      }))
      localStorage.setItem('aa_expired_rooms', JSON.stringify([roomId]))
    }, { roomId: LOCAL_ROOM_ID, roomName: LOCAL_ROOM_NAME, nickname: NICKNAME })

    await page.goto(`/room/${LOCAL_ROOM_ID}/settings`)
    await page.waitForSelector('.settings-page', { timeout: 10000 })

    // 验证过期 banner
    await expect(page.locator('.expired-banner')).toBeVisible()

    // 过期房间不应有添加成员按钮
    await expect(page.getByText('添加成员')).not.toBeVisible()

    // 不应有编辑图标
    await expect(page.locator('.van-icon-edit')).not.toBeVisible()

    // member-actions 区域内不应有删除图标
    await expect(page.locator('.member-actions .van-icon-delete-o')).not.toBeVisible()

    // member-actions 区域内不应有链接图标
    await expect(page.locator('.member-actions .van-icon-link-o')).not.toBeVisible()

    // 显示「删除本地数据」按钮
    await expect(page.getByText('删除本地数据')).toBeVisible()

    // 不显示「复制公共邀请链接」
    await expect(page.getByText('复制公共邀请链接')).not.toBeVisible()
  })

  test('流程8: 数据库层面验证房主和成员功能', async () => {
    // 纯 DB 测试，不涉及浏览器
    const roomId = crypto.randomUUID()
    const ownerUserId = crypto.randomUUID()
    const memberUserId = crypto.randomUUID()
    const unboundMemberId = crypto.randomUUID()
    const normalMemberId = crypto.randomUUID()

    // 创建房间
    const roomResult = await adminFetch('rooms')
    await fetch(`${SUPABASE_URL}/rest/v1/rooms`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: roomId,
        name: 'DB-Test-Room',
        description: 'E2E权限验证',
        owner_id: ownerUserId,
      }),
    })

    // 添加成员
    await fetch(`${SUPABASE_URL}/rest/v1/room_members`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: unboundMemberId,
        room_id: roomId,
        user_id: null,
        name: '未绑定用户',
      }),
    })
    await fetch(`${SUPABASE_URL}/rest/v1/room_members`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: normalMemberId,
        room_id: roomId,
        user_id: memberUserId,
        name: '普通成员',
      }),
    })

    // 验证 owner_id
    const rooms = await adminFetch(`rooms?id=eq.${roomId}&select=owner_id`)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].owner_id).toBe(ownerUserId)

    // 验证占位成员 user_id 为 null
    const unboundCheck = await adminFetch(`room_members?id=eq.${unboundMemberId}&select=user_id`)
    expect(unboundCheck[0].user_id).toBeNull()

    // 测试 generate_member_invite_token RPC
    const token = await adminRpc('generate_member_invite_token', { p_member_id: unboundMemberId })
    expect(token).toBeTruthy()
    expect(token.length).toBeGreaterThan(10)

    // 验证 invite_token 已设置
    const tokenCheck = await adminFetch(`room_members?id=eq.${unboundMemberId}&select=invite_token`)
    expect(tokenCheck[0].invite_token).toBe(token)

    // 测试 get_member_by_invite_token RPC
    const lookupResult = await adminRpc('get_member_by_invite_token', { p_token: token })
    expect(lookupResult.is_bound).toBe(false)
    expect(lookupResult.room_name).toBe('DB-Test-Room')

    // 清理
    await fetch(`${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    })
  })
})
