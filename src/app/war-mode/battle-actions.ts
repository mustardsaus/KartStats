"use server";

import { getStore } from "@/lib/db";
import { normalizeBattleCode } from "@/lib/data/battle-code";
import { isValidFinishingPosition } from "@/lib/stats/points";
import type { DriverId, ItemId, PlayerId } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { completeSeasonIfFull, computeAndCompleteSeason } from "./actions";

/** "Engage in battle?" — starts a new battle-mode season with a fresh code, or returns the one already in progress. driverCount 3 adds the guest ("Prawns") seat; defaults to the ordinary 2-driver battle. */
export async function engageBattleAction(driverCount: 2 | 3 = 2) {
  const store = getStore();
  const seasons = await store.getSeasons();
  const active = seasons.find((s) => !s.isComplete);
  if (active) return { season: active };
  const season = await store.startBattleSeason(driverCount === 3);
  revalidatePath("/war-mode");
  return { season };
}

/** A device joining with a name + code. Auto-claims admin on whichever named PLAYER's join lands first — the guest seat ("Prawns") never becomes admin, since track-picking stays an Adi/Ren responsibility. */
export async function joinBattleAction(rawCode: string, playerId: DriverId) {
  const code = normalizeBattleCode(rawCode);
  if (!code) return { error: "Enter the battle code." };

  const store = getStore();
  const season = await store.getSeasonByBattleCode(code);
  if (!season) return { error: "No battle found for that code — check it and try again." };
  if (season.isComplete) return { error: "That battle has already finished." };
  if (playerId === "guest" && !season.guestEnabled) {
    return { error: "This battle doesn't have a third guest driver." };
  }

  const joined = await store.joinBattleSeason(season.id, playerId);
  const withAdmin = playerId === "guest" ? joined : await store.claimAdmin(season.id, playerId);
  revalidatePath("/war-mode");
  return { season: { ...joined, adminPlayerId: withAdmin.adminPlayerId } };
}

/** Explicit admin hand-off — e.g. the original admin's phone died mid-season. */
export async function claimAdminAction(seasonId: string, playerId: PlayerId) {
  const store = getStore();
  const season = await store.claimAdmin(seasonId, playerId);
  revalidatePath("/war-mode");
  return { season };
}

/** The escape hatch for a battle engaged by mistake — only works before any races are recorded. */
export async function abandonBattleAction(seasonId: string) {
  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length > 0) {
    return { error: "This battle already has races recorded — it can't be abandoned." };
  }
  await store.deleteEmptySeason(seasonId);
  revalidatePath("/war-mode");
  return { abandoned: true };
}

/**
 * Admin-only escape hatch for ending a battle that's already underway —
 * "started by accident, or we're just stopping here." Marks the season
 * complete right now using whatever races have actually been recorded
 * (via the same real winner-computation logic every other completion
 * path uses — computeAndCompleteSeason, src/app/war-mode/actions.ts),
 * rather than discarding them. A season with zero races should go
 * through abandonBattleAction instead (deletes it outright, no
 * "0-0 tie" season left behind) — this rejects that case so the two
 * don't overlap.
 */
export async function endBattleEarlyAction(seasonId: string) {
  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length === 0) {
    return { error: "No races recorded yet — use \"Cancel battle\" instead to discard it entirely." };
  }
  await computeAndCompleteSeason(seasonId);
  revalidatePath("/war-mode");
  return { ended: true };
}

/**
 * The admin picking a track for the next round. Guarded against starting a
 * 33rd round: a stale admin device that hasn't yet refreshed after the
 * season's 32nd race finalized could otherwise tap "pick track" and create
 * a round the season has no room for (the "Race 33 of 32" bug) — this
 * check happens server-side, atomically ahead of the actual insert, so it
 * can't be raced the way a client-side-only check could.
 */
export async function pickTrackAction(seasonId: string, circuitId: string) {
  const store = getStore();
  const races = (await store.getRacesBySeasonId()).get(seasonId) ?? [];
  if (races.length >= RACES_PER_SEASON) {
    return { error: "This season's already got all 32 races — start a new one to keep playing." };
  }
  const round = await store.startRound(seasonId, circuitId);
  revalidatePath("/war-mode");
  return { round };
}

