// ============================================================================
// Core domain types — the raw, source-of-truth shape of the data.
// Nothing in this file is a derived/aggregate statistic. Aggregates live in
// lib/stats and are always computed FROM these shapes, never stored as truth.
// ============================================================================

export type PlayerId = "adi" | "ren";

/**
 * Battle Mode only: the two named players plus an optional third "guest"
 * seat ("Prawns") for a 3-driver battle. Deliberately kept separate from
 * `PlayerId` rather than widening it — the entire core stats engine
 * (buildStatsModel, career totals, trendline, circuits, "current champion")
 * assumes exactly two named competitors, and that assumption stays true
 * everywhere outside Battle Mode / guest-stats code. A guest's real points
 * are computed on demand from calculatePointsFromPosition, never folded
 * into adi/ren's totals or into who "wins" a season in the site's core
 * sense.
 */
export type DriverId = PlayerId | "guest";

export interface Player {
  id: PlayerId;
  name: string;
  characterName: string;
  profileImageUrl: string;
}

export interface Circuit {
  id: string;
  name: string;
  imageUrl: string;
  cup?: string;
  category?: "Nitro" | "Retro";
}

/** finishing position (1-12) -> points awarded. Configurable, imported. */
export interface PointsMappingEntry {
  finishingPosition: number;
  points: number;
}

export type PointsMapping = PointsMappingEntry[];

/**
 * A single raw race result. This is the ONLY source of truth for a race.
 * adiPoints/renPoints are intentionally absent here — they are derived,
 * never stored as authored input. (A convenience-cached variant with
 * points baked in — RaceRecord — is produced by the stats layer for
 * consumption by the UI; see lib/stats/types.ts)
 */
export interface RawRace {
  id: string;
  seasonId: string;
  raceNumber: number; // 1..32, position within the season
  circuitId: string;
  adiFinishingPosition: number;
  renFinishingPosition: number;
  createdAt: string;
  /**
   * Battle Mode only: how many times each player was hit by a blue shell
   * this race, logged live from their cockpit and copied over once the
   * race is finalized. Always null for solo-mode races and every race
   * recorded before Battle Mode existed — never required, never assumed
   * present by the stats layer.
   */
  adiBlueShellCount?: number | null;
  renBlueShellCount?: number | null;
  /**
   * Battle Mode only, and only when the season had a third "guest" driver
   * (Prawns). Null for every two-driver race, every solo-mode race, and
   * every race recorded before this existed. Never read by the core stats
   * layer — only by the guest-stats aggregation and the season-rewind
   * detail page's optional guest column.
   */
  guestFinishingPosition?: number | null;
  guestBlueShellCount?: number | null;
}

/**
 * A season shell. `winnerId`/`adiFinalPoints`/`renFinalPoints` are cached
 * for convenience once a season is completed, but must always be
 * reproducible by re-running the stats layer over this season's races.
 */
export interface RawSeason {
  id: string;
  seasonNumber: number;
  startDate: string;
  completionDate: string | null;
  isComplete: boolean;
  winnerId: PlayerId | "tie" | null;
  adiFinalPoints: number | null;
  renFinalPoints: number | null;
  createdAt: string;
  /**
   * Battle Mode only. A season is "battle mode" exactly when battleCode is
   * set — null/undefined means an ordinary solo-mode season, and every
   * season recorded before Battle Mode existed. adminPlayerId is claimed
   * atomically by whichever player's device joins first; adi/renJoinedAt
   * are set the moment each player's device joins with that code.
   */
  battleCode?: string | null;
  adminPlayerId?: PlayerId | null;
  adiJoinedAt?: string | null;
  renJoinedAt?: string | null;
  /**
   * Set once, at "how many drivers?" time when the battle is engaged —
   * true for a 3-driver battle (Adi, Ren, and Prawns), false/undefined for
   * an ordinary 2-driver battle or any solo-mode season. Never toggled
   * mid-season. guestJoinedAt mirrors adi/renJoinedAt for the third seat.
   */
  guestEnabled?: boolean;
  guestJoinedAt?: string | null;
}

// ============================================================================
// Battle Mode — multi-device live play. `BattleRound` is the ephemeral
// "round in progress" shape that only becomes a real RawRace once both
// positions are recorded. It is NEVER treated as a race by the stats
// layer — nothing in lib/stats reads it. `RacePowerup` is the permanent,
// per-finalized-race record of which items a player logged, copied over
// from the round at finalize time.
// ============================================================================

/** All 19 items in the Mario Kart Wii item roster (see lib/data/items.ts). */
export type ItemId =
  | "mushroom"
  | "triple-mushrooms"
  | "golden-mushroom"
  | "mega-mushroom"
  | "green-shell"
  | "triple-green-shells"
  | "red-shell"
  | "triple-red-shells"
  | "blue-shell"
  | "banana"
  | "triple-bananas"
  | "bob-omb"
  | "fake-item-box"
  | "bullet-bill"
  | "star"
  | "blooper"
  | "pow-block"
  | "thunder-cloud"
  | "lightning";

/**
 * The in-progress round for a battle-mode season: the admin has picked a
 * circuit, and the two players are logging blue shells / power-ups and
 * eventually their finishing positions from their own phones. At most one
 * non-finalized row exists per season at a time. Once both positions are
 * in, this finalizes into a real RawRace (via the existing addRace) and
 * this row is updated (never deleted) with finalizedAt/finalizedRaceId so
 * the audit trail and any in-flight client requests stay coherent.
 */
export interface BattleRound {
  id: string;
  seasonId: string;
  raceNumber: number;
  circuitId: string;
  adiPosition: number | null;
  renPosition: number | null;
  adiBlueShellCount: number;
  renBlueShellCount: number;
  finalizedAt: string | null;
  finalizedRaceId: string | null;
  createdAt: string;
  /**
   * Snapshotted from the season's guestEnabled at startRound time (rather
   * than looked up via a join every time), so claimFinalizeRound can check
   * "is a guest position required to finalize this round" with the round
   * row alone. guestPosition/guestBlueShellCount are always present on the
   * row but only meaningful — and only shown in the UI — when this is true.
   */
  guestEnabled: boolean;
  guestPosition: number | null;
  guestBlueShellCount: number;
}

/** One driver's logged count of one item, for one round (live) or one finalized race (permanent). */
export interface RoundPowerup {
  battleRoundId: string;
  playerId: DriverId;
  itemId: ItemId;
  count: number;
}

export interface RacePowerup {
  raceId: string;
  playerId: DriverId;
  itemId: ItemId;
  count: number;
}

export const RACES_PER_SEASON = 32;

export interface RaceInput {
  circuitId: string;
  adiFinishingPosition: number;
  renFinishingPosition: number;
  /** Battle Mode, 3-driver seasons only. Omitted/undefined for every other race. */
  guestFinishingPosition?: number | null;
}
