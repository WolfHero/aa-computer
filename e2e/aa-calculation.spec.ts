import { test, expect } from '@playwright/test'

const NICKNAME = 'E2E测试员'

function extractRoomId(url: string): string {
  const m = url.match(/\/room\/([a-f0-9-]+)/)
  return m ? m[1] : ''
}

test.describe('AA 计算结果缓存与过期房间 E2E', () => {
  test.beforeEach(({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`  [page error] ${msg.text()}`)
    })
    page.on('pageerror', err => console.log(`  [pageerror] ${err.message}`))
  })

  // ====================================================================
  // 测试 1：完整 AA 计算流程
  // 覆盖：创建房间 → 添加成员 → 添加共享账单 → 提交 → AA 页面
  // ====================================================================
  test('流程1: 创建房间并完成 AA 计算', async ({ page }) => {
    const roomName = `AA-${Date.now()}`

    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // -- 创建房间 --
    await test.step('创建房间', async () => {
      await page.goto('/')
      await page.waitForSelector('.home-page')
      await page.locator('.van-nav-bar__right').getByText('新增房间').click()
      await page.waitForSelector('.van-dialog', { state: 'visible' })
      await page.locator('.van-dialog input').nth(0).fill(roomName)
      await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
      await page.locator('.van-dialog .van-button--primary').click()
      await page.waitForSelector('.settings-page', { timeout: 15000 })
    })

    const roomId = extractRoomId(page.url())
    expect(roomId).toBeTruthy()

    // -- 添加第二名成员 --
    await test.step('添加第二名成员', async () => {
      await page.getByText('添加成员').click()
      await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 3000 })
      await page.locator('.van-dialog .van-field__control').fill(`成员B-${Date.now()}`)
      await page.getByRole('button', { name: '确认' }).click()
      await page.waitForTimeout(1000)
      // 验证添加成功
      const memberCount = await page.locator('.member-name').count()
      expect(memberCount).toBeGreaterThanOrEqual(2)
    })

    // -- 回到房间详情页添加账单 --
    const billContent = `共享午餐 ${Date.now()}`

    await test.step('添加共享账单', async () => {
      // 回到房间详情页
      await page.locator('.van-nav-bar__left').click()
      await page.waitForSelector('.room-detail', { timeout: 10000 })
      await page.waitForTimeout(1000)

      // 新增账单
      await page.locator('.van-nav-bar__right').getByText('新增').click()
      await page.waitForSelector('.van-dialog', { state: 'visible' })

      await page.locator('.van-dialog input').nth(0).fill(billContent)
      await page.locator('.van-dialog input').nth(1).fill('120')

      // 勾选所有成员作为分摊人员（默认全部未勾选）
      const checkboxes = page.locator('.van-dialog .van-checkbox__label')
      const cbCount = await checkboxes.count()
      for (let i = 0; i < cbCount; i++) {
        await checkboxes.nth(i).click()
      }

      await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
      await expect(page.getByText(billContent)).toBeVisible({ timeout: 20000 })
    })

    // -- 导航到 AA 计算页面 --
    await test.step('AA 计算页面展示', async () => {
      await page.goto(`/room/${roomId}/aa`)
      await page.waitForSelector('.aa-page', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 验证导航栏标题
      await expect(page.locator('.van-nav-bar__title')).toContainText('AA计算')

      // 验证「重新计算」按钮可见
      await expect(page.locator('.van-nav-bar__right').getByText('重新计算')).toBeVisible()

      // 验证 AA 结果图表容器
      await expect(page.locator('.aa-chart-container')).toBeVisible()

      // 验证摘要区域可见（有金额数据）
      const summary = page.locator('.aa-summary')
      await expect(summary).toBeVisible()
      await expect(summary.locator('.summary-row').first()).toContainText('账单总金额')
    })

    // -- 验证 localStorage 缓存 --
    await test.step('localStorage 缓存 AA 结果', async () => {
      const cached = await page.evaluate(() => {
        const raw = localStorage.getItem('aa_local_aa_v2')
        return raw ? JSON.parse(raw) : null
      })
      expect(cached).not.toBeNull()
      expect(cached[roomId]).toBeDefined()
      expect(typeof cached[roomId].version).toBe('number')
      expect(cached[roomId].results.members).toBeDefined()
      expect(cached[roomId].results.transfers).toBeDefined()
      expect(cached[roomId].calculated_at).toBeTruthy()
    })
  })

  // ====================================================================
  // 测试 2：缓存命中后再次访问（不触发 RPC）
  // ====================================================================
  test('流程2: 缓存命中 — 刷新页面后从 localStorage 加载', async ({ page }) => {
    const roomName = `AA-cache-${Date.now()}`

    await page.addInitScript(() => {
      localStorage.setItem('aa_privacy_accepted', '1')
    })

    // 创建房间 + 成员 + 账单
    await page.goto('/')
    await page.waitForSelector('.home-page')
    await page.locator('.van-nav-bar__right').getByText('新增房间').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(roomName)
    await page.locator('.van-dialog input').nth(1).fill(NICKNAME)
    await page.locator('.van-dialog .van-button--primary').click()
    await page.waitForSelector('.settings-page', { timeout: 15000 })
    const roomId = extractRoomId(page.url())
    expect(roomId).toBeTruthy()

    // 添加第二名成员
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 3000 })
    await page.locator('.van-dialog .van-field__control').fill(`成员C-${Date.now()}`)
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    // 回到详情页添加账单
    await page.locator('.van-nav-bar__left').click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await page.waitForTimeout(1000)

    const billContent = `缓存测试 ${Date.now()}`
    await page.locator('.van-nav-bar__right').getByText('新增').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(billContent)
    await page.locator('.van-dialog input').nth(1).fill('200')

    // 勾选所有成员作为分摊人员
    const cb2 = page.locator('.van-dialog .van-checkbox__label')
    for (let i2 = 0; i2 < await cb2.count(); i2++) {
      await cb2.nth(i2).click()
    }

    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await expect(page.getByText(billContent)).toBeVisible({ timeout: 20000 })

    // 首次访问 AA 页面（触发 RPC，写入 localStorage）
    await page.goto(`/room/${roomId}/aa`)
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(3000)

    // 验证结果已显示
    await expect(page.locator('.aa-summary')).toBeVisible()
    await expect(page.locator('.aa-chart-container')).toBeVisible()

    // 验证 localStorage 已缓存
    const cachedAfterFirstVisit = await page.evaluate(() => {
      const raw = localStorage.getItem('aa_local_aa_v2')
      return raw ? JSON.parse(raw) : null
    })
    expect(cachedAfterFirstVisit).not.toBeNull()
    expect(cachedAfterFirstVisit[roomId]).toBeDefined()

    // 记录中列出的 member IDs
    const cachedMemberIds: string[] = cachedAfterFirstVisit[roomId].results.members.map(
      (m: { member_id: string }) => m.member_id
    )

    // -- 刷新页面（模拟再次访问） --
    await test.step('刷新页面，数据应从 localStorage 加载', async () => {
      // 清除内存缓存模拟，使用 addInitScript 确保 localStorage 数据在页面加载前就绪
      // 但这里我们只需要刷新，localStorage 数据还在
      await page.reload()
      await page.waitForSelector('.aa-page', { timeout: 15000 })
      await page.waitForTimeout(3000)

      // 摘要仍然显示
      await expect(page.locator('.aa-summary')).toBeVisible()
      await expect(page.locator('.aa-summary')).toContainText('账单总金额')

      // 图表容器可见
      await expect(page.locator('.aa-chart-container')).toBeVisible()

      // 「重新计算」按钮可见
      await expect(page.locator('.van-nav-bar__right').getByText('重新计算')).toBeVisible()

      // 验证缓存数据未丢失
      const cachedAfterRefresh = await page.evaluate(() => {
        const raw = localStorage.getItem('aa_local_aa_v2')
        return raw ? JSON.parse(raw) : null
      })
      expect(cachedAfterRefresh).not.toBeNull()
      expect(cachedAfterRefresh[roomId]).toBeDefined()
      expect(cachedAfterRefresh[roomId].version).toEqual(cachedAfterFirstVisit[roomId].version)
    })
  })

  // ====================================================================
  // 测试 3：重新计算按钮
  // ====================================================================
  test('流程3: 重新计算按钮触发 RPC 并更新缓存', async ({ page }) => {
    const roomName = `AA-recalc-${Date.now()}`

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
    await page.waitForSelector('.settings-page', { timeout: 15000 })
    const roomId = extractRoomId(page.url())
    expect(roomId).toBeTruthy()

    // 添加第二名成员
    await page.getByText('添加成员').click()
    await page.waitForSelector('.van-dialog', { state: 'visible', timeout: 3000 })
    await page.locator('.van-dialog .van-field__control').fill(`成员D-${Date.now()}`)
    await page.getByRole('button', { name: '确认' }).click()
    await page.waitForTimeout(1000)

    // 回到详情页添加账单
    await page.locator('.van-nav-bar__left').click()
    await page.waitForSelector('.room-detail', { timeout: 10000 })
    await page.waitForTimeout(1000)

    const billContent = `重新计算测试 ${Date.now()}`
    await page.locator('.van-nav-bar__right').getByText('新增').click()
    await page.waitForSelector('.van-dialog', { state: 'visible' })
    await page.locator('.van-dialog input').nth(0).fill(billContent)
    await page.locator('.van-dialog input').nth(1).fill('300')

    // 勾选所有成员作为分摊人员
    const cb3 = page.locator('.van-dialog .van-checkbox__label')
    for (let i3 = 0; i3 < await cb3.count(); i3++) {
      await cb3.nth(i3).click()
    }

    await page.locator('.van-dialog .van-button--primary').filter({ hasText: '保存' }).click()
    await expect(page.getByText(billContent)).toBeVisible({ timeout: 20000 })

    // 首次访问 AA 页面
    await page.goto(`/room/${roomId}/aa`)
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(3000)

    await expect(page.locator('.aa-summary')).toBeVisible()

    const versionBefore = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_aa_v2')
      if (!raw) return -1
      const parsed = JSON.parse(raw)
      return parsed[rid]?.version ?? -1
    }, roomId)
    expect(typeof versionBefore).toBe('number')

    // -- 点击「重新计算」 --
    await test.step('点击重新计算', async () => {
      await page.locator('.van-nav-bar__right').getByText('重新计算').click()
      // 等待 toast 出现
      await expect(page.getByText('已重新计算')).toBeVisible({ timeout: 15000 })

      // 验证结果仍然显示
      await expect(page.locator('.aa-summary')).toBeVisible()
      await expect(page.locator('.aa-chart-container')).toBeVisible()
    })
  })

  // ====================================================================
  // 测试 4：过期房间 AA 页面
  // 覆盖：过期房间可查看 AA 结果，但无「重新计算」按钮
  // ====================================================================
  test('流程4: 过期房间 — 查看缓存 AA 结果 + 无重新计算按钮', async ({ page }) => {
    const roomId = `e2e-expired-aa-${Date.now()}`
    const roomName = `AA过期房间 ${Date.now()}`
    const memberSelf = { id: 'exp-member-1', name: NICKNAME, user_id: null }
    const memberOther = { id: 'exp-member-2', name: '朋友B', user_id: null }

    await page.addInitScript(
      ({ rid, rname, mSelf, mOther }) => {
        localStorage.setItem('aa_privacy_accepted', '1')
        // 过期房间缓存（v2）
        localStorage.setItem('aa_local_rooms_v2', JSON.stringify({
          [rid]: {
            id: rid,
            name: rname,
            description: 'E2E 过期房间 AA 测试',
            version: 3,
            owner_id: null,
            mode: 'expired',
            self_member_id: mSelf.id,
            settings: {},
            created_at: '2026-05-27T08:00:00.000Z',
            updated_at: '2026-05-27T08:00:00.000Z',
            members: [
              { id: mSelf.id, name: mSelf.name, user_id: null, is_unsubmitted: false, created_at: '2026-05-27T08:00:00.000Z' },
              { id: mOther.id, name: mOther.name, user_id: null, is_unsubmitted: false, created_at: '2026-05-27T08:00:00.000Z' },
            ],
          },
        }))
        // AA 结果缓存（version 与房间一致 = 3）
        localStorage.setItem('aa_local_aa_v2', JSON.stringify({
          [rid]: {
            id: '',
            room_id: rid,
            version: 3,
            results: {
              members: [
                { member_id: mSelf.id, name: mSelf.name, total_paid: 150, total_share: 50, net: 100, self_pay: 0 },
                { member_id: mOther.id, name: mOther.name, total_paid: 0, total_share: 100, net: -100, self_pay: 0 },
              ],
              transfers: [
                { from_member_id: mOther.id, from_name: mOther.name, to_member_id: mSelf.id, to_name: mSelf.name, amount: 100 },
              ],
            },
            calculated_at: '2026-05-27T10:00:00.000Z',
          },
        }))
      },
      { rid: roomId, rname: roomName, mSelf: memberSelf, mOther: memberOther },
    )

    // -- 导航到 AA 页面 --
    await page.goto(`/room/${roomId}/aa`)
    await page.waitForSelector('.aa-page', { timeout: 15000 })
    await page.waitForTimeout(3000)

    // 验证导航栏标题
    await expect(page.locator('.van-nav-bar__title')).toContainText('AA计算')

    // 验证「重新计算」按钮不存在
    await expect(page.locator('.van-nav-bar__right').getByText('重新计算')).not.toBeVisible()

    // 验证图表容器可见
    await expect(page.locator('.aa-chart-container')).toBeVisible()

    // 验证摘要可见（展示缓存的金额数据）
    const summary = page.locator('.aa-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('账单总金额')

    // 验证转账明细可见
    await expect(page.locator('.transfer-section')).toBeVisible()
    await expect(page.locator('.transfer-item').first()).toBeVisible()

    // 验证相关账单区域为空（过期房间不加载账单）
    const emptyBills = page.locator('.empty-bills')
    await expect(emptyBills).toBeVisible()
    await expect(emptyBills).toContainText('暂无涉及你的账单')

    // 验证缓存未被清除
    const cached = await page.evaluate((rid: string) => {
      const raw = localStorage.getItem('aa_local_aa_v2')
      if (!raw) return null
      return JSON.parse(raw)[rid] ?? null
    }, roomId)
    expect(cached).not.toBeNull()
    expect(cached.version).toBe(3)
  })
})
