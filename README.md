# RIVALRY — Adi vs Ren

A Mario Kart Wii statistics dashboard and rivalry tracker: historical
analytics, season archives, head-to-head rivalry stats, circuit-level
analysis, player profiles, and a live "War Mode" for recording a new
32-race season in real time.

Built with Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 +
Supabase/Postgres + Recharts.

## Quickstart

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app runs immediately against your real
9-season history (imported from the Excel file you provided) via an
in-memory store — no database required to try it out.

For permanent storage and a live deploy URL, see **[SETUP.md](./SETUP.md)**.

## Project layout

```
src/
  app/                  routes (App Router) — one folder per page
    war-mode/actions.ts   Server Actions used by War Mode's live entry flow
    api/import/route.ts   Excel import API (preview + commit, dup-guarded)
  components/           UI, grouped by feature (dashboard, warmode, circuits, ...)
  lib/
    types.ts              raw domain types — the only source of truth
    stats/                 the ENTIRE derived-statistics layer (pure functions).
                            Every page/component consumes this — no stats math
                            is duplicated in UI code.
    db/                    data-access abstraction: local-store.ts (in-memory,
                            default) and supabase-store.ts (Postgres), selected
                            automatically by lib/db/index.ts based on env vars.
    excel/parse.ts         Excel import/validation pipeline (also used by
                            scripts/import-real-data.ts)
    data/                  circuit roster, points mapping default, seed/real data
supabase/schema.sql     Postgres schema + RLS policies
scripts/
  import-real-data.ts    (re)generates src/lib/data/real-history.json from a
                          raw Excel export
  seed-supabase.ts       pushes that same parsed history into a connected
                          Supabase project
```

## Design notes

- **Statistics are always derived, never authored.** Raw race results
  (circuit + both finishing positions) are the only thing ever entered or
  imported. Points, cumulative totals, season winners, championships,
  medians, swing probability, strongest/weakest tracks — all computed by
  `src/lib/stats` from those raw results, every time.
- **The points mapping is configurable**, not hardcoded — it's imported
  from your Excel file (or edited directly in `points_mapping`) and stored
  the same way as any other data.
- **War Mode and historical Excel import share one pipeline.** Both end up
  calling the same `DataStore.addRace` / `DataStore.importSeasons`
  methods and the same stats layer — there's exactly one way stats get
  computed in this app.
