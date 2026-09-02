# Setup Guide — Supabase + Vercel

The app already runs fully functional with your real 9-season history, using an
in-memory store seeded from `src/lib/data/real-history.json` (produced by
`scripts/import-real-data.ts` from your uploaded Excel file). That's what you get
with zero configuration — run it locally and everything works, but data resets
whenever the server restarts.

Follow the steps below whenever you want permanent storage (Supabase) and a
public URL (Vercel). Takes about 10 minutes total.

## 0. Run it locally first

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the whole app (dashboard, trendline, circuits,
head-to-head, season rewind, War Mode, Excel import) works immediately.

---

## 1. Set up the database (Supabase)

Your project is already created: **xuqrvndebvgmepnaxnda** — the keys are saved
in `.env.supabase.credentials` in this project (never committed to git).

1. Open your project at https://supabase.com/dashboard/project/xuqrvndebvgmepnaxnda
2. In the left sidebar, click **SQL Editor** → **New query**.
3. Open `supabase/schema.sql` from this project, copy its entire contents, paste
   it into the SQL editor, and click **Run**. This creates all 6 tables
   (`players`, `circuits`, `points_mapping`, `seasons`, `races`,
   `import_batches`), seeds the two players and the points mapping, and turns
   on row-level security with public read access.
4. You should see "Success. No rows returned."

### Connect the app to it

```bash
mv .env.supabase.credentials .env.local
```

That's it — `src/lib/db/index.ts` automatically switches from the in-memory
store to Supabase the moment those environment variables are present. Restart
`npm run dev` and the app now reads/writes real Postgres.

### Load your historical data into it

Right after connecting, Supabase only has empty seasons/races tables. Push
your real 9-season history in with one command:

```bash
npx tsx scripts/seed-supabase.ts
```

This imports the exact same parsed data that's currently powering the local
demo — no need to re-upload the Excel file. (You can also re-upload it any
time via the **Import Data** page in the app itself; it's guarded against
duplicate imports by content hash.)

---

## 2. Deploy it live (Vercel)

Two ways to do this — pick whichever's easier.

### Option A — GitHub + Vercel dashboard (no tokens needed)

1. Create a new empty repo on GitHub (e.g. `mk-rivalry`).
2. From this project folder:
   ```bash
   git remote add origin https://github.com/<you>/mk-rivalry.git
   git add -A
   git commit -m "Initial commit"
   git push -u origin main
   ```
3. Go to https://vercel.com → **Add New** → **Project** → import that repo.
4. Before deploying, add these three Environment Variables (from
   `.env.local` / `.env.supabase.credentials`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Click **Deploy**. Vercel gives you a live `*.vercel.app` URL a minute or
   two later.

### Option B — Vercel CLI (if you'd rather not use GitHub)

```bash
npm install -g vercel
vercel login
vercel --prod
```

When prompted, add the same three environment variables (`vercel env add
NEXT_PUBLIC_SUPABASE_URL`, etc.) before the final deploy, or add them via
**Project Settings → Environment Variables** on vercel.com and redeploy.

---

## 3. After that

- Every future season played in **War Mode** writes straight to Supabase and
  is permanent.
- To import more historical seasons later, use the **Import Data** page —
  same validation, same duplicate-import protection.
- To swap in real circuit photography, drop files into `public/circuits/`
  named to match each circuit's `imageUrl` in `src/lib/data/circuits.ts` (or
  point `imageUrl` at a remote URL) — the placeholder art falls back
  automatically if a real image fails to load.
- To swap the two placeholder character avatars for real profile photos, set
  `profileImageUrl` on the players in `src/lib/data/points-mapping.ts` and
  swap `PlayerAvatar` for an `<img>`/`CircuitImage`-style component pointed
  at that URL.
