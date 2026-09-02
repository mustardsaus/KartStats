import type { Circuit, PlayerId, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { buildSeasonStat } from "./season";
import type { PlayerCareerStat, SeasonStat } from "./types";
import {
  calculateAverageFinishingPosition,
  calculateAveragePointsPerRace,
  calculateBestSeason,
  calculateCareerPoints,
  calculateChampionships,
  calculateHeadToHeadWinPercentage,
  calculateMedianFinishingPosition,
  calculateMedianSeasonPoints,
  calculatePodiums,
  calculateRaceWins,
} from "./career";
import { calculateStrongestTracks, calculateWeakestTracks, calculateAllCircuitStats } from "./circuit";

export * from "./types";
export * from "./points";
export * from "./season";
export * from "./career";
export * from "./circuit";
export * from "./trendline";
export { median, average, safeDivide, round } from "./math";

/**
 * The single entry point that turns raw imported/entered data into the
 * full derived statistics model consumed by every view in the app.
 * Nothing downstream should recompute season totals, points, or medians
 * from scratch — they all start from here.
 */
export function buildStatsModel(
  seasons: RawSeason[],
  racesBySeasonId: Map<string, RawRace[]>,
  circuits: Circuit[],
  pointsMapping: PointsMapping
) {
  const circuitsById = new Map(circuits.map((c) => [c.id, c]));

  const seasonStats: SeasonStat[] = [...seasons]
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .map((season) =>
      buildSeasonStat(season, racesBySeasonId.get(season.id) ?? [], circuitsById, pointsMapping)
    );

  const circuitStats = calculateAllCircuitStats(seasonStats, circuits);

  const playerCareer = (playerId: PlayerId): PlayerCareerStat => {
    const strongest = calculateStrongestTracks(seasonStats, circuits, playerId, 1)[0];
    const weakest = calculateWeakestTracks(seasonStats, circuits, playerId, 1)[0];
    const strongestCircuitStat = strongest
      ? circuitStats.find((c) => c.circuit.id === strongest.circuit.id) ?? null
      : null;
    const weakestCircuitStat = weakest
      ? circuitStats.find((c) => c.circuit.id === weakest.circuit.id) ?? null
      : null;
    const bestSeason = calculateBestSeason(seasonStats, playerId);

    return {
      playerId,
      careerPoints: calculateCareerPoints(seasonStats, playerId),
      championships: calculateChampionships(seasonStats, playerId),
      ties: seasonStats.filter((s) => s.isComplete && s.winner === "tie").length,
      raceWins: calculateRaceWins(seasonStats, playerId),
      podiums: calculatePodiums(seasonStats, playerId),
      medianFinishingPosition: calculateMedianFinishingPosition(seasonStats, playerId),
      medianSeasonPoints: calculateMedianSeasonPoints(seasonStats, playerId),
      averageFinishingPosition: calculateAverageFinishingPosition(seasonStats, playerId),
      averagePointsPerRace: calculateAveragePointsPerRace(seasonStats, playerId),
      bestSeason,
      highestSeasonPoints: bestSeason
        ? playerId === "adi"
          ? bestSeason.adiFinalPoints
          : bestSeason.renFinalPoints
        : null,
      strongestCircuit: strongestCircuitStat,
      weakestCircuit: weakestCircuitStat,
      headToHeadWinPercentage: calculateHeadToHeadWinPercentage(seasonStats, playerId),
      racesPlayed: seasonStats.reduce((sum, s) => sum + s.racesPlayed, 0),
    };
  };

  return {
    seasons: seasonStats,
    circuits: circuitStats,
    circuitsById,
    players: {
      adi: playerCareer("adi"),
      ren: playerCareer("ren"),
    } satisfies Record<PlayerId, PlayerCareerStat>,
  };
}

export type StatsModel = ReturnType<typeof buildStatsModel>;
