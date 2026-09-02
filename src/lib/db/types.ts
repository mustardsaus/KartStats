import type { BattleRound, Circuit, DriverId, ItemId, PlayerId, PointsMapping, RaceInput, RacePowerup, RawRace, RawSeason, RoundPowerup } from "@/lib/types";

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

  /** The season's current in-progress round (finalizedAt IS NULL), or null if the admin hasn't picked a track yet / the last round already finalized. */
  getActiveRound(seasonId: string): Promise<BattleRound | null>;

  /** Starts a new round (admin picks a track). Throws if a round is already open for this season. Snapshots the season's guestEnabled onto the round (see BattleRound.guestEnabled). */
  startRound(seasonId: string, circuitId: string): Promise<BattleRound>;

  /** Atomically sets one driver's position on the round. Silently no-ops (returns the round unchanged) if the round is already finalized. */
  recordRoundPosition(roundId: string, playerId: DriverId, position: number): Promise<BattleRound>;

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
}
