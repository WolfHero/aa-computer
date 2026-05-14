# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

开发完成后不要直接运行dev server和supabase，应先请求接口判断dev server和supabase是否已在运行中。

## Commands

- `pnpm dev` — Start Vite dev server
- `pnpm build` — Type-check with vue-tsc + Vite build
- `pnpm preview` — Preview production build
- Supabase: use `npx supabase` commands (local instance at `http://127.0.0.1:54321`)

## Architecture

### Stack
- Vue 3 (Composition API, `<script setup lang="ts">`) + Vue Router 4 (history mode)
- Vant 4 (mobile UI components, registered globally in `main.ts`)
- ECharts 6 (AA result chart)
- Supabase (PostgreSQL + anonymous auth + RLS)
- Supabase client at `src/lib/supabaseClient.ts` (reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_KEY` from env)
- Offline-first: localStorage via `useLocalBills` composable

### Routes (src/router/index.ts)
| Path | Page | Purpose |
|------|------|---------|
| `/` | HomePage | Room list, create room, about/privacy |
| `/invite` | InvitePage | Join room via `?room_id=` |
| `/room/:id` | RoomDetailPage | Bill list (paginated), add/edit bills, submit |
| `/room/:id/aa` | AACalculationPage | AA result chart + related bills list |
| `/room/:id/settings` | RoomSettingsPage | Room info, member list, copy invite link |

### Data Flow
1. **Bills**: Created locally → saved to localStorage → "提交付账记录" pushes to Supabase → marks synced → increments room version
2. **AA Calculation**: Checks cached `aa_results` table (version match) → if stale, calls `calculate_aa` DB function → returns member net balances + transfer plan
3. **Version Caching**: Room version persisted in localStorage → on revisit, if version unchanged, loads bills from localStorage cache (avoids redundant fetch)

### Composables
- `useAuth` — Module-level `userId` ref, `initAuth()` calls `signInAnonymously()`, mounted before app
- `useRooms` — CRUD for rooms + members, paginated fetch (ROOM_PAGE_SIZE=10), session-level room ID cache
- `useLocalBills` — localStorage-based, revision counter for reactivity, CRUD + sync helpers
- `useRemoteBills` — Submit unsynced bills, check unsubmitted members, paginated fetch with filters/sort
- `useAAResult` — `getOrCalculateAA` (cache-then-calculate), wraps `calculate_aa` RPC

### Key Patterns
- **van-list pagination**: `immediate-check="false"` to prevent double-fetch on mount; `@load` handler increments page; `finished` when returned data < page size
- **Bill sync**: Local bills have `synced: false` until submitted. Merged views show local first, then remote
- **Self-pay exclusion**: AA calculation excludes bills where `cardinality(shared_by) = 1 AND created_by = shared_by[1]` (in SQL join condition)
- **Room version**: Incremented each time bills are submitted. Used to skip redundant fetches and invalidate AA cache

### Database (Supabase)
- 4 tables: `rooms`, `room_members`, `bills`, `aa_results`
- RLS enforced via `is_member_of_room()` security definer function
- `calculate_aa(p_room_id)` PL/pgSQL function: greedy pairing of net-positive/net-negative members
- `cleanup_expired_rooms()` deletes rooms untouched for 7 days
- Anonymous auth: `auth.uid()` maps to `room_members.user_id` (text)

### Components
- `AppNavBar` — Reusable nav bar (title, back button, right actions)
- `BillCard` — Bill display card with shared member tags, sync status badge, self-pay strikethrough
- `BillForm` — Dialog form for creating/editing bills (content, amount, date, shared members)
- `BillFilter` — Search bar + creator/date range filters (content has 1s debounce)
- `AACalculationChart` — ECharts nested pie (outer: my payment vs others; inner: receivable/payable) + transfers list
- `RoomCreateDialog` — Dialog for creating new rooms
- `RoomSettingsActionSheet` — Action sheet with sort toggle, submit, AA calculate, settings

### Style
- CSS variables in `src/style.css`: `--color-primary`, `--color-bg`, `--color-text`, `--color-text-secondary`, `--color-border`
- Vant theme overrides via `--van-*` CSS variables
- Pages use `min-height: 100vh; background: var(--color-bg)`

### Known Caveats
- Vant 4.9.24 `van-date-picker` crashes when passing `Date` to `model-value`; use `string[]` instead
- `van-list` fires `@load` on mount unless `immediate-check="false"`, causing duplicate requests
