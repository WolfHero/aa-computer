# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

开发完成后不要直接运行dev server和supabase，应先请求接口判断dev server和supabase是否已在运行中。

## Commands

- `pnpm dev` — Start Vite dev server
- `pnpm dev:container` — Start Vite dev server using `.env.container` (container-internal Supabase URL)
- `pnpm build` — Generate changelog (`scripts/generate-release-log.mjs`) + Type-check with vue-tsc + Vite build
- `pnpm preview` — Preview production build
- `pnpm exec playwright test` — Run all E2E tests (needs dev server + Supabase running). Tests in `e2e/`: `aa-calculation.spec.ts`, `debug.spec.ts`, `import.spec.ts`, `lifecycle.spec.ts`, `local-mode.spec.ts`, `local-persistence.spec.ts`, `member-management.spec.ts`, `privacy.spec.ts`, `pwa.spec.ts`
- `pnpm test:container` — Run E2E tests with container env (`.env.container`), for tests inside the dev container
- `pnpm exec playwright test --grep "test-name-pattern"` — Run specific E2E tests
- `pnpm exec playwright test e2e/pwa.spec.ts` — Run PWA tests (needs `pnpm build && pnpm preview --port 4173 --strictPort` running; skips automatically if preview is not up)
- `node scripts/generate-release-log.mjs` — Regenerate `src/data/release-log.json` from git history (主分支过滤、合并日期归因、WIP 排除、四类更新分类)；`pnpm build` 会自动执行
- Supabase: use `npx supabase` commands (local instance at `http://127.0.0.1:54321`)
- `npx supabase db reset` — Reset local DB and re-run all migrations
- ESA 部署/部署状态检查：使用 **npm 全局安装**的 `esa-cli`（如 `esa-cli deployments list --skip-update-check`），不要用 `pnpm exec esa-cli`——项目内依赖在部分开发容器（9p 文件系统）上会因模块加载卡死

### Git commit
- 使用 Bash 工具执行 `git commit` 时，用 `"$(cat <<'EOF'\n...\nEOF\n)"` 传递多行消息
- 不要在 Bash 中使用 PowerShell 的 `@'...'@` heredoc 语法，Bash 会把 `@` 当成普通字面量包含进去

## Architecture

