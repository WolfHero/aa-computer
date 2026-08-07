#!/usr/bin/env node
/**
 * 生成自托管 Supabase 部署所需密钥（Node >= 18，Windows/macOS/Linux 通用）。
 *
 * 用法：
 *   node scripts/generate-supabase-keys.mjs > docs/self-hosting/.env
 *
 * 输出内容包含敏感密钥，请确保 .env 不提交到版本库（仓库 .gitignore 已忽略 .env）。
 */
import { randomBytes, createHmac } from 'node:crypto'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

const postgresPassword = b64url(randomBytes(24)) // 32 字符 base64url
const jwtSecret = b64url(randomBytes(48))        // 64 字符 base64url
const now = Math.floor(Date.now() / 1000)
const exp = now + 60 * 60 * 24 * 365 * 10        // 10 年后过期，可自行调整

const anonKey = signJwt({ role: 'anon', iss: 'supabase', iat: now, exp }, jwtSecret)
const serviceRoleKey = signJwt({ role: 'service_role', iss: 'supabase', iat: now, exp }, jwtSecret)

console.log(`# ============ AA Computer 自托管 Supabase 密钥 ============
# 请将以下内容保存为 docs/self-hosting/.env（与 docker-compose.yml 同目录），不要提交到仓库
# 密钥已按当前时间生成，过期时间 10 年后（${new Date(exp * 1000).toISOString()}）

# 数据库与 JWT 主密钥
POSTGRES_PASSWORD=${postgresPassword}
JWT_SECRET=${jwtSecret}
JWT_EXPIRY=3600

# API 密钥（HS256 JWT；前端 VITE_SUPABASE_KEY 使用 ANON_KEY）
ANON_KEY=${anonKey}
SERVICE_ROLE_KEY=${serviceRoleKey}

# 对外暴露的 Kong 端口（默认 8000；与本地 CLI 栈共存时可改为 54321 等未占用端口）
KONG_HTTP_PORT=8000

# GoTrue 需要：SITE_URL 为前端访问地址；API_EXTERNAL_URL 为 Kong 公网地址 + /auth/v1
SITE_URL=https://your-app.example.com
API_EXTERNAL_URL=https://your-api.example.com/auth/v1
ADDITIONAL_REDIRECT_URLS=

# 保留占位（精简方案不含 Studio，官方 compose 需要时才用到）
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=change-me
`)
