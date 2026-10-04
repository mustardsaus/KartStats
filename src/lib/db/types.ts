import type { BattleRound, Circuit, DisplayConfig, DriverId, ItemId, PlayerId, PointsMapping, RaceInput, RaceItemEvent, RacePositionSample, RacePowerup, RawRace, RawSeason, RoundPowerup, TransmissionMode } from "@/lib/types";
import type { StoredTelemetryEvent } from "@/lib/telemetry/events";

export interface ImportBatchResult {
  imported: boolean;
  reason?: string; // set when imported === false (e.g. duplicate content hash)
  seasonNumbers: number[];
  raceCount: number;
}

/**
 * The single data-access contract every page/route goes through. There
 * are two implementations: `local-store` (in-memory, seeded from the
 * imported historical dataset — used until Supabase credentials are
 * configured) and `supabase-store` (real Postgres persistence). Nothing
 * outside src/lib/db should care which one is active; lib/db/index.ts
 * picks based on environment variables.
 */
export interface DataStore {
  getPlayers(): Promise<{ adi: { id: "adi"; name: string; characterName: string; profileImageUrl: string }; ren: { id: "ren"; name: string; characterName: string; profileImageUrl: string } }>;
  getCircuits(): Promise<Circuit[]>;
  addCircuits(circuits: Circuit[]): Promise<void>;
  getPointsMapping(): Promise<PointsMapping>;
  setPointsMapping(mapping: PointsMapping): Promise<void>;

  getSeasons(): Promise<RawSeason[]>;
  getRacesBySeasonId(): Promise<Map<string, RawRace[]>>;

  /** Starts a brand-new, empty season (used by War Mode). */
  startSeason(): Promise<RawSeason>;

  /** Appends one race to an in-progress season (race number auto-assigned). Points are NOT passed in — derived on read. */
  addRace(seasonId: string, input: RaceInput): Promise<RawRace>;

  /** Marks a season complete once all 32 races are in; caches final totals/winner for convenience. */
  completeSeason(
    seasonId: string,
    cached: { winnerId: "adi" | "ren" | "tie"; adiFinalPoints: number; renFinalPoints: number }
  ): Promise<RawSeason>;

  /** Bulk-imports full seasons from the Excel pipeline, guarded against duplicate imports. */
  importSeasons(
    seasons: RawSeason[],
    racesBySeasonId: Map<string, RawRace[]>,
    contentHash: string,
    sourceFileName: string
  ): Promise<ImportBatchResult>;

  // --------------------------------------------------------------------
  // Battle Mode — multi-device live play. Every mutating method here is
  // a single atomic conditional update (never read-then-write) so two
  // devices acting at once can't corrupt shared state; see the comments
  // on each implementation. Nothing here is read by lib/stats — a round
  // only becomes visible to the rest of the app once it's finalized into
  // a real RawRace via the existing addRace above.
  // --------------------------------------------------------------------

  /** Starts a brand-new battle-mode season with a fresh, unique battle code. `guestEnabled` is set once, from the "how many drivers?" prompt, and never changes after. Caller guards against a second active season, same as startSeason. */
  startBattleSeason(guestEnabled: boolean): Promise<RawSeason>;

  /** Looks up the active season for a battle code (normalized: trimmed + uppercased by the caller). Null if no season has that code. */
  getSeasonByBattleCode(code: string): Promise<RawSeason | null>;

  /** Records that a driver's device has joined. Idempotent — only the FIRST join for a given driver sets that driver's joined timestamp; later joins as the same driver just return the current row. Caller guards that "guest" is only ever passed for a guestEnabled season. */
  joinBattleSeason(seasonId: string, playerId: DriverId): Promise<RawSeason>;

  /** Atomically claims admin for whichever player's device calls first; a later call from the other player is a no-op that returns the already-claimed row. */
  claimAdmin(seasonId: string, playerId: PlayerId): Promise<RawSeason>;

