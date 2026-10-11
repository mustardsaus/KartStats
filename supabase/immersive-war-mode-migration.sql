-- ============================================================================
-- Immersive War Mode: the Dolphin telemetry bridge.
--
-- War Mode gains a second flow alongside the original, untouched Manual
-- flow: Immersive, where a Python tracker reading live Dolphin memory
-- drives automatic position/lap/item tracking and finalizes races itself.
-- This migration is purely additive -- every new column is nullable and
-- every existing row (Manual, Battle Mode, imported history) stays
-- completely untouched; `mode`/`display_config` default to NULL, which
-- the application layer treats as "manual" (see RawSeason.mode in
-- lib/types.ts).
--
-- Three new tables:
--   - live_telemetry_events: the EPHEMERAL holding area for a race still
--     in progress (mirrors the role battle_rounds plays for Battle Mode).
--     Cleared once a race finalizes into a permanent `races` row below.
--   - race_position_samples / race_item_events: the PERMANENT per-race
--     detail a finalized Immersive race carries forever -- the full
--     position-over-time and item timelines, written once at finalize
--     time from the same rows that drove the live dashboard, never
--     reconstructed after the fact (spec section 8). Manual/Battle Mode
--     races simply have no rows here.
--
-- Safe to run multiple times -- every statement is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- seasons: Immersive setup (mode, display config, slot assignment, and the
-- season-long character/kart/transmission loadout -- same roster/columns
-- Kart Kontrol already uses on `races`/`battle_rounds`, just fixed once up
-- front here instead of re-picked per round).
alter table seasons
  add column if not exists mode text check (mode in ('manual', 'immersive')),
  add column if not exists display_config text check (display_config in ('same-device', 'dual-device')),
  add column if not exists adi_telemetry_slot smallint check (adi_telemetry_slot in (1, 2)),
  add column if not exists ren_telemetry_slot smallint check (ren_telemetry_slot in (1, 2)),
  add column if not exists adi_character text,
  add column if not exists adi_kart text,
  add column if not exists adi_transmission text check (adi_transmission in ('automatic', 'manual')),
  add column if not exists ren_character text,
  add column if not exists ren_kart text,
  add column if not exists ren_transmission text check (ren_transmission in ('automatic', 'manual'));

-- ---------------------------------------------------------------------------
-- races: per-lap + final times in milliseconds. Immersive only -- lap 0 is
-- dropped at telemetry ingestion (see dropLapZeroEvents in
-- lib/telemetry/events.ts), so these are always real laps 1-3. Circuit
-- Records (lib/stats/circuit-records.ts) are the only consumer; the core
-- points/standings stats layer never reads these.
alter table races
  add column if not exists adi_lap1_time_ms integer,
  add column if not exists adi_lap2_time_ms integer,
  add column if not exists adi_lap3_time_ms integer,
  add column if not exists adi_final_time_ms integer,
  add column if not exists ren_lap1_time_ms integer,
  add column if not exists ren_lap2_time_ms integer,
  add column if not exists ren_lap3_time_ms integer,
  add column if not exists ren_final_time_ms integer;

-- ---------------------------------------------------------------------------
-- live_telemetry_events: ephemeral holding area for a race in progress.
-- `payload` carries the full slot-resolved StoredTelemetryEvent (see
-- lib/telemetry/events.ts) as JSON; season_id/race_number/event_type/ts_ms
-- are mirrored into their own columns purely so queries and RLS don't need
-- to reach into the JSON. Rows are deleted (not just marked) once a race
-- finalizes -- there is no "soft delete" for this table, by design.
create table if not exists live_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  race_number integer not null,
  event_type text not null,
  ts_ms integer not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists live_telemetry_events_season_race_idx
  on live_telemetry_events (season_id, race_number);

-- ---------------------------------------------------------------------------
-- race_position_samples: permanent position-over-time timeline for one
-- finalized Immersive race. Powers both the live position graph during the
-- race (via the realtime subscription on live_telemetry_events above,
-- before the race finalizes) and the Season Rewind position graph
-- afterward (reading this table, after it does).
create table if not exists race_position_samples (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id) on delete cascade,
  player_id text not null check (player_id in ('adi', 'ren')),
  ts_ms integer not null,
  position integer not null,
  lap integer not null
);