### Stack
- Vue 3 (Composition API, `<script setup lang="ts">`) + Vue Router 4 (history mode)
- Vite 7 with `@` path alias resolving to `src/`
- Vant 4 (mobile UI components, registered globally in `main.ts`)
- ECharts 6 (AA result chart)
- Supabase (PostgreSQL + anonymous auth + RLS)
- Supabase client at `src/lib/supabaseClient.ts` (reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_KEY` from env)
- Offline-first: localStorage via `useLocalBills` + `useLocalRooms` composables
- `ag-grid-community` + `ag-grid-vue3` (import preview grid in ImportPage)
- `papaparse` (CSV parsing), `xlsx` (SheetJS, XLSX parsing)
- `dayjs` (date parsing in ImportPage with custom format plugin)
- `markdown-it` (更新日志正文渲染，`html: false` + linkify)
- `scripts/generate-release-log.mjs` — 从 git 记录生成 `src/data/release-log.json`，随 `pnpm build` 自动执行；ESA 部署时自动产出最新日志
- `src/utils/` — `constants.ts` (storage keys, page sizes), `format.ts` (currency, date), `toast.ts` (Vant toast wrapper), `importParser.ts` (XLSX/CSV → `ParsedSheet[]`)

### Routes (src/router/index.ts)
| Path | Page | Purpose |
|------|------|---------|
| `/` | HomePage | Room list (local+remote), create room, about/privacy, cross-device login；设置菜单含深色模式与更新日志入口 |
| `/invite` | InvitePage | Join room via `?room_id=` |
| `/invite/member` | InviteMemberPage | Join via member invite token `?token=` |
| `/room/:id` | RoomDetailPage | Bill list (paginated), add/edit/delete bills, submit to server |
| `/room/:id/aa` | AACalculationPage | AA result chart + related bills list |
| `/room/:id/settings` | RoomSettingsPage | Room info, member list (owner CRUD, invite links), delete local data |
| `/room/:id/import` | ImportPage | Import bills from XLSX/CSV (AG-Grid preview, column mapping, filter conditions) |
| `/changelog` | ChangelogPage | 更新日志列表（按日期分组，类型徽章） |
| `/changelog/:id` | ChangelogDetailPage | 更新详情（开发者/日期/正文 markdown 渲染/备注） |

### Data Flow
1. **Local rooms (default)**: New rooms are created in `aa_local_rooms_v2` / `aa_local_bills_v2` without auth; bills/members/import/AA are fully offline. `useLocalAA` replicates `calculate_aa` in TS; local room version bumps on every bill/member change to invalidate the AA cache
2. **Convert to online**: Only invite actions in room settings (public link / member token) trigger a confirm dialog → `ensureAuth()` → `convert_local_room` RPC (atomic, idempotent) uploads room/members/bills; bills are marked synced and the room mode becomes `online`. Conversion is one-way; failures keep the room local and retryable
3. **Online rooms**: Bills submit via `submitBills` → Supabase → mark synced → increment server room version; AA uses `aa_results` cache then `calculate_aa` RPC
4. **Expired fallback**: When an online room's server fetch definitively fails, the cached room becomes `mode: 'expired'` (read-only; member `user_id` cleared, self marked via `self_member_id`). The expired-room menu can rebuild it as a brand-new local room (new id, members unbound); unmigrated v1 caches (`aa_cached_rooms` etc.) show as 旧数据 and can be migrated to v2 locally

### Composables
- `useAuth` — Module-level `userId` ref, `initAuth()` gets session or calls `signInAnonymously()`, `ensureAuth()` for operations needing auth, `getRefreshToken()`/`refreshSession()` for cross-device login
- `useRooms` — CRUD for rooms + members, paginated fetch (ROOM_PAGE_SIZE=10), version management, **owner functions**: `addMember`, `updateMemberName`, `removeMember`, `generateInviteToken`, `getMemberByInviteToken`, `acceptInvite`
- `useLocalRooms` — localStorage room cache, expired-room tracking set, save/remove/query by room ID
- `useLocalBills` — localStorage-based Bill[], revision counter for reactivity, CRUD + sync helpers (`markAsSynced`, `mergeFetchedBills`, `syncBillsFromServer`)
- `useRemoteBills` — `submitBills` (push unsynced → DB → mark synced), `fetchBills` (paginated with filters/sort), `checkUnsubmittedMembers`
- `useAAResult` — `getOrCalculateAA` (cache-then-calculate), wraps `calculate_aa` RPC
- `useLocalAA` — pure TS replication of `calculate_aa` for local/expired rooms, cached in `aa_local_aa_v2`
- `useLocalBackup` — local room export/import (`aa-local-room-v1` JSON)
- `useRoomLifecycle` — rebuild expired room as local, migrate v1 cache to v2, delete all local room data
- `useTheme` — 深色模式：localStorage `aa_theme` 持久化 + 首次跟随 `prefers-color-scheme`，驱动 `[data-theme='dark']` 与 Vant ConfigProvider

### Owner / Invite System
- Local room creator is identified by `self_member_id`; conversion binds that member to the anonymous user and sets `rooms.owner_id`
- Owner can: add members (with `user_id: null` placeholder), edit any member's name, delete members (protected by DB trigger if member is referenced in bills), generate per-member invite tokens
- Invite token flow: `generate_member_invite_token` RPC → `/invite/member?token=` page → `accept_invite` RPC binds the member to the current user
- RLS updated: `room_members` insert/update allows owner OR self; delete is owner-only via `is_room_owner()`

### Expired Room / Local-Only Mode
- Rooms not updated for 7 days are deleted by `cleanup_expired_rooms()`
- Local storage is versioned: `aa_local_rooms_v2` (`mode: 'local' | 'online' | 'expired'`, `self_member_id`), `aa_local_bills_v2`, `aa_local_aa_v2`; v1 keys are migration sources only
- Expired rooms are read-only (no add/edit, no invite, expired banner shown); menu offers 重建为本地房间 (new id, unbound members, old entry removed) or 删除本地数据
- Local rooms support export/import (`aa-local-room-v1` JSON, same-id overwrite allowed only for local-mode conflicts); online/expired rooms do not
- HomePage merges remote online rooms + v2 local/expired rooms + legacy v1 rooms with badges 在线/本地/过期只读/旧数据

### Import Feature (XLSX/CSV → Bills)
- Route: `/room/:id/import` — 3-step wizard: (0) file pick, (1) AG-Grid preview + column mapping + filter conditions, (2) editable card list review → save
- `src/utils/importParser.ts`: `parseXlsx()` (SheetJS, extracts native col widths via `cellStyles` + `wpx`/`wch`), `parseCsv()` (papaparse)
- **Column mapping**: time position (e.g. `A2` = col A row 2), content position (single col `E` or combined `E+F`), amount position (single col `G`)
- **Filter conditions**: visual builder (添加条件), each row has column picker + operator (>=/<=/==/!=) + value, rows chained with AND/OR connectors
- **Date parsing**: supports `YYYY-M-D HH:mm`, `YYYY/MM/DD`, serial Excel date numbers, Chinese date chars (年月日)
- **Save flow**: `addBills()` → localStorage → `submitBills()` push to Supabase → navigate back to room detail
- Uses AG-Grid (AllCommunityModule) for data preview with highlighted mapping cells, AG-Grid theme `legacy`
- AG-Grid CSS 类按主题切换 `ag-theme-quartz` / `ag-theme-quartz-dark`（gridOptions.theme 仍为 `legacy`）；全局 `<style>` 覆盖紧凑渲染（line-height: 28px, 12px font）

### Key Patterns
- **van-list pagination**: `immediate-check="false"` to prevent double-fetch on mount; `@load` handler increments page; `finished` when returned data < page size
- **Bill sync**: Local bills have `synced: false` until submitted. Merged views show unsynced local first, then remote synced
- **Room version**: Incremented each time bills are submitted. Used to skip redundant fetches and invalidate AA cache
- **Cross-device login**: Home settings → copy refresh token → paste on another device → `refreshSession()` replaces session, backs up/restores localStorage on token change
- **Self-pay exclusion**: AA calculation excludes bills where `cardinality(shared_by) = 1 AND created_by = shared_by[1]` (in SQL join condition)

### Database (Supabase — 11 migrations)
- **rooms**: `id (uuid)`, `name`, `description`, `owner_id (text)` — tracks room creator, `version (int)`, `settings (jsonb)`, timestamps
- **room_members**: `id (uuid)`, `room_id`, `user_id (text, nullable)` — null for owner-created placeholder members, `name`, `is_unsubmitted`, `invite_token (text, nullable)` — per-member invite link
- **bills**: `id (uuid)`, `room_id`, `content`, `amount (numeric(12,2))`, `paid_at`, `shared_by (uuid[])` — references member IDs, `created_by (uuid)` — member ID, `creator_name`
- **bills 语义**: `created_by` 是账单创建人（不可变），`payer_id` 是付款人（默认=创建人）；付款人只有账单创建人可改，可选值仅限自己或未绑定成员（`update_bill` 服务端校验），AA 按 `payer_id` 结算
- **aa_results**: `room_id (unique)`, `version`, `results (jsonb)` — cached AA calculation, validated against room version
- RLS: `is_member_of_room()` security definer function; `is_room_owner()` for owner-only operations
- **DB functions**: `calculate_aa(p_room_id)` — greedy pairing algorithm; `convert_local_room(...)` — atomic local→online conversion (idempotent); `is_member_of_room()`, `is_room_owner()` — RLS helpers; `get_member_by_invite_token()`, `accept_invite()`, `generate_member_invite_token()` — invite flow; `delete_bill()`, `update_bill()` — bill management; `cleanup_expired_rooms()` — 7-day cleanup
- **Trigger**: `trg_check_member_in_bills` on `room_members` before-delete — prevents deleting a member referenced in any bill's `shared_by` array

### Components (src/components/)
- `AppNavBar` — Reusable nav bar (title, back button, right action buttons array)
- `BillCard` — Bill display card with shared member tags, sync status badge, self-pay strikethrough
- `BillForm` — Vant dialog form for create/edit (content, amount, date, shared member checkboxes); includes delete button when editing
- `BillFilter` — Search bar (1s debounce) + creator/date range filters
- `ImportBillCard` — Editable card for each imported bill row (content, amount, date, shared member checkboxes, raw data detail popup)
- `AACalculationChart` — ECharts nested pie (outer: my payment vs others; inner: receivable/payable) + transfers list
- `RoomCreateDialog` — Dialog for creating new rooms (name, description, creator nickname)
- `RoomSettingsActionSheet` — Action sheet with sort toggle, submit bills, AA calculate, settings, delete local
- `PrivacyDialog` — Privacy policy acceptance dialog (shown on first visit)
- `UpdatePrompt` — PWA 新版本提示（「发现新版本」弹窗 + 更新日志入口 + 返回后重新弹出）
- `ChangelogPage` / `ChangelogDetailPage` — 更新日志两级页面（列表 / 详情）

### Style
- CSS variables in `src/style.css`: 语义色 `--color-primary/bg/surface/surface-raised/text/text-secondary/border`、状态 tint `--color-tint-*`、`--color-danger`；`[data-theme='dark']` 覆盖块为 One Dark 配色
- 深色模式：`useTheme` + App.vue 的 `van-config-provider`；AG-Grid 用 `ag-theme-quartz-dark`，ECharts 用官方 dark 主题
- Pages use `min-height: 100vh; background: var(--color-bg)`

### PWA 更新
- 更新提示在 `UpdatePrompt.vue`（App.vue 内），`registerType: 'prompt'`；注册后主动 `registration.update()` 强制检查
- 本地预览（如 4173）会注册 SW，旧版本会赖在浏览器缓存里；刷新看不到新内容时清站点数据或换端口（SW 按端口隔离）
- 测更新流程：「两段构建」——构建 → 访问装 SW → 改代码再构建 → 刷新应弹「发现新版本」；点「更新日志」去 changelog 后返回，弹窗会重新出现

### Known Caveats
- Vant 4.9.24 `van-date-picker` crashes when passing `Date` to `model-value`; use `string[]` instead
- `van-list` fires `@load` on mount unless `immediate-check="false"`, causing duplicate requests
- Local Supabase anonymous user data is stored in Docker container; lost on container restart
- 开发容器中 `pnpm exec esa-cli` 可能因 9p 文件系统问题在模块加载时卡死；用 npm 全局安装的 esa-cli
