import type { ItemId, PlayerId, RacePowerup, RawRace } from "@/lib/types";
import { ITEMS } from "@/lib/data/items";

/**
 * Battle Mode's silly-stats page — blue shells taken and power-ups
 * received. Deliberately separate from `buildStatsModel()`: this data only
 * exists for races recorded through Battle Mode or Immersive War Mode (the
 * blue-shell columns on `races` and every `race_powerups` row are
 * null/absent for solo-mode and imported races), so it can't assume every
 * race has it the way the core pipeline assumes complete position data.
 *
 * Tomfoolery Tales (Season 20+) is a single flat cumulative table —
 * item rows × Adi/Ren columns, summed across every race ever recorded,
 * no more per-track/per-season breakdowns. `buildCumulativeTomfoolery`
 * reuses the exact same `race_powerups` rows Battle Mode has always
 * written (and Immersive's finalize step now also writes, via the same
 * aggregate-counts copy `copyRoundPowerupsToRace` already established) —
 * no new table, no new item vocabulary to reconcile, since both paths
 * already write `ItemId` values straight from this same roster.
 */

export interface CumulativeItemTotal {
  itemId: ItemId;
  adiCount: number;
  renCount: number;
}

export interface TomfooleryStats {
  /** Races in this dataset that actually carry battle-mode/Immersive blue-shell data — the denominator for rates below. */
  battleRacesRecorded: number;
  totalBlueShells: Record<PlayerId, number>;
  /** Blue shells taken per battle race played, one decimal place. Null if no such races recorded. */
  blueShellsPerRace: Record<PlayerId, number | null>;
  totalPowerupsLogged: Record<PlayerId, number>;
  /** Every item either player has logged at least once, most-received (combined) first. The one flat table this page renders. */
  items: CumulativeItemTotal[];
}

/** Cumulative item totals across every race's `race_powerups` rows — the core of the flat Tomfoolery table. Adi/Ren only; a guest driver's items are aggregated separately in lib/stats/guest.ts. */
export function buildCumulativeTomfoolery(racePowerups: RacePowerup[]): CumulativeItemTotal[] {
  const counts: Record<ItemId, { adi: number; ren: number }> = Object.fromEntries(
    ITEMS.map((i) => [i.id, { adi: 0, ren: 0 }])
  ) as Record<ItemId, { adi: number; ren: number }>;

  for (const p of racePowerups) {
    if (p.playerId !== "adi" && p.playerId !== "ren") continue;
    counts[p.itemId][p.playerId] += p.count;
  }

  return ITEMS.map((i) => ({ itemId: i.id, adiCount: counts[i.id].adi, renCount: counts[i.id].ren }))
    .filter((row) => row.adiCount > 0 || row.renCount > 0)
    .sort((a, b) => b.adiCount + b.renCount - (a.adiCount + a.renCount));
}

export function buildTomfooleryStats(races: RawRace[], racePowerups: RacePowerup[]): TomfooleryStats {
  const battleRaces = races.filter((r) => r.adiBlueShellCount != null || r.renBlueShellCount != null);

  const totalBlueShells: Record<PlayerId, number> = {
    adi: battleRaces.reduce((sum, r) => sum + (r.adiBlueShellCount ?? 0), 0),
    ren: battleRaces.reduce((sum, r) => sum + (r.renBlueShellCount ?? 0), 0),
  };

  const blueShellsPerRace: Record<PlayerId, number | null> = {
    adi: battleRaces.length > 0 ? Math.round((totalBlueShells.adi / battleRaces.length) * 10) / 10 : null,
    ren: battleRaces.length > 0 ? Math.round((totalBlueShells.ren / battleRaces.length) * 10) / 10 : null,
  };

  const items = buildCumulativeTomfoolery(racePowerups);
  const totalPowerupsLogged: Record<PlayerId, number> = {
    adi: items.reduce((sum, t) => sum + t.adiCount, 0),
    ren: items.reduce((sum, t) => sum + t.renCount, 0),
  };

  return {
    battleRacesRecorded: battleRaces.length,
    totalBlueShells,
    blueShellsPerRace,
    totalPowerupsLogged,
    items,
  };
}