  /** The season's current in-progress round (finalizedAt IS NULL), or null if no round is open yet / the last round already finalized. */
  getActiveRound(seasonId: string): Promise<BattleRound | null>;

  /**
   * Opens the next round with no track chosen yet (circuitId null) — Kart
   * Kontrol (Season 15+) collects each player's own loadout before the
   * track gets picked, matching the real game's character-then-course
   * order. Throws if a round is already open for this season. Snapshots
   * the season's guestEnabled onto the round (see BattleRound.guestEnabled).
   */
  startRound(seasonId: string): Promise<BattleRound>;

  /**
   * The admin picking a track for an already-open round (see startRound
   * above) — sets circuitId on it. Silently no-ops (returns the round
   * unchanged) if the round is already finalized, matching
   * recordRoundPosition's idiom.
   */
  setRoundCircuit(roundId: string, circuitId: string): Promise<BattleRound>;

  /** Atomically sets one driver's position on the round. Silently no-ops (returns the round unchanged) if the round is already finalized. */
  recordRoundPosition(roundId: string, playerId: DriverId, position: number): Promise<BattleRound>;

  /**
   * Kart Kontrol (Season 15+): one player independently setting their own
   * character/kart/transmission for the round in progress — never the
   * guest seat. Silently no-ops (returns the round unchanged) if the round
   * is already finalized, matching recordRoundPosition's idiom.
   */
  setRoundLoadout(
    roundId: string,
    playerId: PlayerId,
    loadout: { character: string; kart: string; transmission: TransmissionMode }
  ): Promise<BattleRound>;

  /** Atomic +1 / -1 (never below 0) on one driver's blue-shell tally for the round. */
  incrementBlueShellCount(roundId: string, playerId: DriverId): Promise<BattleRound>;
  decrementBlueShellCount(roundId: string, playerId: DriverId): Promise<BattleRound>;

  /** Sets (not increments) one driver's tally for one item this round — the UI is "pick how many times", not a tap counter. */
  setRoundPowerupCount(roundId: string, playerId: DriverId, itemId: ItemId, count: number): Promise<void>;
  getRoundPowerups(roundId: string): Promise<RoundPowerup[]>;

  /**
   * The finalize hand-off, split into small atomic steps so the caller
   * (the recordPositionAction server action) can safely retry:
   *  1. claimFinalizeRound — atomically claims the round IF both positions
   *     (and the guest position too, when the round's guestEnabled) are
   *     set and it isn't already claimed; null if not ready / already
   *     claimed by a concurrent request.
   *  2. caller then calls the existing addRace(...) to write the real race,
   *  3. setRaceBlueShellCounts + copyRoundPowerupsToRace copy the round's
   *     tallies onto that new race,
   *  4. completeFinalizeRound marks the round done with the new race's id.
   * If anything after the claim throws, the caller calls
   * unclaimFinalizeRound so the round is retryable instead of stuck.
   */
  claimFinalizeRound(roundId: string): Promise<BattleRound | null>;
  unclaimFinalizeRound(roundId: string): Promise<void>;
  completeFinalizeRound(roundId: string, raceId: string): Promise<void>;
  setRaceBlueShellCounts(raceId: string, adiCount: number, renCount: number, guestCount?: number | null): Promise<void>;
  /** Copies the round's Kart Kontrol loadout (whatever is/isn't set) onto the newly-finalized race. */
  setRaceLoadout(
    raceId: string,
    loadout: {
      adiCharacter: string | null;
      adiKart: string | null;
      adiTransmission: TransmissionMode | null;
      renCharacter: string | null;
      renKart: string | null;
      renTransmission: TransmissionMode | null;
    }
  ): Promise<void>;
  copyRoundPowerupsToRace(roundId: string, raceId: string): Promise<void>;

  /** Every permanent per-race item tally recorded so far — for the Tomfoolery Tales aggregate. */
  getRacePowerups(): Promise<RacePowerup[]>;

