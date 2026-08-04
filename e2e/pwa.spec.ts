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
  localStorage.setItem('aa_cached_rooms', JSON.stringify({
    ["${LOCAL_ROOM_ID}"]: {
      id: "${LOCAL_ROOM_ID}",
      name: "${LOCAL_ROOM_NAME}",
      description: "仅存于本地的 PWA 测试房间",
      version: 1,
      created_at: "2026-08-04T08:00:00.000Z",
      updated_at: "2026-08-04T08:00:00.000Z",
      members: [
        { id: "member-1", name: "${NICKNAME}", user_id: "local-user" },
      ],
    },
  }))
  localStorage.setItem('aa_local_bills', JSON.stringify({
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
  localStorage.setItem('aa_room_versions', JSON.stringify({
    ["${LOCAL_ROOM_ID}"]: 1,
  }))
  localStorage.setItem('aa_expired_rooms', JSON.stringify(["${LOCAL_ROOM_ID}"]))
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
})
