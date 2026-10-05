// ============================================================================
// Core domain types — the raw, source-of-truth shape of the data.
// Nothing in this file is a derived/aggregate statistic. Aggregates live in
// lib/stats and are always computed FROM these shapes, never stored as truth.
// ============================================================================

export type PlayerId = "adi" | "ren";

/** Mario Kart Wii's three size classes — see lib/data/characters.ts and lib/data/karts.ts. */
export type WeightClass = "small" | "medium" | "large";

/** How a player drove a given race — manual drift or automatic. */
export type TransmissionMode = "automatic" | "manual";

/**
 * War Mode's top-level choice (spec section 1): "manual" is the original
 * flow, completely untouched by this feature. "immersive" is the new
 * Dolphin-telemetry-driven flow -- see RawSeason.mode below.
 */
export type WarModeMode = "manual" | "immersive";

/** Immersive only -- whether a second device joins as a live spectator. */
export type DisplayConfig = "same-device" | "dual-device";

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
  /**
   * Battle Mode only, and only from Season 15 onward ("Kart Kontrol" — see
   * lib/stats/kart-kontrol.ts). Copied from the BattleRound's own loadout
   * fields once the round finalizes. Always null for every solo-mode race,
   * every guest driver, and every race before Season 15 — never fabricated
   * for older seasons, and never required by the core stats layer (points/
   * standings/season totals never read these).
   */
  adiCharacter?: string | null;
  adiKart?: string | null;
  adiTransmission?: TransmissionMode | null;
  renCharacter?: string | null;
  renKart?: string | null;
  renTransmission?: TransmissionMode | null;
  /**
   * Immersive War Mode only (see WarModeMode below) -- per-lap and final
   * times in milliseconds, captured live by the Dolphin telemetry bridge
   * (lib/telemetry/events.ts) and copied over once the race finalizes.
   * Always null for Manual and Battle Mode races, and for every race
   * recorded before Immersive mode existed -- never required or assumed
   * present by the core stats layer (points/standings never read these).
   * Lap 0 is dropped at ingestion, so these are always real laps 1-3.
   * Circuit Records (lib/stats/circuit-records.ts) are the only consumer.
   */
  adiLap1TimeMs?: number | null;
  adiLap2TimeMs?: number | null;
  adiLap3TimeMs?: number | null;
  adiFinalTimeMs?: number | null;
  renLap1TimeMs?: number | null;
  renLap2TimeMs?: number | null;
  renLap3TimeMs?: number | null;
  renFinalTimeMs?: number | null;
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
  /**
   * Immersive War Mode (section 1-2 of the integration spec): "manual" is
   * the original, fully-unchanged flow (addRaceAction + manual position
   * entry); "immersive" means the Dolphin telemetry bridge drives live
   * tracking and auto-finalizes races. Undefined/omitted means "manual" --
   * every season recorded before Immersive mode existed is implicitly
   * manual, never backfilled.
   */
  mode?: WarModeMode;
  /**
   * Immersive only. "same-device" is one screen/one Dolphin instance for
   * both players (the common case); "dual-device" additionally reuses the
   * existing battleCode/adiJoinedAt/renJoinedAt join infrastructure above
   * so a second device can spectate the live dashboard.
   */
  displayConfig?: DisplayConfig;
  /**
   * Immersive only. Which raw tracked Dolphin slot (1 or 2) is adi vs ren,
   * set once during Player Assignment. The telemetry bridge resolves
   * every incoming event's slot through this (see resolveSlotToPlayer in
   * lib/telemetry/events.ts) before anything is persisted -- nothing
   * downstream of ingestion ever sees a raw slot number.
   */
  adiTelemetrySlot?: 1 | 2 | null;
  renTelemetrySlot?: 1 | 2 | null;
  /**
   * Immersive only. Each player's chosen character/kart/transmission for
   * the whole season, set once during Player Assignment (reusing the
   * existing Kart Kontrol rosters/components -- lib/data/characters.ts,
   * karts.ts -- rather than a new concept). Unlike Battle Mode's Kart
   * Kontrol, which re-picks per round, Immersive mode fixes the loadout
   * for the season; copied onto every race as it finalizes, same columns
   * RawRace already has from Kart Kontrol.
   */
  adiCharacter?: string | null;
  adiKart?: string | null;
  adiTransmission?: TransmissionMode | null;
  renCharacter?: string | null;
  renKart?: string | null;
  renTransmission?: TransmissionMode | null;
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
  /**
   * Null until the admin picks a track for this round — which now happens
   * AFTER both players lock in their own character/kart/transmission (see
   * Kart Kontrol below), matching the real game's own flow of picking your
   * racer before the course. A round always exists before a circuit does;
   * nothing in the stats layer ever reads a BattleRound directly, so this
   * widening doesn't touch anything outside Battle Mode's own UI.
   */
  circuitId: string | null;
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
  /**
   * Kart Kontrol loadout, set independently by each of Adi and Ren from
   * their own device before their own "race concluded?" step unlocks (see
   * Cockpit.tsx / LoadoutSetup.tsx) — never required from the guest driver.
   * Null until that player sets it for this round; copied onto the real
   * race at finalize time by setRaceLoadout.
   */
  adiCharacter: string | null;
  adiKart: string | null;
  adiTransmission: TransmissionMode | null;
  renCharacter: string | null;
  renKart: string | null;
  renTransmission: TransmissionMode | null;
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
  /** Immersive only -- see the matching fields on RawRace above. */
  adiLap1TimeMs?: number | null;
  adiLap2TimeMs?: number | null;
  adiLap3TimeMs?: number | null;
  adiFinalTimeMs?: number | null;
  renLap1TimeMs?: number | null;
  renLap2TimeMs?: number | null;
  renLap3TimeMs?: number | null;
  renFinalTimeMs?: number | null;
  /**
   * Immersive only -- the season's locked-in loadout (detected once from
   * race 1, see lib/telemetry/finalize.ts), copied onto every race as it
   * finalizes. No transmission field -- Immersive doesn't read that out
   * of memory, unlike Battle Mode's manually-picked Kart Kontrol loadout.
   */
  adiCharacter?: string | null;
  adiKart?: string | null;
  renCharacter?: string | null;
  renKart?: string | null;
}

// ============================================================================
// Immersive War Mode -- permanent per-race telemetry detail. Unlike
// live_telemetry_events (ephemeral, cleared once a race finalizes -- see
// lib/telemetry/events.ts), these two tables are the permanent record a
// finalized Immersive race carries forever: the full position-over-time
// timeline (for the live position graph during the race, and the
// Season Rewind position graph afterward) and the full item-received
// timeline (for the Season Rewind powerup graph). Both are written once,
// at finalize time, from the same live_telemetry_events rows that drove
// the live dashboard -- never reconstructed after the fact (spec section
// 8: "save complete position-time data with each race at finish, not
// reconstructed").
// ============================================================================

/** One timestamped position reading for one player, during one race. */
export interface RacePositionSample {
  raceId: string;
  playerId: PlayerId;
  tsMs: number; // elapsed ms since the race started
  position: number;
  lap: number; // always 1-3 -- lap 0 is dropped before this table ever sees a row
}

/** One timestamped item pickup for one player, during one race. */
export interface RaceItemEvent {
  raceId: string;
  playerId: PlayerId;
  tsMs: number;
  itemId: ItemId;
  lap: number;
}
