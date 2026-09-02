import type { Circuit, PlayerId, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { calculatePointsFromPosition } from "./points";
import type { RaceStat, SeasonStat } from "./types";

/**
 * Enriches a season's raw races with derived points and running cumulative
 * totals. This is the single place cumulative-points math happens — every
 * chart, table, and War Mode leaderboard consumes this output rather than
 * re-deriving it.
 */
export function buildRaceStats(
  races: RawRace[],
  circuitsById: Map<string, Circuit>,
  pointsMapping: PointsMapping
): RaceStat[] {
  const sorted = [...races].sort((a, b) => a.raceNumber - b.raceNumber);
  let adiCumulative = 0;
  let renCumulative = 0;

  return sorted.map((race) => {
    const adiPoints = calculatePointsFromPosition(race.adiFinishingPosition, pointsMapping);
    const renPoints = calculatePointsFromPosition(race.renFinishingPosition, pointsMapping);
    adiCumulative += adiPoints;
    renCumulative += renPoints;

    const circuit = circuitsById.get(race.circuitId) ?? {
      id: race.circuitId,
      name: "Unknown Circuit",
      imageUrl: "/circuits/placeholder.svg",
    };

    let leader: PlayerId | "tie" = "tie";
    if (adiCumulative > renCumulative) leader = "adi";
    else if (renCumulative > adiCumulative) leader = "ren";

    return {
      ...race,
      circuit,
      adiPoints,
      renPoints,
      adiCumulativePoints: adiCumulative,
      renCumulativePoints: renCumulative,
      leader,
    };
  });
}

/** Sum of points for a set of already-derived race stats. */
export function calculateSeasonTotals(raceStats: RaceStat[]): {
  adiTotal: number;
  renTotal: number;
} {
  return raceStats.reduce(
    (acc, r) => ({
      adiTotal: acc.adiTotal + r.adiPoints,
      renTotal: acc.renTotal + r.renPoints,
    }),
    { adiTotal: 0, renTotal: 0 }
  );
}

/**
 * Determines the winner of a season from its totals. Never invents a
 * winner on a tie unless a tie-break rule is explicitly supplied — by
 * default, equal totals resolve to "tie".
 */
export function determineSeasonWinner(
  adiTotal: number,
  renTotal: number,
  tieBreak?: (adiTotal: number, renTotal: number) => PlayerId | "tie"
): PlayerId | "tie" {
  if (adiTotal === renTotal) {
    return tieBreak ? tieBreak(adiTotal, renTotal) : "tie";
  }
  return adiTotal > renTotal ? "adi" : "ren";
}

export function buildSeasonStat(
  season: RawSeason,
  races: RawRace[],
  circuitsById: Map<string, Circuit>,
  pointsMapping: PointsMapping
): SeasonStat {
  const raceStats = buildRaceStats(races, circuitsById, pointsMapping);
  const { adiTotal, renTotal } = calculateSeasonTotals(raceStats);
  const isComplete = raceStats.length >= RACES_PER_SEASON;
  const winner = isComplete ? determineSeasonWinner(adiTotal, renTotal) : null;
  const winningMargin = Math.abs(adiTotal - renTotal);

  return {
    season,
    races: raceStats,
    adiFinalPoints: adiTotal,
    renFinalPoints: renTotal,
    winner,
    winningMargin,
    isComplete,
    racesPlayed: raceStats.length,
  };
}
