# AA Computer

**English** | [中文](README.md)

AA Computer is a mobile-first web application for group expense splitting and settlement. It supports creating rooms, inviting members, recording bills, and automatically calculating optimal transfer plans between members — making it easy to split costs for dinners, trips, shared housing, and more.

## Features

- **Room Management** — Create AA rooms, invite members via shareable links
- **Bill Management** — Add/edit bills with shared member selection, filter by creator/date
- **Offline-First** — Bills saved locally first, bulk-sync to cloud on demand
- **AA Settlement** — Automatically calculate net balances and generate optimal transfer plans (greedy pairing algorithm)
- **Result Visualization** — ECharts nested pie chart showing individual收支 and transfer relationships

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Vue 3 (Composition API + `<script setup>`) |
| Router | Vue Router 4 (history mode) |
| UI | Vant 4 (Mobile UI library) |
| Charts | ECharts 6 |
| Backend | Supabase (PostgreSQL + Anonymous Auth + RLS) |
| Build | Vite + TypeScript + vue-tsc |

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Production build
pnpm build

# Preview production build
pnpm preview
```

### Environment Variables

Create a `.env` file in the project root with your Supabase project info:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

## Project Structure

```
src/
├── components/        # Reusable components (NavBar, BillCard, BillForm, etc.)
├── composables/       # Composition functions (useAuth, useRooms, useLocalBills, etc.)
├── lib/               # Utilities (Supabase client)
├── router/            # Route configuration
├── views/             # Page views
│   ├── HomePage.vue           # Home: room list & creation
│   ├── InvitePage.vue         # Join room via invite
│   ├── RoomDetailPage.vue     # Room detail: bill list & submission
│   ├── AACalculationPage.vue  # AA calculation results
│   └── RoomSettingsPage.vue   # Room settings
├── App.vue
├── main.ts
└── style.css           # Global styles
```

## Data Flow

1. **Creating Bills** → Saved to localStorage → "Submit" pushes to Supabase → Marked as synced → Room version incremented
2. **AA Calculation** → Check `aa_results` table cache (version match) → If stale, call `calculate_aa` DB function → Return net balances + transfer plan
3. **Version Caching** → Room version persisted in localStorage → On revisit, use local cache if version unchanged

## Database

Built on Supabase PostgreSQL with 4 core tables: `rooms`, `room_members`, `bills`, `aa_results`. Access is controlled via RLS (Row-Level Security) and the `is_member_of_room()` helper function. AA calculation logic is implemented as a PL/pgSQL function `calculate_aa(p_room_id)`.

## Self-Deployment

### Prerequisites

- **Node.js** >= 18, **pnpm** (`npm i -g pnpm`)
- **Supabase** account (free tier works) or Docker (for local Supabase CLI)

---

### Option 1: Supabase Cloud (Recommended)

#### 1. Create a Supabase Project

Create a new project in the [Supabase Dashboard](https://supabase.com/dashboard/projects).

#### 2. Initialize the Database

Go to **SQL Editor** in your project dashboard, paste the entire contents of [`supabase/deploy.sql`](supabase/deploy.sql), and run it. This script sets up all tables, indexes, RLS policies, the AA calculation function, and everything else needed.

#### 3. Enable Anonymous Sign-In

In the Dashboard, go to **Authentication → Providers** and ensure **Allow anonymous sign-ins** is enabled (enabled by default).

#### 4. Get Your Project Credentials

Go to **Project Settings → API** and locate these two values:

| Config | Description |
| --- | --- |
| `Project URL` | e.g. `https://xxx.supabase.co` |
| `anon public key` | Safe to use on the client side |

#### 5. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

#### 6. Build the Frontend

```bash
pnpm install
pnpm build
```

The output is in `dist/` — deploy to any static hosting service.

#### Deploy to Vercel (Example)

1. Push the code to a GitHub repository
2. Import the repo in [Vercel](https://vercel.com)
3. Set Framework to **Vite**
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` in Environment Variables
5. Deploy — you'll get a public URL

Other supported platforms: **Netlify**, **Cloudflare Pages**, **GitHub Pages**, **Surge**, or any static file hosting.

---

### Option 2: Local Development (Supabase CLI + Docker)

Use this for local debugging and development. Requires Docker.

#### 1. Install Supabase CLI

```bash
# npm
npm i -g supabase

# scoop (Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# brew (macOS)
brew install supabase/tap/supabase
```

#### 2. Start Local Supabase Services

```bash
supabase start
```

On first run, Docker images (PostgreSQL, GoTrue, Studio, etc.) will be pulled. You'll see local credentials:

```
API URL: http://127.0.0.1:54321
anon key: eyJh... (locally generated)
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
```

#### 3. Apply Database Migrations

```bash
supabase db push
```

This runs all migration files from `supabase/migrations/` in order.

#### 4. Configure Environment Variables

Create a `.env` file with the local credentials from step 2:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=your-local-anon-key
```

#### 5. Start Dev Server

```bash
pnpm dev
```

The app is now at `http://localhost:5173`. Manage the local database via Supabase Studio at `http://127.0.0.1:54323`.

> **Note**: Anonymous user data in local development is stored in Docker containers and will be lost when containers are reset.

---

### Scheduled Cleanup

In production, call `cleanup_expired_rooms()` periodically (e.g., daily) via **Supabase Dashboard → Database → Triggers** or an external cron service to automatically delete rooms that haven't been updated in 7 days.

## License

MIT
