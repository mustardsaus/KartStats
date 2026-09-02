-- ============================================================================
-- Mario Kart Wii Rivalry — Supabase / Postgres schema
--
-- Raw race results are the ONLY source of truth. Every statistic shown in
-- the app (points, cumulative totals, season winners, championships, career
-- totals, medians, swing probabilities, strongest/weakest tracks...) is
-- derived at read time by src/lib/stats from the rows in these tables —
-- nothing here stores a pre-computed aggregate as ground truth. Season-level
-- "final points" / "winner" columns are a convenience CACHE, always
-- reproducible by recomputing from `races`.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
create table if not exists players (
  id text primary key check (id in ('adi', 'ren')),
  name text not null,
  character_name text not null,
  profile_image_url text not null
);

insert into players (id, name, character_name, profile_image_url) values
  ('adi', 'Adi', 'Funky Kong', '/players/adi.svg'),
  ('ren', 'Ren', 'Rosalina', '/players/ren.svg')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
create table if not exists circuits (
  id text primary key,
  name text not null unique,
  image_url text not null default '/circuits/placeholder.svg',
  cup text,
  category text check (category in ('Nitro', 'Retro')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Configurable finishing-position -> points mapping. Never hardcoded in
-- application code; imported from the user's Excel file (or edited here).
create table if not exists points_mapping (
  finishing_position integer primary key check (finishing_position between 1 and 24),
  points integer not null check (points >= 0)
);

insert into points_mapping (finishing_position, points) values
  (1, 15), (2, 12), (3, 10), (4, 8), (5, 7), (6, 6),
  (7, 5), (8, 4), (9, 3), (10, 2), (11, 1), (12, 0)
on conflict (finishing_position) do nothing;

-- ---------------------------------------------------------------------------
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null unique,
  start_date timestamptz not null default now(),
  completion_date timestamptz,
  is_complete boolean not null default false,
  -- Cached convenience fields — always reproducible from `races`:
  winner_id text check (winner_id in ('adi', 'ren', 'tie')),
  adi_final_points integer,
  ren_final_points integer,
  created_at timestamptz not null default now()
);

create index if not exists seasons_season_number_idx on seasons (season_number);

-- ---------------------------------------------------------------------------
create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  race_number integer not null check (race_number between 1 and 32),
  circuit_id text not null references circuits (id),
  adi_finishing_position integer not null check (adi_finishing_position between 1 and 24),
  ren_finishing_position integer not null check (ren_finishing_position between 1 and 24),
  created_at timestamptz not null default now(),
  unique (season_id, race_number)
);

create index if not exists races_season_id_idx on races (season_id);
create index if not exists races_circuit_id_idx on races (circuit_id);

-- ---------------------------------------------------------------------------
-- Guards against accidental duplicate Excel imports: one row per source
-- file content-hash. The importer checks this before writing any races.
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  source_file_name text,
  season_numbers integer[] not null,
  race_count integer not null,
  imported_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security: this is a small private two-player app. Enable RLS
-- and allow the anon key read access; writes go through the service role
-- key on the server (Excel import, War Mode completion), never the client.
alter table players enable row level security;
alter table circuits enable row level security;
alter table points_mapping enable row level security;
alter table seasons enable row level security;
alter table races enable row level security;
alter table import_batches enable row level security;

create policy "public read players" on players for select using (true);
create policy "public read circuits" on circuits for select using (true);
create policy "public read points_mapping" on points_mapping for select using (true);
create policy "public read seasons" on seasons for select using (true);
create policy "public read races" on races for select using (true);
