-- ============================================================================
-- Kart Kontrol (Season 15+): character / kart / transmission tracking.
--
-- Adds six nullable columns to both `races` (the permanent, finalized
-- result) and `battle_rounds` (the ephemeral in-progress round) — one set
-- per player, Adi and Ren only. Nullable everywhere on purpose: Seasons
-- 1-14 have no loadout data and must stay NULL forever, never backfilled
-- or guessed. `character`/`kart` are stored as free-text roster ids (see
-- src/lib/data/characters.ts / karts.ts) rather than foreign keys, since
-- the roster itself lives in application code, not the database.
--
-- Safe to run multiple times — every statement is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- races: the permanent, finalized result for a race.
alter table races
  add column if not exists adi_character text,
  add column if not exists adi_kart text,
  add column if not exists adi_transmission text check (adi_transmission in ('automatic', 'manual')),
  add column if not exists ren_character text,
  add column if not exists ren_kart text,
  add column if not exists ren_transmission text check (ren_transmission in ('automatic', 'manual'));

-- ---------------------------------------------------------------------------
-- battle_rounds: the in-progress round each player sets their own loadout
-- on, before it gets copied onto `races` at finalize time. This table was
-- added by an earlier Battle Mode migration that never made it into
-- supabase/schema.sql (see the note at the top of that file) — this ALTER
-- assumes it already exists, which it does in the live database.
alter table battle_rounds
  add column if not exists adi_character text,
  add column if not exists adi_kart text,
  add column if not exists adi_transmission text check (adi_transmission in ('automatic', 'manual')),
  add column if not exists ren_character text,
  add column if not exists ren_kart text,
  add column if not exists ren_transmission text check (ren_transmission in ('automatic', 'manual'));

-- ---------------------------------------------------------------------------
-- Part 2: battle_rounds.circuit_id becomes nullable.
--
-- Loadout now gets collected BEFORE the track is picked, matching the real
-- game's character-then-course order — so a round can briefly exist with
-- no circuit yet. races.circuit_id stays NOT NULL (a race is never
-- finalized without a track). Safe to run even if you already ran Part 1
-- above — every statement here is idempotent too.
alter table battle_rounds alter column circuit_id drop not null;

-- ---------------------------------------------------------------------------
-- Verify: every loadout column shows up exactly once per table, all
-- nullable, and battle_rounds.circuit_id is nullable too.
select table_name, column_name, is_nullable, data_type
from information_schema.columns
where table_name in ('races', 'battle_rounds')
  and column_name in (
    'adi_character', 'adi_kart', 'adi_transmission',
    'ren_character', 'ren_kart', 'ren_transmission',
    'circuit_id'
  )
order by table_name, column_name;
