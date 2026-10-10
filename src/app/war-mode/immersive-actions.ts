"use server";

import { getStore } from "@/lib/db";
import { getCharacterWeightClass } from "@/lib/data/characters";
import { isVehicleAvailableToWeightClass } from "@/lib/data/karts";
import type { DisplayConfig, TransmissionMode } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { computeAndCompleteSeason } from "./actions";

/**
 * Immersive War Mode's server-side orchestration — mirrors the shape of
 * actions.ts (solo) and battle-actions.ts (Battle Mode) exactly: the
 * client components below only ever call these, never touch the
 * DataStore directly. Nothing about the Manual flow (either file above)
 * is changed by anything here.
 */

/** "Go Immersive" — starts a new Immersive season, or returns the one already in progress (same guard as engageBattleAction/startSeasonAction). */
export async function startImmersiveSeasonAction(displayConfig: DisplayConfig) {
  const store = getStore();
  const seasons = await store.getSeasons();
  const active = seasons.find((s) => !s.isComplete);
  if (active) return { season: active };
  const season = await store.startImmersiveSeason(displayConfig);
  revalidatePath("/war-mode");
  return { season };
}

/** Player Assignment: which raw Dolphin slot (1 or 2) is adi vs ren — the "swap players" escape hatch the setup wizard offers. */
export async function setImmersiveSlotsAction(seasonId: string, adiSlot: 1 | 2, renSlot: 1 | 2) {
  if (adiSlot === renSlot) {
    return { error: "Adi and Ren can't both be the same tracked player slot." };
  }
  const store = getStore();
  const season = await store.setSeasonTelemetrySlots(seasonId, adiSlot, renSlot);
  revalidatePath("/war-mode");
  return { season };
}

/**
 * Player Assignment's loadout step: each player's character/kart/
 * transmission for the WHOLE season, set once here rather than re-picked
 * per round like Battle Mode's Kart Kontrol. Validated server-side for
 * both players at once, the same way setLoadoutAction validates one.
 */
export async function setImmersiveLoadoutAction(
  seasonId: string,
  loadout: {
    adiCharacter: string;
    adiKart: string;
    adiTransmission: TransmissionMode;
    renCharacter: string;
    renKart: string;
    renTransmission: TransmissionMode;
  }
) {
  const perPlayer: Array<{ label: string; character: string; kart: string; transmission: TransmissionMode }> = [
    { label: "Adi", character: loadout.adiCharacter, kart: loadout.adiKart, transmission: loadout.adiTransmission },
    { label: "Ren", character: loadout.renCharacter, kart: loadout.renKart, transmission: loadout.renTransmission },
  ];
  for (const p of perPlayer) {
    const weightClass = getCharacterWeightClass(p.character);
    if (!weightClass) return { error: `Unrecognized character for ${p.label} — pick one from the roster.` };
    if (!isVehicleAvailableToWeightClass(p.kart, weightClass)) {
      return { error: `That kart isn't available to ${p.label}'s character's weight class.` };
    }
    if (p.transmission !== "automatic" && p.transmission !== "manual") {
      return { error: `Pick Automatic or Manual for ${p.label}.` };
    }
  }

  const store = getStore();
  const season = await store.setSeasonImmersiveLoadout(seasonId, loadout);
  revalidatePath("/war-mode");
  return { season };
}

/**
 * Full-refetch snapshot for the live dashboard — same "any realtime
 * change just triggers one full refetch" convention as
 * getBattleStateAction. `liveEvents` is this season's CURRENT in-progress
 * race only (races.length + 1) — once that race finalizes, its events
 * move into the permanent races/race_position_samples/race_item_events
 * rows and this holding area is empty again for the next one.
 */
export async function getImmersiveStateAction(seasonId: string) {
  const store = getStore();
  const [seasons, racesBySeasonId] = await Promise.all([store.getSeasons(), store.getRacesBySeasonId()]);
  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const races = racesBySeasonId.get(seasonId) ?? [];
  const currentRaceNumber = races.length + 1;
  const liveEvents = season ? await store.getLiveTelemetryEvents(seasonId, currentRaceNumber) : [];
  return { season, races, liveEvents };
}

/** The permanent position/item/speed timeline for one already-finalized race — powers the "race just finished" results panel and Season Rewind's telemetry modal. */
export async function getRaceTelemetryDetailAction(raceId: string) {
  const store = getStore();
  const [positionSamples, itemEvents, speedSamples] = await Promise.all([
    store.getRacePositionSamples(raceId),
    store.getRaceItemEvents(raceId),
    store.getRaceSpeedSamples(raceId),
  ]);
  return { positionSamples, itemEvents, speedSamples };
}

/** The escape hatch for an Immersive season engaged by mistake — same guard as abandonBattleAction/abandonSeasonAction: only before any race is recorded. */
export async function abandonImmersiveSeasonAction(seasonId: string) {
  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length > 0) {
    return { error: 'This season already has races recorded — use "End season" instead to close it out.' };
  }
  await store.deleteEmptySeason(seasonId);
  revalidatePath("/war-mode");
  return { abandoned: true };
}

/**
 * Ends an Immersive season before it reaches 32 races -- the Immersive
 * equivalent of endBattleEarlyAction (battle-actions.ts): computes the
 * real winner/points from whatever races actually got recorded (same
 * computeAndCompleteSeason every "a season is now done" path uses) rather
 * than discarding anything. abandonImmersiveSeasonAction above stays the
 * "cancel a mistake, nothing worth keeping" path for a season with zero
 * races; this is for a season already underway that needs to stop.
 */
export async function endImmersiveSeasonEarlyAction(seasonId: string) {
  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length === 0) {
    return { error: 'No races recorded yet — use "Cancel season" instead to discard it entirely.' };
  }
  await computeAndCompleteSeason(seasonId);
  revalidatePath("/war-mode");
  return { ended: true };
}
