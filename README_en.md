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

## License

MIT
