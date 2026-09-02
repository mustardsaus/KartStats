import type { PlayerId } from "@/lib/types";
import type { ChampionInfo, AllTimeRecordInfo, SeasonStat } from "./types";
import { median, average, safeDivide, round } from "./math";

/** Total points scored by `playerId` across every race in every given season (complete or not). */
export function calculateCareerPoints(seasons: SeasonStat[], playerId: PlayerId): number {
  return seasons.reduce((sum, s) => {
    const total = playerId === "adi" ? s.adiFinalPoints : s.renFinalPoints;
    return sum + total;
  }, 0);
}

/** Number of completed seasons won outright by `playerId` (ties never count for either side). */
export function calculateChampionships(seasons: SeasonStat[], playerId: PlayerId): number {
  return seasons.filter((s) => s.isComplete && s.winner === playerId).length;
}

export function calculateTies(seasons: SeasonStat[]): number {
  return seasons.filter((s) => s.isComplete && s.winner === "tie").length;
}

/** Races where `playerId` finished in 1st place, across all given seasons. */
export function calculateRaceWins(seasons: SeasonStat[], playerId: PlayerId): number {
  return seasons.reduce((count, s) => {
    return (
      count +
      s.races.filter((r) => {
        const pos = playerId === "adi" ? r.adiFinishingPosition : r.renFinishingPosition;
        return pos === 1;
      }).length
    );
  }, 0);
}

/** Races where `playerId` finished 1st, 2nd, or 3rd — configurable via `podiumThreshold`. */
export function calculatePodiums(
  seasons: SeasonStat[],
  playerId: PlayerId,
  podiumThreshold = 3
): number {
  return seasons.reduce((count, s) => {
    return (
      count +
      s.races.filter((r) => {
        const pos = playerId === "adi" ? r.adiFinishingPosition : r.renFinishingPosition;
        return pos >= 1 && pos <= podiumThreshold;
      }).length
    );
  }, 0);
}

export function calculateMedianFinishingPosition(
  seasons: SeasonStat[],
  playerId: PlayerId
): number | null {
  const positions = seasons.flatMap((s) =>
    s.races.map((r) => (playerId === "adi" ? r.adiFinishingPosition : r.renFinishingPosition))
  );
  return median(positions);
}

export function calculateAverageFinishingPosition(
  seasons: SeasonStat[],
  playerId: PlayerId
): number | null {
  const positions = seasons.flatMap((s) =>
    s.races.map((r) => (playerId === "adi" ? r.adiFinishingPosition : r.renFinishingPosition))
  );
  const avg = average(positions);
  return avg === null ? null : round(avg, 2);
}

export function calculateAveragePointsPerRace(
  seasons: SeasonStat[],
  playerId: PlayerId
): number | null {
  const points = seasons.flatMap((s) =>
    s.races.map((r) => (playerId === "adi" ? r.adiPoints : r.renPoints))
  );
  const avg = average(points);
  return avg === null ? null : round(avg, 2);
}

/** Median of a player's FINAL points across completed seasons only. */
export function calculateMedianSeasonPoints(
  seasons: SeasonStat[],
  playerId: PlayerId
): number | null {
  const totals = seasons
    .filter((s) => s.isComplete)
    .map((s) => (playerId === "adi" ? s.adiFinalPoints : s.renFinalPoints));
  return median(totals);
}

export function calculateBestSeason(seasons: SeasonStat[], playerId: PlayerId): SeasonStat | null {
  const completed = seasons.filter((s) => s.isComplete);
  if (completed.length === 0) return null;
  return completed.reduce((best, s) => {
    const points = playerId === "adi" ? s.adiFinalPoints : s.renFinalPoints;
    const bestPoints = playerId === "adi" ? best.adiFinalPoints : best.renFinalPoints;
    return points > bestPoints ? s : best;
  }, completed[0]);
}

/** The player with the higher career point total, across ALL historical seasons. */
export function calculateAllTimeChampion(seasons: SeasonStat[]): ChampionInfo | null {
  if (seasons.length === 0) return null;
  const adiPoints = calculateCareerPoints(seasons, "adi");
  const renPoints = calculateCareerPoints(seasons, "ren");
  if (adiPoints === renPoints) return null; // tied career totals — no false champion

  const winnerId: PlayerId = adiPoints > renPoints ? "adi" : "ren";
  const points = winnerId === "adi" ? adiPoints : renPoints;
  const lastSeason = [...seasons].sort((a, b) => b.season.seasonNumber - a.season.seasonNumber)[0];

  return {
    playerId: winnerId,
    points,
    seasonNumber: lastSeason.season.seasonNumber,
    completionDate: lastSeason.season.completionDate ?? lastSeason.season.startDate,
  };
}

/** Winner of the most recently COMPLETED season. */
export function calculateCurrentChampion(seasons: SeasonStat[]): ChampionInfo | null {
  const completed = seasons
    .filter((s) => s.isComplete && s.winner && s.winner !== "tie")
    .sort((a, b) => b.season.seasonNumber - a.season.seasonNumber);
  if (completed.length === 0) return null;
  const latest = completed[0];
  const winnerId = latest.winner as PlayerId;
  return {
    playerId: winnerId,
    points: winnerId === "adi" ? latest.adiFinalPoints : latest.renFinalPoints,
    seasonNumber: latest.season.seasonNumber,
    completionDate: latest.season.completionDate ?? latest.season.startDate,
  };
}

/** Highest single-season point total ever recorded, by either player. */
export function calculateAllTimeRecord(seasons: SeasonStat[]): AllTimeRecordInfo | null {
  const completed = seasons.filter((s) => s.isComplete);
  if (completed.length === 0) return null;

  let best: AllTimeRecordInfo | null = null;
  for (const s of completed) {
    const candidates: AllTimeRecordInfo[] = [
      {
        playerId: "adi",
        points: s.adiFinalPoints,
        seasonNumber: s.season.seasonNumber,
        completionDate: s.season.completionDate ?? s.season.startDate,
      },
      {
        playerId: "ren",
        points: s.renFinalPoints,
        seasonNumber: s.season.seasonNumber,
        completionDate: s.season.completionDate ?? s.season.startDate,
      },
    ];
    for (const c of candidates) {
      if (!best || c.points > best.points) best = c;
    }
  }
  return best;
}

/** Head-to-head win percentage: championships / completed seasons. */
export function calculateHeadToHeadWinPercentage(
  seasons: SeasonStat[],
  playerId: PlayerId
): number | null {
  const completed = seasons.filter((s) => s.isComplete);
  const wins = calculateChampionships(seasons, playerId);
  const pct = safeDivide(wins, completed.length);
  return pct === null ? null : round(pct * 100, 1);
}
