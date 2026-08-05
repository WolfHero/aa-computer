# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

开发完成后不要直接运行dev server和supabase，应先请求接口判断dev server和supabase是否已在运行中。

## Commands

- `pnpm dev` — Start Vite dev server
- `pnpm dev:container` — Start Vite dev server using `.env.container` (container-internal Supabase URL)
- `pnpm build` — Type-check with vue-tsc + Vite build
- `pnpm preview` — Preview production build
- `pnpm exec playwright test` — Run all E2E tests (needs dev server + Supabase running). Tests in `e2e/`: `aa-calculation.spec.ts`, `local-persistence.spec.ts`, `member-management.spec.ts`, `debug.spec.ts`
- `pnpm test:container` — Run E2E tests with container env (`.env.container`), for tests inside the dev container
- `pnpm exec playwright test --grep "test-name-pattern"` — Run specific E2E tests
- `pnpm exec playwright test e2e/pwa.spec.ts` — Run PWA tests (needs `pnpm build && pnpm preview --port 4173 --strictPort` running; skips automatically if preview is not up)
- Supabase: use `npx supabase` commands (local instance at `http://127.0.0.1:54321`)
- `npx supabase db reset` — Reset local DB and re-run all migrations

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
- `src/utils/` — `constants.ts` (storage keys, page sizes), `format.ts` (currency, date), `toast.ts` (Vant toast wrapper), `importParser.ts` (XLSX/CSV → `ParsedSheet[]`)

### Routes (src/router/index.ts)
| Path | Page | Purpose |
|------|------|---------|
| `/` | HomePage | Room list (local+remote), create room, about/privacy, cross-device login |
| `/invite` | InvitePage | Join room via `?room_id=` |
| `/invite/member` | InviteMemberPage | Join via member invite token `?token=` |
| `/room/:id` | RoomDetailPage | Bill list (paginated), add/edit/delete bills, submit to server |
| `/room/:id/aa` | AACalculationPage | AA result chart + related bills list |
| `/room/:id/settings` | RoomSettingsPage | Room info, member list (owner CRUD, invite links), delete local data |
| `/room/:id/import` | ImportPage | Import bills from XLSX/CSV (AG-Grid preview, column mapping, filter conditions) |

### Data Flow
1. **Bills**: Created locally → saved to localStorage → "提交付账记录" pushes to Supabase → marks synced → increments room version
2. **AA Calculation**: Checks cached `aa_results` table (version match) → if stale, calls `calculate_aa` DB function → returns member net balances + transfer plan
3. **Version Caching**: Room version persisted in localStorage → on revisit, if version unchanged, loads bills from localStorage cache (avoids redundant fetch)
4. **Expired room fallback**: If Supabase fetch fails (room deleted/expired), falls back to `useLocalRooms` cache, marks room as local-only read-only

### Composables
- `useAuth` — Module-level `userId` ref, `initAuth()` gets session or calls `signInAnonymously()`, `ensureAuth()` for operations needing auth, `getRefreshToken()`/`refreshSession()` for cross-device login
- `useRooms` — CRUD for rooms + members, paginated fetch (ROOM_PAGE_SIZE=10), version management, **owner functions**: `addMember`, `updateMemberName`, `removeMember`, `generateInviteToken`, `getMemberByInviteToken`, `acceptInvite`
- `useLocalRooms` — localStorage room cache, expired-room tracking set, save/remove/query by room ID
- `useLocalBills` — localStorage-based Bill[], revision counter for reactivity, CRUD + sync helpers (`markAsSynced`, `mergeFetchedBills`, `syncBillsFromServer`)
- `useRemoteBills` — `submitBills` (push unsynced → DB → mark synced), `fetchBills` (paginated with filters/sort), `checkUnsubmittedMembers`
- `useAAResult` — `getOrCalculateAA` (cache-then-calculate), wraps `calculate_aa` RPC

### Owner / Invite System
- Room creator is auto-assigned as `owner_id` on the `rooms` table
- Owner can: add members (with `user_id: null` placeholder), edit any member's name, delete members (protected by DB trigger if member is referenced in bills), generate per-member invite tokens
- Invite token flow: `generate_member_invite_token` RPC → `/invite/member?token=` page → `accept_invite` RPC binds the member to the current user
- RLS updated: `room_members` insert/update allows owner OR self; delete is owner-only via `is_room_owner()`

### Expired Room / Local-Only Mode
- Rooms not updated for 7 days are deleted by `cleanup_expired_rooms()`
- On fetch failure, `useLocalRooms` cache + `isRoomExpired()` set marks room as expired
- Expired rooms: read-only (no add/edit buttons, no "新增" in nav bar, expired banner shown), data persists locally
- HomePage merges `useRooms.rooms` (remote) + `useLocalRooms.getAllCachedRooms()` (local-only), shows "本地" badge on local-only rooms

### Import Feature (XLSX/CSV → Bills)
- Route: `/room/:id/import` — 3-step wizard: (0) file pick, (1) AG-Grid preview + column mapping + filter conditions, (2) editable card list review → save
- `src/utils/importParser.ts`: `parseXlsx()` (SheetJS, extracts native col widths via `cellStyles` + `wpx`/`wch`), `parseCsv()` (papaparse)
- **Column mapping**: time position (e.g. `A2` = col A row 2), content position (single col `E` or combined `E+F`), amount position (single col `G`)
- **Filter conditions**: visual builder (添加条件), each row has column picker + operator (>=/<=/==/!=) + value, rows chained with AND/OR connectors
- **Date parsing**: supports `YYYY-M-D HH:mm`, `YYYY/MM/DD`, serial Excel date numbers, Chinese date chars (年月日)
- **Save flow**: `addBills()` → localStorage → `submitBills()` push to Supabase → navigate back to room detail
- Uses AG-Grid (AllCommunityModule) for data preview with highlighted mapping cells, AG-Grid theme `legacy`
- AG-Grid overrides in global `<style>` for compact cell rendering (line-height: 28px, 12px font)

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
- **aa_results**: `room_id (unique)`, `version`, `results (jsonb)` — cached AA calculation, validated against room version
- RLS: `is_member_of_room()` security definer function; `is_room_owner()` for owner-only operations
- **DB functions**: `calculate_aa(p_room_id)` — greedy pairing algorithm; `is_member_of_room()`, `is_room_owner()` — RLS helpers; `get_member_by_invite_token()`, `accept_invite()`, `generate_member_invite_token()` — invite flow; `delete_bill()`, `update_bill()` — bill management; `cleanup_expired_rooms()` — 7-day cleanup
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

### Style
- CSS variables in `src/style.css`: `--color-primary`, `--color-bg`, `--color-text`, `--color-text-secondary`, `--color-border`
- Vant theme overrides via `--van-*` CSS variables
- Pages use `min-height: 100vh; background: var(--color-bg)`

### Known Caveats
- Vant 4.9.24 `van-date-picker` crashes when passing `Date` to `model-value`; use `string[]` instead
- `van-list` fires `@load` on mount unless `immediate-check="false"`, causing duplicate requests
- Local Supabase anonymous user data is stored in Docker container; lost on container restart
