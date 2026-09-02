import type { RacePowerup, RawRace, RawSeason, PointsMapping } from "@/lib/types";
import { calculatePointsFromPosition } from "./points";
import { ITEMS, type Item } from "@/lib/data/items";

/**
 * Prawns' (the third guest driver's) real, computed stats — built entirely
 * from `calculatePointsFromPosition`, the SAME position -> points lookup
 * `buildStatsModel` uses for Adi/Ren, so a guest race is scored by
 * identical rules. Deliberately kept out of `lib/stats/index.ts`: nothing
 * here ever touches career totals, the trendline, "current champion", or
 * any season's winnerId — those stay a strict Adi-vs-Ren determination
 * everywhere else in the app, exactly as before this feature existed.
 * This is purely an additive read of the same underlying races.
 */

export interface GuestSeasonStat {
  seasonId: string;
  seasonNumber: number;
  isComplete: boolean;
  racesPlayed: number;
  totalPoints: number;
  totalBlueShells: number;
  totalPowerupsLogged: number;
}

export interface GuestItemTotal {
  item: Item;
  count: number;
}

export interface GuestStats {
  seasonsPlayed: number;
  careerRacesPlayed: number;
  careerPoints: number;
  careerBlueShells: number;
  favoriteItem: GuestItemTotal | null;
  itemTotals: GuestItemTotal[];
  /** Most recent season first, matching Season Rewind's ordering. */
  bySeason: GuestSeasonStat[];
}

function guestRacePoints(race: RawRace, pointsMapping: PointsMapping): number {
  if (race.guestFinishingPosition == null) return 0;
  return calculatePointsFromPosition(race.guestFinishingPosition, pointsMapping);
}

/** Live-leaderboard helper: Prawns' running total for one in-progress (or any) season's races. */
export function calculateGuestSeasonPoints(races: RawRace[], pointsMapping: PointsMapping): number {
  return races.reduce((sum, r) => sum + guestRacePoints(r, pointsMapping), 0);
}

export function buildGuestStats(
  seasons: RawSeason[],
  racesBySeasonId: Map<string, RawRace[]>,
  racePowerups: RacePowerup[],
  pointsMapping: PointsMapping
): GuestStats {
  const guestSeasons = seasons.filter((s) => s.guestEnabled);

  const guestPowerupsByRaceId = new Map<string, number>();
  for (const p of racePowerups) {
    if (p.playerId !== "guest") continue;
    guestPowerupsByRaceId.set(p.raceId, (guestPowerupsByRaceId.get(p.raceId) ?? 0) + p.count);
  }

  const itemCounts = new Map<string, number>();
  for (const p of racePowerups) {
    if (p.playerId !== "guest") continue;
    itemCounts.set(p.itemId, (itemCounts.get(p.itemId) ?? 0) + p.count);
  }
  const itemTotals: GuestItemTotal[] = ITEMS.map((item) => ({ item, count: itemCounts.get(item.id) ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const bySeason: GuestSeasonStat[] = guestSeasons
    .map((season) => {
      const races = (racesBySeasonId.get(season.id) ?? []).filter((r) => r.guestFinishingPosition != null);
      return {
        seasonId: season.id,
        seasonNumber: season.seasonNumber,
        isComplete: season.isComplete,
        racesPlayed: races.length,
        totalPoints: calculateGuestSeasonPoints(races, pointsMapping),
        totalBlueShells: races.reduce((sum, r) => sum + (r.guestBlueShellCount ?? 0), 0),
        totalPowerupsLogged: races.reduce((sum, r) => sum + (guestPowerupsByRaceId.get(r.id) ?? 0), 0),
      };
    })
    .filter((s) => s.racesPlayed > 0)
    .sort((a, b) => b.seasonNumber - a.seasonNumber);

  const careerRacesPlayed = bySeason.reduce((sum, s) => sum + s.racesPlayed, 0);
  const careerPoints = bySeason.reduce((sum, s) => sum + s.totalPoints, 0);
  const careerBlueShells = bySeason.reduce((sum, s) => sum + s.totalBlueShells, 0);

  return {
    seasonsPlayed: bySeason.length,
    careerRacesPlayed,
    careerPoints,
    careerBlueShells,
    favoriteItem: itemTotals[0] ?? null,
    itemTotals,
    bySeason,
  };
}
