/**
 * The wire format for the Dolphin -> KartStats live telemetry bridge (War
 * Mode's Immersive mode). The Python tracker (tools/position-read/scripts
 * -- already built and locked down, not touched by this file) POSTs
 * batches of these to /api/telemetry/events as it detects race events.
 *
 * `slot` is the RAW tracked player slot (1 or 2) as the Dolphin side sees
 * it -- NOT yet resolved to "adi"/"ren". That resolution happens at
 * ingestion (resolveSlotToPlayer below), using the season's
 * adiTelemetrySlot/renTelemetrySlot (set once during Player Assignment --
 * see ImmersiveSetupWizard). StoredTelemetryEvent is the same shape with
 * `slot` replaced by the resolved `playerId` -- what actually gets
 * persisted, so nothing downstream of ingestion ever has to re-resolve it.
 *
 * `lap: 0` can appear in position-update/lap-complete events (a split
 * that happens before the first real checkpoint crossing) -- these are
 * dropped via dropLapZeroEvents at the API route, before anything reaches
 * the database. Never trust a sender-side filter alone for this: the
 * Dolphin tracker's own project history has had off-by-one lap/race-number
 * bugs, so this project's convention is to enforce it at the one real
 * ingestion choke point instead.
 */

import type { ItemId, PlayerId, RawSeason } from "@/lib/types";

export type TelemetrySlot = 1 | 2;

interface TelemetryEventBase {
  seasonId: string;
  raceNumber: number; // 1-indexed within the season, matches RawRace.raceNumber sequencing
  tsMs: number; // elapsed ms since this race started, as the Dolphin side measures it
}

export type TelemetryEvent =
  | (TelemetryEventBase & { type: "circuit-detected"; circuitId: string })
  | (TelemetryEventBase & { type: "loadout-detected"; slot: TelemetrySlot; characterId: string; kartId: string })
  | (TelemetryEventBase & { type: "position-update"; slot: TelemetrySlot; position: number; lap: number })
  | (TelemetryEventBase & { type: "lap-complete"; slot: TelemetrySlot; lap: number; lapTimeMs: number })
  | (TelemetryEventBase & { type: "item-received"; slot: TelemetrySlot; itemId: ItemId; lap: number })
  | (TelemetryEventBase & { type: "race-finished"; slot: TelemetrySlot; finalPosition: number; finalTimeMs: number | null }); // null = never crossed the line (race ended for everyone first), e.g. last place

export interface TelemetryEventBatch {
  events: TelemetryEvent[];
}

export type StoredTelemetryEvent =
  | (TelemetryEventBase & { type: "circuit-detected"; circuitId: string })
  | (TelemetryEventBase & { type: "loadout-detected"; playerId: PlayerId; characterId: string; kartId: string })
  | (TelemetryEventBase & { type: "position-update"; playerId: PlayerId; position: number; lap: number })
  | (TelemetryEventBase & { type: "lap-complete"; playerId: PlayerId; lap: number; lapTimeMs: number })
  | (TelemetryEventBase & { type: "item-received"; playerId: PlayerId; itemId: ItemId; lap: number })
  | (TelemetryEventBase & { type: "race-finished"; playerId: PlayerId; finalPosition: number; finalTimeMs: number | null }); // null = never crossed the line (race ended for everyone first), e.g. last place

/** Drops any lap-0 split -- see module doc above. The single choke point for this rule. */
export function dropLapZeroEvents(events: TelemetryEvent[]): TelemetryEvent[] {
  return events.filter((e) => !("lap" in e) || e.lap !== 0);
}

/**
 * Resolves a raw tracked slot to the real player it belongs to, using the
 * season's slot assignment from Player Assignment. Null if the season
 * isn't Immersive, the assignment wasn't set, or the slot doesn't match
 * either assignment -- callers should drop the event rather than guess
 * (see resolveEvents below).
 */
export function resolveSlotToPlayer(season: RawSeason, slot: TelemetrySlot): PlayerId | null {
  if (season.adiTelemetrySlot === slot) return "adi";
  if (season.renTelemetrySlot === slot) return "ren";
  return null;
}

/**
 * Converts a batch of wire-format events into stored (slot-resolved)
 * events, dropping any event whose slot doesn't resolve to a player for
 * this season. Does NOT drop lap-0 events -- call dropLapZeroEvents first,
 * same as the route handler does, so the two concerns stay separately
 * testable.
 */
export function resolveEvents(season: RawSeason, events: TelemetryEvent[]): StoredTelemetryEvent[] {
  const resolved: StoredTelemetryEvent[] = [];
  for (const e of events) {
    if (e.type === "circuit-detected") {
      resolved.push(e);
      continue;
    }
    const playerId = resolveSlotToPlayer(season, e.slot);
    if (!playerId) continue; // unassigned/unknown slot -- drop rather than guess
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it from `rest`
    const { slot: _slot, ...rest } = e;
    resolved.push({ ...rest, playerId } as StoredTelemetryEvent);
  }
  return resolved;
}
