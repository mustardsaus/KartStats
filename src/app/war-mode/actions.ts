"use server";

import { getStore } from "@/lib/db";
import { buildStatsModel, determineSeasonWinner, buildRaceStats, calculateSeasonTotals } from "@/lib/stats";
import { isValidFinishingPosition } from "@/lib/stats/points";
import { RACES_PER_SEASON, type RaceInput } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function startSeasonAction() {
  const store = getStore();
  const seasons = await store.getSeasons();
  const active = seasons.find((s) => !s.isComplete);
  if (active) return { season: active };
  const season = await store.startSeason();
  revalidatePath("/war-mode");
  return { season };
}

/**
 * If a season has hit its 32nd race, marks it complete with the computed
 * winner/final points cached on the row. Shared by the solo addRaceAction
 * below and Battle Mode's round-finalize sequence
 * (src/app/war-mode/battle-actions.ts) so both paths use the exact same
 * winner-computation logic rather than duplicating it. Returns whether
 * the season was completed by this call.
 */
export async function completeSeasonIfFull(seasonId: string): Promise<boolean> {
  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length < RACES_PER_SEASON) return false;

  const circuits = await store.getCircuits();
  const pointsMapping = await store.getPointsMapping();
  const circuitsById = new Map(circuits.map((c) => [c.id, c]));
  const raceStats = buildRaceStats(races, circuitsById, pointsMapping);
  const { adiTotal, renTotal } = calculateSeasonTotals(raceStats);
  const winner = determineSeasonWinner(adiTotal, renTotal);
  await store.completeSeason(seasonId, { winnerId: winner, adiFinalPoints: adiTotal, renFinalPoints: renTotal });
  return true;
}

export async function addRaceAction(seasonId: string, input: RaceInput) {
  if (!isValidFinishingPosition(input.adiFinishingPosition)) {
    return { error: "Adi's finishing position must be between 1 and 12." };
  }
  if (!isValidFinishingPosition(input.renFinishingPosition)) {
    return { error: "Ren's finishing position must be between 1 and 12." };
  }
  if (input.adiFinishingPosition === input.renFinishingPosition) {
    // Two drivers can't both finish the same race in the same position —
    // besides being impossible, an unnoticed duplicate like this is what
    // breaks the circuit win-probability math (lib/stats/circuit.ts),
    // since neither driver then counts as "ahead" for that race.
    return { error: "Adi and Ren can't both finish in the same position — check the results and try again." };
  }
  if (!input.circuitId) {
    return { error: "Pick a circuit before submitting." };
  }

  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length >= RACES_PER_SEASON) {
    return { error: "This season's already got all 32 races — start a new one to keep playing." };
  }
  const race = await store.addRace(seasonId, input);
  const completed = await completeSeasonIfFull(seasonId);

  revalidatePath("/war-mode");
  revalidatePath("/");
  revalidatePath("/season-rewind");
  return { race, completed };
}

/**
 * Lets a solo-mode season started by mistake (wrong button, testing,
 * whatever) be cleared from inside the app instead of needing a manual
 * SQL delete — mirrors Battle Mode's abandonBattleAction. Only allowed
 * with zero races recorded, so there's never a chance of silently
 * discarding real results.
 */
export async function abandonSeasonAction(seasonId: string) {
  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length > 0) {
    return { error: "This season already has races recorded — it can't be abandoned." };
  }
  await store.deleteEmptySeason(seasonId);
  revalidatePath("/war-mode");
  return { abandoned: true };
}

export async function loadWarModeData() {
  const store = getStore();
  const [seasons, racesBySeasonId, circuits, pointsMapping] = await Promise.all([
    store.getSeasons(),
    store.getRacesBySeasonId(),
    store.getCircuits(),
    store.getPointsMapping(),
  ]);
  const model = buildStatsModel(seasons, racesBySeasonId, circuits, pointsMapping);
  const activeSeason = seasons.find((s) => !s.isComplete) ?? null;
  return {
    activeSeasonId: activeSeason?.id ?? null,
    circuits,
    pointsMapping,
    model,
  };
}
