import type { Circuit, ItemId, PlayerId, RacePowerup, RawRace, RawSeason } from "@/lib/types";
import { ITEMS } from "@/lib/data/items";

/**
 * Battle Mode's silly-stats page — blue shells taken and power-ups
 * received. Deliberately separate from `buildStatsModel()`: this data only
 * exists for races recorded through Battle Mode (the blue-shell columns on
 * `races` and every `race_powerups` row are null/absent for solo-mode and
 * imported races), so it can't assume every race has it the way the core
 * pipeline assumes complete position data.
 *
 * Broken down the same three ways the points-stats pages are (by player
 * overall, by track/circuit, by season) — `aggregate()` computes the same
 * shape of totals for any subset of races, so the by-player numbers, each
 * by-track row, and each by-season row are all just that one function
 * called on a different slice of the data, rather than three separate
 * calculations that could drift out of sync with each other.
 */

export interface ItemTotal {
  itemId: ItemId;
  count: number;
}

export interface AggregateTomfoolery {
  /** Races in this slice that actually carry battle-mode data (blue-shell columns set) — the denominator for rates below. */
  battleRacesRecorded: number;
  totalBlueShells: Record<PlayerId, number>;
  /** Blue shells taken per battle race played, one decimal place. Null if no battle races in this slice. */
  blueShellsPerRace: Record<PlayerId, number | null>;
  /** Every item this player logged at least once in this slice, most-received first. */
  powerupTotals: Record<PlayerId, ItemTotal[]>;
  /** The single item each player received most in this slice, or null with no power-up data. */
  favoriteItem: Record<PlayerId, ItemTotal | null>;
  totalPowerupsLogged: Record<PlayerId, number>;
}

export interface CircuitTomfoolery extends AggregateTomfoolery {
  circuit: Circuit;
}

export interface SeasonTomfoolery extends AggregateTomfoolery {
  seasonId: string;
  seasonNumber: number;
}

export interface TomfooleryStats extends AggregateTomfoolery {
  /** Circuits actually played in Battle Mode, mayhem-heaviest (blue shells + power-ups) first. */
  byTrack: CircuitTomfoolery[];
  /** Seasons that carry any battle-mode data, most recent first. */
  bySeason: SeasonTomfoolery[];
}

const EMPTY_ITEM_COUNTS = (): Record<ItemId, number> =>
  Object.fromEntries(ITEMS.map((i) => [i.id, 0])) as Record<ItemId, number>;

/** Core aggregation, reused for the overall totals and for every by-track/by-season row — `races` and `racePowerups` should already be scoped to whatever slice is being summarized. */
function aggregate(races: RawRace[], racePowerups: RacePowerup[]): AggregateTomfoolery {
  const battleRaces = races.filter((r) => r.adiBlueShellCount != null || r.renBlueShellCount != null);

  const totalBlueShells: Record<PlayerId, number> = {
    adi: battleRaces.reduce((sum, r) => sum + (r.adiBlueShellCount ?? 0), 0),
    ren: battleRaces.reduce((sum, r) => sum + (r.renBlueShellCount ?? 0), 0),
  };

  const blueShellsPerRace: Record<PlayerId, number | null> = {
    adi: battleRaces.length > 0 ? Math.round((totalBlueShells.adi / battleRaces.length) * 10) / 10 : null,
    ren: battleRaces.length > 0 ? Math.round((totalBlueShells.ren / battleRaces.length) * 10) / 10 : null,
  };

  const rawCounts: Record<PlayerId, Record<ItemId, number>> = { adi: EMPTY_ITEM_COUNTS(), ren: EMPTY_ITEM_COUNTS() };
  for (const p of racePowerups) {
    // Tomfoolery Tales is Adi/Ren only — a guest driver's power-ups (when
    // this races' season had one) are aggregated separately, in
    // lib/stats/guest.ts, and shown on the dedicated Guest Stats page.
    if (p.playerId !== "adi" && p.playerId !== "ren") continue;
    rawCounts[p.playerId][p.itemId] += p.count;
  }

  const powerupTotals: Record<PlayerId, ItemTotal[]> = {
    adi: toSortedTotals(rawCounts.adi),
    ren: toSortedTotals(rawCounts.ren),
  };

  const favoriteItem: Record<PlayerId, ItemTotal | null> = {
    adi: powerupTotals.adi[0] ?? null,
    ren: powerupTotals.ren[0] ?? null,
  };

  const totalPowerupsLogged: Record<PlayerId, number> = {
    adi: powerupTotals.adi.reduce((sum, t) => sum + t.count, 0),
    ren: powerupTotals.ren.reduce((sum, t) => sum + t.count, 0),
  };

  return {
    battleRacesRecorded: battleRaces.length,
    totalBlueShells,
    blueShellsPerRace,
    powerupTotals,
    favoriteItem,
    totalPowerupsLogged,
  };
}

