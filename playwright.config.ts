import { defineConfig } from '@playwright/test'
import { loadEnv } from 'vite'

// 按 mode 加载环境变量, 供 e2e 测试读取 (默认 development = 宿主机):
// - pnpm test              → .env.local         (http://127.0.0.1:54321)
// - pnpm test:container    → .env.container     (http://supabase_kong_*:8000)
const mode = process.env.VITE_MODE ?? 'development'
Object.assign(process.env, loadEnv(mode, process.cwd()))

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
  },
})