create index if not exists race_position_samples_race_id_idx on race_position_samples (race_id);

-- ---------------------------------------------------------------------------
-- race_item_events: permanent item-received timeline for one finalized
-- Immersive race -- powers the Season Rewind powerup graph. Aggregate
-- counts for Tomfoolery Tales are written separately, straight into the
-- existing `race_powerups` table (see addRacePowerups in db/types.ts) --
-- this table is the detailed timeline, not a second source of totals.
create table if not exists race_item_events (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id) on delete cascade,
  player_id text not null check (player_id in ('adi', 'ren')),
  ts_ms integer not null,
  item_id text not null,
  lap integer not null
);

create index if not exists race_item_events_race_id_idx on race_item_events (race_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: same convention as schema.sql -- public read, writes
-- only via the service role key on the server (the telemetry API route).
alter table live_telemetry_events enable row level security;
alter table race_position_samples enable row level security;
alter table race_item_events enable row level security;

create policy "public read live_telemetry_events" on live_telemetry_events for select using (true);
create policy "public read race_position_samples" on race_position_samples for select using (true);
create policy "public read race_item_events" on race_item_events for select using (true);

-- ---------------------------------------------------------------------------
-- Verify: every new seasons/races column shows up exactly once, all
-- nullable, and all three new tables exist with RLS enabled.
select table_name, column_name, is_nullable, data_type
from information_schema.columns
where (table_name = 'seasons' and column_name in (
         'mode', 'display_config', 'adi_telemetry_slot', 'ren_telemetry_slot',
         'adi_character', 'adi_kart', 'adi_transmission',
         'ren_character', 'ren_kart', 'ren_transmission'
       ))
   or (table_name = 'races' and column_name in (
         'adi_lap1_time_ms', 'adi_lap2_time_ms', 'adi_lap3_time_ms', 'adi_final_time_ms',
         'ren_lap1_time_ms', 'ren_lap2_time_ms', 'ren_lap3_time_ms', 'ren_final_time_ms'
       ))
order by table_name, column_name;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
where c.relname in ('live_telemetry_events', 'race_position_samples', 'race_item_events');
-- ============================================================================
-- Immersive War Mode: speed telemetry (speed trap + speed-vs-time graph).
--
-- Adds the two flat top-speed columns on `races` (same convention as the
-- lap-time columns above) plus one new PERMANENT per-race table,
-- `race_speed_samples` -- the full speed-over-time timeline a finalized
-- Immersive race carries forever, written once at finalize time from the
-- `speed-update` telemetry events, same pattern as `race_position_samples`.
-- No ephemeral table of its own: `speed-update` events ride in
-- `live_telemetry_events` (already generic on `event_type`) while a race
-- is in progress.
--
-- Stores the RAW PlayerSub10.vehicleSpeed reading, not km/h or any other
-- real-world unit -- see the module doc in lib/telemetry/events.ts for why
-- (no conversion factor has been confirmed to the precision this project
-- wants; see the roadmap doc's "Investigated, not implemented" section).
--
-- Safe to run multiple times -- every statement is idempotent.
-- ============================================================================

alter table races
  add column if not exists adi_top_speed double precision,
  add column if not exists ren_top_speed double precision;

create table if not exists race_speed_samples (
  race_id uuid not null references races (id) on delete cascade,
  player_id text not null check (player_id in ('adi', 'ren')),
  ts_ms integer not null,
  speed double precision not null
);

create index if not exists race_speed_samples_race_id_idx on race_speed_samples (race_id, ts_ms);

-- Row Level Security: same convention as the rest of this file -- public
-- read, writes only via the service role key on the server.
alter table race_speed_samples enable row level security;

create policy "public read race_speed_samples" on race_speed_samples for select using (true);

-- ---------------------------------------------------------------------------
-- Verify: the new races columns exist, race_speed_samples exists with RLS
-- enabled, and the policy is in place.
select table_name, column_name, is_nullable, data_type
from information_schema.columns
where table_name = 'races' and column_name in ('adi_top_speed', 'ren_top_speed')
order by column_name;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
where c.relname = 'race_speed_samples';
