#!/usr/bin/env node
/**
 * 从 git 提交记录生成更新日志静态数据（src/data/release-log.json）。
 *
 * 已接入 npm run build（构建前自动生成），因此 ESA 等平台只要执行 build
 * 即可让部署产物带上最新日志。CI/沙箱环境下若 git 不可用、或历史为浅克隆，
 * 本脚本会保留仓库中已提交的 JSON 并给出警告，不会导致构建失败。
 *
 * 规则：
 * - 只收录主分支（默认 origin/HEAD 指向的分支）可达的提交
 * - 排除合并提交本身与 WIP（wit/wip/work in progress）提交
 * - 合并进来的需求：提交日期取合并提交日期，开发者取原提交作者
 * - 更新类型：feature（新功能）/ perf（性能优化）/ fix（缺陷修复）/ dev（开发侧调整）
 * - 类型优先使用下方显式映射，未覆盖的按提交信息规则推断
 * - 排序按完整提交时间倒序：普通提交用提交时间（%cI，与 git log 一致），
 *   合并进来的提交用合并提交时间；同日同秒按 git rev-list 顺序兜底；
 *   date 字段只保留到天，用于页面分组展示
 * - generatedAt 取主分支最新提交日期，保证同一提交重复构建产物一致
 *
 * 用法：pnpm exec node scripts/generate-release-log.mjs
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'release-log.json')

const TYPE_OVERRIDES = {
  '6f439b1': 'feature', // 项目初始化
  '0ae747f': 'dev', // 项目基础信息
  'bc22096': 'feature', // 账单编辑/删除功能
  '835e342': 'fix', // 字段长度限制与表单校验修复
  '2717629': 'dev', // ESA 部署配置
  'a66b220': 'dev', // vue-tsc 类型错误修复（不影响功能）
  'a318acf': 'feature', // 跨设备登录 + 延迟匿名注册
  '36ab29b': 'fix', // 未登录查询修复
  '01fab72': 'fix', // CORS 残留 token 等修复
  '6731c18': 'dev', // 数据库清理函数（运维侧）
  'eb5eab6': 'fix', // BillForm 金额小数输入修复
  '9ebd626': 'fix', // 禁用表单自动补全
  '0e9afe5': 'feature', // AA 页新增承担金额展示
  'a23d520': 'fix', // 导航栏按钮视觉修复
  'e9db385': 'fix', // Supabase 安全告警修复
  'fb88fbe': 'dev', // README 自部署指南
  'd38c10a': 'dev', // README 补充说明
  'b573ae5': 'dev', // ROADMAP
  'a3da8d5': 'feature', // 本地房间持久化
  '4ed0dd2': 'dev', // gitignore
  '1383bd3': 'feature', // 房主管理功能
  'cbdec2c': 'feature', // 成员删除保护等（混合提交，核心为新增行为）
  '1706ec0': 'feature', // AA 结果本地缓存
  '0c415df': 'fix', // calculate_aa CTE 作用域修复
  '53bfd2f': 'dev', // 导入样例模板文件
  '1190196': 'feature', // 账单导入功能
  '5050510': 'feature', // XLSX 原生列宽
  '38fac62': 'feature', // 可视化条件构建器
  '97d12fe': 'dev', // 路线图
  '98b0225': 'fix', // 关闭浏览器自动补全
  '6620141': 'dev', // CLAUDE.md
  'e57e749': 'dev', // dev container 配置
  'a226fdf': 'fix', // AA 计算笛卡尔积金额放大
  'f9e48bc': 'feature', // PWA 化
  'aee6aee': 'dev', // 优化清单文档
  'cf80c61': 'dev', // dev container / MCP 配置
  '0b56671': 'feature', // 本地优先模式等
  'bae3220': 'dev', // 路线图
  '75afbc0': 'dev', // devcontainer 别名与调研文档
}

const TITLE_OVERRIDES = {
  '6f439b1': '项目初始化',
}

const DEV_SUBJECT_PATTERN =
  /^(chore|docs|build|gitignore|style|refactor|test)\b|dev\s*container|devcontainer|CLAUDE\.?md|README|ROADMAP|路线图|部署|ESA|模板|基础信息|优化清单|MCP/i
const WIP_SUBJECT_PATTERN = /^wit\b|^wip\b|^work in progress/i
const MERGE_SUBJECT_PATTERN = /^merge\b/i

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function gitAvailable() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function isShallowClone() {
  try {
    return git(['rev-parse', '--is-shallow-repository']) === 'true'
  } catch {
    return false
  }
}

/**
 * 解析主分支：优先 origin/HEAD → master/main → 当前检出分支 → HEAD。
 * 保持"只收录主分支"的语义，同时兼容 CI 的 detached HEAD。
 */
