/**
 * The finalize step of the Dolphin telemetry bridge: turns everything
 * accumulated in the ephemeral live_telemetry_events holding area for one
 * race into a permanent RawRace + its permanent position/item/powerup
 * rows, once both players have a race-finished event. Called after every
 * ingest (see the route handler) -- a no-op (finalized: false) until the
 * second player's race-finished event lands.
 *
 * Deliberately reuses the EXISTING store.addRace -- the same core Manual
 * and Battle Mode already call -- rather than a parallel write path, per
 * the integration spec's constraint to extend, not duplicate, the
 * existing data model.
 */

import { getStore } from "@/lib/db";
import type { ItemId, PlayerId, RaceInput, RaceItemEvent, RacePositionSample, RacePowerup } from "@/lib/types";
import type { StoredTelemetryEvent } from "./events";

export interface FinalizeResult {
  finalized: boolean;
  raceId?: string;
}

const PLAYER_IDS: PlayerId[] = ["adi", "ren"];

type FinishedEvent = Extract<StoredTelemetryEvent, { type: "race-finished" }>;
type LapCompleteEvent = Extract<StoredTelemetryEvent, { type: "lap-complete" }>;
type CircuitDetectedEvent = Extract<StoredTelemetryEvent, { type: "circuit-detected" }>;
type PositionUpdateEvent = Extract<StoredTelemetryEvent, { type: "position-update" }>;
type LoadoutDetectedEvent = Extract<StoredTelemetryEvent, { type: "loadout-detected" }>;
type ItemReceivedEvent = Extract<StoredTelemetryEvent, { type: "item-received" }>;

function lapTimeMs(events: StoredTelemetryEvent[], playerId: PlayerId, lap: 1 | 2 | 3): number | null {
  const match = events.find(
    (e): e is LapCompleteEvent => e.type === "lap-complete" && e.playerId === playerId && e.lap === lap
  );
  return match?.lapTimeMs ?? null;
}

export async function maybeFinalizeImmersiveRace(
  seasonId: string,
  raceNumber: number,
  events: StoredTelemetryEvent[]
): Promise<FinalizeResult> {
  const finishes = new Map<PlayerId, FinishedEvent>();
  for (const e of events) {
    if (e.type === "race-finished") finishes.set(e.playerId, e);
  }
  if (!PLAYER_IDS.every((p) => finishes.has(p))) {
    return { finalized: false }; // still waiting on at least one player
  }

  // Latest wins: the tracker re-reads the course at GO and re-sends it if the early read differed.
  const circuitEvent = [...events].reverse().find((e): e is CircuitDetectedEvent => e.type === "circuit-detected");
  if (!circuitEvent) {
    // Shouldn't be reachable -- the tracker always emits circuit-detected
    // before any position data -- but a race can't finalize with no
    // track, same guard recordPositionAction has for a circuit-less round.
    throw new Error(`Immersive race ${seasonId}/${raceNumber} has no circuit-detected event — can't finalize.`);
  }

  const adiFinish = finishes.get("adi")!;
  const renFinish = finishes.get("ren")!;

  const store = getStore();

  // Loadout: detected once, from whichever race finalizes first, and
  // never touched again -- same "fixed for the whole season" rule the
  // Player Assignment wizard step used to apply manually (see
  // ImmersiveSetupWizard). If the season already has one locked in, reuse
  // it as-is and ignore any freshly-detected values this race; only a
  // season with nothing set yet gets one written here.
  const seasons = await store.getSeasons();
  const season = seasons.find((s) => s.id === seasonId);
  let adiCharacter = season?.adiCharacter ?? null;
  let adiKart = season?.adiKart ?? null;
  let renCharacter = season?.renCharacter ?? null;
  let renKart = season?.renKart ?? null;

  if (season && !adiCharacter && !renCharacter) {
    const loadoutEvents = events.filter((e): e is LoadoutDetectedEvent => e.type === "loadout-detected");
    const adiLoadout = loadoutEvents.find((e) => e.playerId === "adi");
    const renLoadout = loadoutEvents.find((e) => e.playerId === "ren");
    if (adiLoadout && renLoadout) {
      adiCharacter = adiLoadout.characterId;
      adiKart = adiLoadout.kartId;
      renCharacter = renLoadout.characterId;
      renKart = renLoadout.kartId;
      await store.setSeasonImmersiveLoadout(seasonId, {
        adiCharacter,
        adiKart,
        adiTransmission: null,
        renCharacter,
        renKart,
        renTransmission: null,
      });
    }
    // If either player's loadout-detected event is missing (e.g. the
    // tracker lost one player's struct before reading it), this race
    // simply finalizes with no loadout -- never fabricated, same as
    // every other "absent" convention on RawRace -- and the season tries
    // again from the next race's events.
  }

  const input: RaceInput = {
    circuitId: circuitEvent.circuitId,
    adiFinishingPosition: adiFinish.finalPosition,
    renFinishingPosition: renFinish.finalPosition,
    adiLap1TimeMs: lapTimeMs(events, "adi", 1),
    adiLap2TimeMs: lapTimeMs(events, "adi", 2),
    adiLap3TimeMs: lapTimeMs(events, "adi", 3),
    adiFinalTimeMs: adiFinish.finalTimeMs ?? null,
    renLap1TimeMs: lapTimeMs(events, "ren", 1),
    renLap2TimeMs: lapTimeMs(events, "ren", 2),
    renLap3TimeMs: lapTimeMs(events, "ren", 3),
    renFinalTimeMs: renFinish.finalTimeMs ?? null,
    adiCharacter,
    adiKart,
    renCharacter,
    renKart,
  };

  const race = await store.addRace(seasonId, input);

  const positionSamples: RacePositionSample[] = events
    .filter((e): e is PositionUpdateEvent => e.type === "position-update")
    .map((e) => ({ raceId: race.id, playerId: e.playerId, tsMs: e.tsMs, position: e.position, lap: e.lap }));
  if (positionSamples.length > 0) await store.addRacePositionSamples(race.id, positionSamples);

  const itemEventRows: RaceItemEvent[] = events
    .filter((e): e is ItemReceivedEvent => e.type === "item-received")
    .map((e) => ({ raceId: race.id, playerId: e.playerId, tsMs: e.tsMs, itemId: e.itemId, lap: e.lap }));
  if (itemEventRows.length > 0) await store.addRaceItemEvents(race.id, itemEventRows);

  // Aggregate counts straight onto the race -- Tomfoolery Tales' data
  // source, landing in the SAME race_powerups table Battle Mode writes
  // via copyRoundPowerupsToRace, built here directly from the
  // item-received timeline since there's no BattleRound-style ephemeral
  // tally to copy from in Immersive mode.
  const counts = new Map<string, number>(); // `${playerId}:${itemId}` -> count
  for (const e of itemEventRows) {
    const key = `${e.playerId}:${e.itemId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const powerups: RacePowerup[] = [...counts.entries()].map(([key, count]) => {
    const [playerId, itemId] = key.split(":") as [PlayerId, ItemId];
    return { raceId: race.id, playerId, itemId, count };
  });
  if (powerups.length > 0) await store.addRacePowerups(race.id, powerups);

  await store.clearLiveTelemetryEvents(seasonId, raceNumber);

  return { finalized: true, raceId: race.id };
}