export function buildTomfooleryStats(
  races: RawRace[],
  racePowerups: RacePowerup[],
  circuits: Circuit[],
  seasons: RawSeason[]
): TomfooleryStats {
  const overall = aggregate(races, racePowerups);

  const powerupsByRaceId = new Map<string, RacePowerup[]>();
  for (const p of racePowerups) {
    const list = powerupsByRaceId.get(p.raceId) ?? [];
    list.push(p);
    powerupsByRaceId.set(p.raceId, list);
  }
  const powerupsFor = (subset: RawRace[]) => subset.flatMap((r) => powerupsByRaceId.get(r.id) ?? []);

  const racesByCircuitId = new Map<string, RawRace[]>();
  for (const r of races) {
    const list = racesByCircuitId.get(r.circuitId) ?? [];
    list.push(r);
    racesByCircuitId.set(r.circuitId, list);
  }
  const circuitsById = new Map(circuits.map((c) => [c.id, c]));

  const byTrack: CircuitTomfoolery[] = [];
  for (const [circuitId, circuitRaces] of racesByCircuitId) {
    const circuit = circuitsById.get(circuitId);
    if (!circuit) continue;
    const agg = aggregate(circuitRaces, powerupsFor(circuitRaces));
    if (agg.battleRacesRecorded === 0) continue; // circuit was only ever raced in solo mode
    byTrack.push({ circuit, ...agg });
  }
  byTrack.sort((a, b) => {
    const mayhemA = a.totalBlueShells.adi + a.totalBlueShells.ren + a.totalPowerupsLogged.adi + a.totalPowerupsLogged.ren;
    const mayhemB = b.totalBlueShells.adi + b.totalBlueShells.ren + b.totalPowerupsLogged.adi + b.totalPowerupsLogged.ren;
    return mayhemB - mayhemA;
  });

  const racesBySeasonId = new Map<string, RawRace[]>();
  for (const r of races) {
    const list = racesBySeasonId.get(r.seasonId) ?? [];
    list.push(r);
    racesBySeasonId.set(r.seasonId, list);
  }
  const seasonsById = new Map(seasons.map((s) => [s.id, s]));

  const bySeason: SeasonTomfoolery[] = [];
  for (const [seasonId, seasonRaces] of racesBySeasonId) {
    const season = seasonsById.get(seasonId);
    if (!season) continue;
    const agg = aggregate(seasonRaces, powerupsFor(seasonRaces));
    if (agg.battleRacesRecorded === 0) continue; // season predates Battle Mode / was solo-only
    bySeason.push({ seasonId, seasonNumber: season.seasonNumber, ...agg });
  }
  bySeason.sort((a, b) => b.seasonNumber - a.seasonNumber);

  return { ...overall, byTrack, bySeason };
}

function toSortedTotals(counts: Record<ItemId, number>): ItemTotal[] {
  return ITEMS.map((i) => ({ itemId: i.id, count: counts[i.id] }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
}
