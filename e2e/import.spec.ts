import { test, expect, type Page } from '@playwright/test'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const NICKNAME = '导入测试员'

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
  await page.waitForSelector('.van-dialog:visible')
  await page.locator('.van-dialog .van-field__control').fill(name)
  await page.getByRole('button', { name: '确认' }).click()
  await page.waitForTimeout(800)
}

async function runImportWizard(page: Page, csv: string) {
  await page.waitForSelector('.import-page')
  await page.setInputFiles('input[type=file]', {
    name: 'bills.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  })
  await page.waitForSelector('.ag-grid-wrapper', { timeout: 15000 })

  // 用小写输入验证自动转大写仍生效
  await page.getByPlaceholder('如 A2 （A是列号，2是行号）').fill('a2')
  await page.getByPlaceholder('如 E 或 E+F').fill('b')
  await page.getByPlaceholder('如 G').fill('c')
  await page.getByRole('button', { name: /下一步/ }).click()
  await page.waitForSelector('.step-preview', { timeout: 10000 })
  await page.locator('.van-nav-bar__right').getByText('快捷功能').click()
  await page.waitForSelector('.van-action-sheet:visible')
  await page.locator('.van-action-sheet:visible').getByText('全选分摊', { exact: true }).click()
  await page.waitForSelector('.van-dialog:visible')
  await page.locator('.van-dialog:visible .van-dialog__confirm').click()
  await page.locator('.van-nav-bar__right').getByText('保存').click()
  await page.waitForSelector('.room-detail', { timeout: 15000 })
}

test.describe('账单导入 E2E', () => {
  test.beforeEach(({ page }) => {
    page.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
  })

  test('本地房间导入CSV（不触网）→ 转在线后上传 → 在线房间再导入自动同步', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `导入房间-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await addMember(page, '朋友')

    // 本地房间导入 CSV
    const csv1 = '日期,内容,金额\n2026-08-01 10:00,导入午餐,66.5\n2026-08-02 12:00,导入晚餐,88\n'
    await page.goto(`/room/${roomId}/import`)
    await runImportWizard(page, csv1)

    for (const content of ['导入午餐', '导入晚餐']) {
      await expect(page.getByText(content)).toBeVisible()
    }

    // 本地账单已写入 v2，服务端无数据
    const localBills = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_bills_v2')
      return raw ? (JSON.parse(raw)[rid] ?? []) : []
    }, roomId)
    expect(localBills).toHaveLength(2)
    expect(await adminFetch(`bills?room_id=eq.${roomId}&select=id`)).toHaveLength(0)

    // 转在线：账单随转换上传
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page')
    await page.getByText('复制公共邀请链接').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.getByRole('button', { name: '确认转换' }).click()
    await page.waitForTimeout(3000)

    const serverBills = await adminFetch(`bills?room_id=eq.${roomId}&select=id,content`)
    expect(serverBills).toHaveLength(2)
    expect(serverBills.map((b: { content: string }) => b.content).sort()).toEqual(['导入午餐', '导入晚餐'])

    const syncedState = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_bills_v2')
      return raw ? (JSON.parse(raw)[rid] ?? []).map((b: any) => b.synced) : []
    }, roomId)
    expect(syncedState.every(Boolean)).toBe(true)

    // 在线房间再次导入：保存后直接提交到服务端
    const csv2 = '日期,内容,金额\n2026-08-03 09:00,在线导入,20.5\n'
    await page.goto(`/room/${roomId}/import`)
    await runImportWizard(page, csv2)
    await expect(page.getByText('在线导入')).toBeVisible()

    const serverBillsAfter = await adminFetch(`bills?room_id=eq.${roomId}&select=content`)
    expect(serverBillsAfter).toHaveLength(3)
    expect(serverBillsAfter.map((b: { content: string }) => b.content)).toContain('在线导入')
  })

  test('快捷功能：取消全选分摊 + 设置本批付款人（自己/未绑定成员）', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    const roomName = `快捷功能-${Date.now()}`
    const roomId = await createLocalRoom(page, roomName)
    await addMember(page, '王五')

    const csv = '日期,内容,金额\n2026-08-01 10:00,批量账单A,30\n2026-08-02 12:00,批量账单B,40\n'
    await page.goto(`/room/${roomId}/import`)
    await page.waitForSelector('.import-page')
    await page.setInputFiles('input[type=file]', {
      name: 'batch.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf-8'),
    })
    await page.waitForSelector('.ag-grid-wrapper', { timeout: 15000 })
    await page.getByPlaceholder('如 A2 （A是列号，2是行号）').fill('A2')
    await page.getByPlaceholder('如 E 或 E+F').fill('B')
    await page.getByPlaceholder('如 G').fill('C')
    await page.getByRole('button', { name: /下一步/ }).click()
    await page.waitForSelector('.step-preview', { timeout: 10000 })

    // 设置本批付款人为未绑定成员王五
    await page.locator('.van-nav-bar__right').getByText('快捷功能').click()
    await page.waitForSelector('.van-action-sheet:visible')
    await page.locator('.van-action-sheet:visible').getByText('设置本批付款人').click()
    await page.waitForSelector('.van-action-sheet:visible')
    await page.locator('.van-action-sheet:visible').getByText('王五').click()
    await expect(page.locator('.import-bill-card').first()).toContainText('王五')

    // 取消全选分摊（此时分摊为空，可取消后重新全选）
    await page.locator('.van-nav-bar__right').getByText('快捷功能').click()
    await page.waitForSelector('.van-action-sheet:visible')
    await page.locator('.van-action-sheet:visible').getByText('全选分摊', { exact: true }).click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog:visible .van-dialog__confirm').click()
    await page.waitForTimeout(500)
    await page.locator('.van-nav-bar__right').getByText('快捷功能').click()
    await page.waitForSelector('.van-action-sheet:visible')
    await page.locator('.van-action-sheet:visible').getByText('取消全选分摊', { exact: true }).click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog:visible .van-dialog__confirm').click()
    await expect(page.getByText('已取消全选')).toBeVisible()

    // 重新全选后保存
    await page.locator('.van-nav-bar__right').getByText('快捷功能').click()
    await page.waitForSelector('.van-action-sheet:visible')
    await page.locator('.van-action-sheet:visible').getByText('全选分摊', { exact: true }).click()
    await page.waitForSelector('.van-dialog:visible')
    await page.locator('.van-dialog:visible .van-dialog__confirm').click()
    await page.locator('.van-nav-bar__right').getByText('保存').click()
    await page.waitForSelector('.room-detail', { timeout: 15000 })

    // 本地账单 payer_id = 王五，created_by = 自己
    const membersInfo = await page.evaluate((rid: string) => {
      const rooms = JSON.parse(localStorage.getItem('aa_local_rooms_v2') || '{}')
      return rooms[rid].members.map((m: any) => ({ id: m.id, name: m.name }))
    }, roomId)
    const wangId = membersInfo.find((m: any) => m.name === '王五').id
    const selfId = membersInfo.find((m: any) => m.name === NICKNAME).id
    const bills = await page.evaluate((rid: string) => {
      return JSON.parse(localStorage.getItem('aa_local_bills_v2') || '{}')[rid]
    }, roomId)
    expect(bills).toHaveLength(2)
    for (const b of bills) {
      expect(b.payer_id).toBe(wangId)
      expect(b.created_by).toBe(selfId)
    }

    // 转在线后服务端 payer_id 正确
    await page.goto(`/room/${roomId}/settings`)
    await page.waitForSelector('.settings-page')
    await page.getByText('复制公共邀请链接').click()
    await page.waitForSelector('.van-dialog:visible')
    await page.getByRole('button', { name: '确认转换' }).click()
    await page.waitForTimeout(3000)
    const serverBills = await adminFetch(`bills?room_id=eq.${roomId}&select=created_by,payer_id`)
    expect(serverBills).toHaveLength(2)
    for (const b of serverBills) {
      expect(b.payer_id).toBe(wangId)
      expect(b.created_by).toBe(selfId)
    }
  })
})