  /**
   * Hard-deletes a season that has zero races recorded — the escape hatch
   * for a battle engaged by mistake (wrong device, typo'd into existence,
   * etc.). The caller (abandonBattleAction) is responsible for confirming
   * zero races first; this method trusts that check rather than
   * re-deriving it, since it's only ever invoked from that one guarded
   * action. Cascades to any open battle_rounds/battle_round_powerups.
   */
  deleteEmptySeason(seasonId: string): Promise<void>;

  // --------------------------------------------------------------------
  // Immersive War Mode — the Dolphin telemetry bridge. A race in
  // progress has no permanent RawRace row yet; live_telemetry_events is
  // the ephemeral holding area (mirrors the role BattleRound plays for
  // Battle Mode) until a race-finished event for both players lets the
  // caller (the API route's finalize step) turn it into a real race via
  // the EXISTING addRace above — never a parallel write path. Nothing
  // here is read by lib/stats directly; a race only becomes visible to
  // the rest of the app once addRace has written it.
  // --------------------------------------------------------------------

  /**
   * Starts a brand-new Immersive season. For "dual-device", also assigns
   * a fresh battle code so a second device can join as a spectator,
   * reusing the exact same battleCode/joinBattleSeason infrastructure
   * Battle Mode already has — never a second pairing mechanism. Caller
   * guards against a second active season, same as startSeason.
   */
  startImmersiveSeason(displayConfig: DisplayConfig): Promise<RawSeason>;

  /** Player Assignment: which raw Dolphin slot (1 or 2) is adi vs ren. Set once, before any race starts. */
  setSeasonTelemetrySlots(seasonId: string, adiSlot: 1 | 2, renSlot: 1 | 2): Promise<RawSeason>;

  /**
   * Player Assignment: each player's character/kart/transmission for the
   * WHOLE season (unlike Battle Mode's Kart Kontrol, which re-picks per
   * round) — reuses the same roster/columns, just fixed once up front.
   */
  setSeasonImmersiveLoadout(
    seasonId: string,
    loadout: {
      adiCharacter: string | null;
      adiKart: string | null;
      adiTransmission: TransmissionMode | null;
      renCharacter: string | null;
      renKart: string | null;
      renTransmission: TransmissionMode | null;
    }
  ): Promise<RawSeason>;

  /** Appends already slot-resolved events (see resolveEvents in lib/telemetry/events.ts) to the live holding area for one in-progress race. */
  ingestTelemetryEvents(seasonId: string, raceNumber: number, events: StoredTelemetryEvent[]): Promise<void>;

  /** Full snapshot of everything logged so far for one in-progress race — for a mid-race joiner (second device, or a refresh) before it subscribes to the live tail. */
  getLiveTelemetryEvents(seasonId: string, raceNumber: number): Promise<StoredTelemetryEvent[]>;

  /** Clears the holding area for one race once it has been finalized into a permanent RawRace + position/item rows below. */
  clearLiveTelemetryEvents(seasonId: string, raceNumber: number): Promise<void>;

  /**
   * Permanent per-race detail, written once at finalize time from the
   * same events that drove the live dashboard — never reconstructed
   * after the fact (spec section 8). Manual/Battle Mode races simply
   * have none; Season Rewind's graphs render only when rows exist.
   */
  addRacePositionSamples(raceId: string, samples: RacePositionSample[]): Promise<void>;
  getRacePositionSamples(raceId: string): Promise<RacePositionSample[]>;
  addRaceItemEvents(raceId: string, events: RaceItemEvent[]): Promise<void>;
  getRaceItemEvents(raceId: string): Promise<RaceItemEvent[]>;

  /**
   * Writes aggregate item counts straight onto the finalized race — the
   * Immersive equivalent of copyRoundPowerupsToRace above, but built
   * directly from the item-received timeline (there's no BattleRound-
   * style ephemeral tally to copy from). Lands in the SAME race_powerups
   * table Battle Mode uses, so Tomfoolery Tales gains rows without any
   * shape change.
   */
  addRacePowerups(raceId: string, powerups: RacePowerup[]): Promise<void>;
}
