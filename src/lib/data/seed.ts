import type { RawRace, RawSeason } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { CIRCUITS } from "./circuits";

/** Deterministic PRNG (mulberry32) so demo data is stable across builds/renders. */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A finishing-position pair for two racers that is never a tie for 1st. */
function randomPositionPair(rng: () => number, adiSkew: number): [number, number] {
  // adiSkew in [0,1]: higher means Adi tends to finish better this "era" of the rivalry.
  const positions = Array.from({ length: 12 }, (_, i) => i + 1);
  const adiRoll = rng();
  const adiIndex = Math.floor((1 - Math.pow(adiRoll, adiSkew > 0.5 ? 0.6 : 1.6)) * positions.length);
  const adiPos = positions[Math.min(Math.max(adiIndex, 0), 11)];
  let renPos = positions[Math.floor(rng() * positions.length)];
  while (renPos === adiPos) {
    renPos = positions[Math.floor(rng() * positions.length)];
  }
  return [adiPos, renPos];
}

interface SeedResult {
  seasons: RawSeason[];
  racesBySeasonId: Map<string, RawRace[]>;
}

/**
 * Generates realistic-looking demo history: 5 completed seasons across the
 * full 32-circuit rotation, with shifting momentum per season so the
 * dashboard, trendline, and rivalry stats have something interesting to
 * show before real Excel data is imported.
 */
export function generateSeedData(seasonCount = 5): SeedResult {
  const rng = mulberry32(20260101);
  const seasons: RawSeason[] = [];
  const racesBySeasonId = new Map<string, RawRace[]>();

  const baseDate = new Date("2024-03-01T00:00:00.000Z");

  for (let s = 1; s <= seasonCount; s++) {
    const seasonId = `season-${s}`;
    const adiSkew = 0.3 + ((s * 37) % 100) / 140; // varies per season, deterministic
    const races: RawRace[] = [];

    const startDate = new Date(baseDate);
    startDate.setUTCMonth(baseDate.getUTCMonth() + (s - 1) * 3);
    const completionDate = new Date(startDate);
    completionDate.setUTCDate(completionDate.getUTCDate() + 21);

    for (let r = 0; r < RACES_PER_SEASON; r++) {
      const circuit = CIRCUITS[r % CIRCUITS.length];
      const [adiPos, renPos] = randomPositionPair(rng, adiSkew);
      races.push({
        id: `${seasonId}-race-${r + 1}`,
        seasonId,
        raceNumber: r + 1,
        circuitId: circuit.id,
        adiFinishingPosition: adiPos,
        renFinishingPosition: renPos,
        createdAt: startDate.toISOString(),
      });
    }

    racesBySeasonId.set(seasonId, races);
    seasons.push({
      id: seasonId,
      seasonNumber: s,
      startDate: startDate.toISOString(),
      completionDate: completionDate.toISOString(),
      isComplete: true,
      winnerId: null, // resolved by the stats layer, not stored as authored truth
      adiFinalPoints: null,
      renFinalPoints: null,
      createdAt: startDate.toISOString(),
    });
  }

  return { seasons, racesBySeasonId };
}