function resolveMainBranch() {
  try {
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '')
  } catch {
    // fall through
  }
  for (const branch of ['master', 'main']) {
    try {
      git(['rev-parse', '--verify', '--quiet', branch])
      return branch
    } catch {
      // fall through
    }
  }
  try {
    return git(['symbolic-ref', '--short', 'HEAD'])
  } catch {
    return 'HEAD'
  }
}

function classify(subject, hash) {
  if (TYPE_OVERRIDES[hash]) return TYPE_OVERRIDES[hash]
  if (DEV_SUBJECT_PATTERN.test(subject)) return 'dev'
  if (/^(perf)\b|性能|优化/.test(subject)) return 'perf'
  if (/^(fix)\b|修复/.test(subject)) return 'fix'
  if (/^(feat)\b|实现|新增|支持|PWA|添加/.test(subject)) return 'feature'
  return 'dev'
}

function cleanTitle(subject) {
  return subject.replace(/^(feat|fix|chore|docs|perf|build|refactor|test|gitignore|style)\s*:\s*/i, '')
}

function commitInfo(hash) {
  const raw = git(['show', '-s', '--format=%an%x00%ae%x00%aI%x00%cI%x00%s%x00%b', hash])
  const [developer, email, date, commitDate, subject, body = ''] = raw.split('\0')
  return { hash, developer, email, date, commitDate, subject, body: body.trim() }
}

function mergeDateFor(commit, main) {
  const line = git([
    'log',
    '--merges',
    '--ancestry-path',
    '--format=%aI',
    `${commit}..${main}`,
  ])
    .split('\n')
    .filter(Boolean)
  return line[0] ?? null
}

if (!gitAvailable()) {
  console.warn('[changelog] 未检测到 git 环境，跳过生成，保留已提交的 release-log.json')
  process.exit(0)
}

const main = resolveMainBranch()

if (isShallowClone()) {
  console.warn(`[changelog] 当前为浅克隆（主分支 ${main}），历史不完整，跳过生成，保留已提交的 release-log.json`)
  process.exit(0)
}

let generatedAt
try {
  generatedAt = git(['log', '-1', '--format=%aI', main]).slice(0, 10)
} catch {
  generatedAt = new Date().toISOString().slice(0, 10)
}

const firstParent = git(['rev-list', '--first-parent', main]).split('\n').filter(Boolean)
const all = git(['rev-list', main]).split('\n').filter(Boolean)
const firstParentSet = new Set(firstParent)

const entries = []
const seen = new Set()
const entryTimes = new Map()
const entrySeq = new Map()

for (const hash of all) {
  if (seen.has(hash)) continue
  seen.add(hash)

  const info = commitInfo(hash)
  if (MERGE_SUBJECT_PATTERN.test(info.subject)) continue
  if (WIP_SUBJECT_PATTERN.test(info.subject)) continue

  const mergedIn = !firstParentSet.has(hash)
  const date = mergedIn
    ? (mergeDateFor(hash, main) ?? info.date)
    : info.date
  const id = hash.slice(0, 7)

  entryTimes.set(id, mergedIn ? date : info.commitDate)
  entrySeq.set(id, entries.length)
  entries.push({
    id,
    type: classify(info.subject, id),
    title: TITLE_OVERRIDES[id] ?? cleanTitle(info.subject),
    developer: info.developer,
    date: date.slice(0, 10),
    body: info.body,
    remark: '',
  })
}

entries.sort((a, b) => {
  const ta = Date.parse(entryTimes.get(a.id) ?? a.date)
  const tb = Date.parse(entryTimes.get(b.id) ?? b.date)
  if (ta !== tb) return tb - ta
  return (entrySeq.get(a.id) ?? 0) - (entrySeq.get(b.id) ?? 0)
})

const payload = {
  mainBranch: main,
  generatedAt,
  entries,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)
console.log(`已生成 ${OUT}：共 ${entries.length} 条（主分支 ${main}）`)