/**
 * Either device recording any driver's position. Automatically finalizes
 * the round once everyone required (Adi, Ren, and Prawns when guestEnabled)
 * is in. Rejects a position that would collide with another driver's
 * already-recorded position THIS round — two drivers can't both finish
 * P1 — since an unnoticed collision is exactly what breaks this circuit's
 * win-probability math downstream (see lib/stats/circuit.ts): it makes
 * neither driver count as "ahead" for that race, so the two probabilities
 * stop summing to 100%.
 */
export async function recordPositionAction(seasonId: string, roundId: string, playerId: DriverId, position: number) {
  if (!isValidFinishingPosition(position)) {
    return { error: "Finishing position must be between 1 and 12." };
  }
  const store = getStore();

  const before = await store.getActiveRound(seasonId);
  if (before && before.id === roundId) {
    const allDrivers: { id: DriverId; position: number | null }[] = [
      { id: "adi", position: before.adiPosition },
      { id: "ren", position: before.renPosition },
      { id: "guest", position: before.guestEnabled ? before.guestPosition : null },
    ];
    const others = allDrivers.filter((d) => d.id !== playerId);
    const clash = others.find((d) => d.position === position);
    if (clash) {
      const clashName = clash.id === "guest" ? "Prawns" : clash.id === "adi" ? "Adi" : "Ren";
      return { error: `${clashName} already finished P${position} this race — positions can't repeat.` };
    }
  }

  const round = await store.recordRoundPosition(roundId, playerId, position);

  const stillWaiting =
    round.adiPosition === null || round.renPosition === null || (round.guestEnabled && round.guestPosition === null);
  if (stillWaiting) {
    revalidatePath("/war-mode");
    return { round, finalized: false };
  }

  const claimed = await store.claimFinalizeRound(roundId);
  if (!claimed) {
    // Either already finalized by a concurrent request, or not actually
    // ready — either way, nothing more for this caller to do.
    revalidatePath("/war-mode");
    return { round, finalized: false };
  }

  try {
    const race = await store.addRace(seasonId, {
      circuitId: claimed.circuitId,
      adiFinishingPosition: claimed.adiPosition!,
      renFinishingPosition: claimed.renPosition!,
      guestFinishingPosition: claimed.guestEnabled ? claimed.guestPosition : undefined,
    });
    await store.setRaceBlueShellCounts(
      race.id,
      claimed.adiBlueShellCount,
      claimed.renBlueShellCount,
      claimed.guestEnabled ? claimed.guestBlueShellCount : undefined
    );
    await store.copyRoundPowerupsToRace(roundId, race.id);
    await store.completeFinalizeRound(roundId, race.id);
    const completed = await completeSeasonIfFull(seasonId);
    revalidatePath("/war-mode");
    revalidatePath("/");
    revalidatePath("/season-rewind");
    return { round: claimed, finalized: true, race, completed };
  } catch (e) {
    await store.unclaimFinalizeRound(roundId);
    throw e;
  }
}

export async function incrementBlueShellAction(roundId: string, playerId: DriverId) {
  const store = getStore();
  const round = await store.incrementBlueShellCount(roundId, playerId);
  revalidatePath("/war-mode");
  return { round };
}

export async function decrementBlueShellAction(roundId: string, playerId: DriverId) {
  const store = getStore();
  const round = await store.decrementBlueShellCount(roundId, playerId);
  revalidatePath("/war-mode");
  return { round };
}

export async function setPowerupCountAction(roundId: string, playerId: DriverId, itemId: ItemId, count: number) {
  const store = getStore();
  await store.setRoundPowerupCount(roundId, playerId, itemId, Math.max(0, Math.floor(count)));
  const powerups = await store.getRoundPowerups(roundId);
  revalidatePath("/war-mode");
  return { powerups };
}

/**
 * Refetch of the parts of battle state that actually change during a
 * season — called on mount and on every Realtime signal, so this runs on
 * every single blue-shell tap too. Deliberately does NOT refetch circuits
 * or the points mapping: those are static for the life of a season, the
 * caller already has them from its initial page load as props, and
 * re-fetching both on every tap was pure wasted round-trip latency — a
 * real, felt contributor to Battle Mode feeling slow during live play.
 * Also doesn't fetch round power-ups — nothing in the UI logs or
 * displays them live anymore (see Cockpit.tsx).
 */
export async function getBattleStateAction(seasonId: string) {
  const store = getStore();
  const [seasons, racesBySeasonId, activeRound] = await Promise.all([
    store.getSeasons(),
    store.getRacesBySeasonId(),
    store.getActiveRound(seasonId),
  ]);
  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const races = racesBySeasonId.get(seasonId) ?? [];
  return { season, races, activeRound };
}
