import type { SeasonStat } from "./types";

export interface TrendlinePoint {
  globalRaceIndex: number; // continuous index across the whole historical dataset (x-axis)
  seasonNumber: number;
  raceNumber: number; // 1..32 within the season
  circuitName: string;
  adiCumulativePoints: number;
  renCumulativePoints: number;
  adiFinishingPosition: number;
  renFinishingPosition: number;
}

export interface SeasonBoundary {
  seasonNumber: number;
  startIndex: number; // globalRaceIndex of that season's first race
  endIndex: number; // globalRaceIndex of that season's last race
  winner: "adi" | "ren" | "tie" | null;
}

/**
 * Builds the full-career trendline series: cumulative points RESET at the
 * start of each season (so momentum/comebacks/season winners stay legible)
 * but plotted on one continuous x-axis across the whole historical
 * dataset, with season boundaries called out separately for markers.
 * Powers the Trendline view and the Season Detail view (which just slices
 * one season's worth of points back out).
 */
export function calculateTrendlineSeries(seasons: SeasonStat[]): {
  points: TrendlinePoint[];
  boundaries: SeasonBoundary[];
} {
  const points: TrendlinePoint[] = [];
  const boundaries: SeasonBoundary[] = [];
  let globalIndex = 0;

  for (const season of seasons) {
    const startIndex = globalIndex + 1;
    for (const race of season.races) {
      globalIndex += 1;
      points.push({
        globalRaceIndex: globalIndex,
        seasonNumber: season.season.seasonNumber,
        raceNumber: race.raceNumber,
        circuitName: race.circuit.name,
        adiCumulativePoints: race.adiCumulativePoints,
        renCumulativePoints: race.renCumulativePoints,
        adiFinishingPosition: race.adiFinishingPosition,
        renFinishingPosition: race.renFinishingPosition,
      });
    }
    if (season.races.length > 0) {
      boundaries.push({
        seasonNumber: season.season.seasonNumber,
        startIndex,
        endIndex: globalIndex,
        winner: season.winner,
      });
    }
  }

  return { points, boundaries };
}

/**
 * Builds the career trendline series: cumulative points that NEVER reset —
 * one continuous running total from race 1 of Season 1 through the most
 * recent race played, across every season. This is the "big picture" view;
 * the season-by-season reset view (calculateTrendlineSeries) already lives
 * on the Season Rewind detail page, so this is intentionally the only
 * derivation the main Trendline page uses.
 */
export function calculateCareerTrendlineSeries(seasons: SeasonStat[]): {
  points: TrendlinePoint[];
  boundaries: SeasonBoundary[];
} {
  const points: TrendlinePoint[] = [];
  const boundaries: SeasonBoundary[] = [];
  let globalIndex = 0;
  let adiCareerTotal = 0;
  let renCareerTotal = 0;

  for (const season of seasons) {
    const startIndex = globalIndex + 1;
    for (const race of season.races) {
      globalIndex += 1;
      adiCareerTotal += race.adiPoints;
      renCareerTotal += race.renPoints;
      points.push({
        globalRaceIndex: globalIndex,
        seasonNumber: season.season.seasonNumber,
        raceNumber: race.raceNumber,
        circuitName: race.circuit.name,
        adiCumulativePoints: adiCareerTotal,
        renCumulativePoints: renCareerTotal,
        adiFinishingPosition: race.adiFinishingPosition,
        renFinishingPosition: race.renFinishingPosition,
      });
    }
    if (season.races.length > 0) {
      boundaries.push({
        seasonNumber: season.season.seasonNumber,
        startIndex,
        endIndex: globalIndex,
        winner: season.winner,
      });
    }
  }

  return { points, boundaries };
}
