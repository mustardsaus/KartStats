import { getStore } from "@/lib/db";
import { buildStatsModel, type StatsModel } from "@/lib/stats";

/**
 * Loads raw data from the active store and runs it through the stats
 * layer. This is the one function every Server Component / route handler
 * should call to get fully-derived statistics — never hand-roll totals
 * in a page.
 */
export async function loadStatsModel(): Promise<StatsModel> {
  const store = getStore();
  const [seasons, racesBySeasonId, circuits, pointsMapping] = await Promise.all([
    store.getSeasons(),
    store.getRacesBySeasonId(),
    store.getCircuits(),
    store.getPointsMapping(),
  ]);
  return buildStatsModel(seasons, racesBySeasonId, circuits, pointsMapping);
}
