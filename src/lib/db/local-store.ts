import type { BattleRound, Circuit, DisplayConfig, DriverId, PointsMapping, RawRace, RawSeason, RaceInput, RaceItemEvent, RacePositionSample, RacePowerup, RoundPowerup } from "@/lib/types";
import type { StoredTelemetryEvent } from "@/lib/telemetry/events";
import { RACES_PER_SEASON } from "@/lib/types";
import { CIRCUITS } from "@/lib/data/circuits";
import { DEFAULT_POINTS_MAPPING, PLAYERS } from "@/lib/data/points-mapping";
import { generateBattleCode } from "@/lib/data/battle-code";
import realHistory from "@/lib/data/real-history.json";
import type { DataStore, ImportBatchResult } from "./types";

interface LocalState {
  circuits: Circuit[];
  pointsMapping: PointsMapping;
  seasons: RawSeason[];
  racesBySeasonId: Map<string, RawRace[]>;
  importedHashes: Set<string>;
  battleRounds: Map<string, BattleRound>;
  roundPowerups: Map<string, RoundPowerup[]>; // keyed by battleRoundId
  racePowerups: RacePowerup[];
  // Immersive War Mode -- see db/types.ts's "Immersive War Mode" section.
  liveTelemetryEvents: Map<string, StoredTelemetryEvent[]>; // keyed by `${seasonId}:${raceNumber}`
  racePositionSamples: RacePositionSample[];
  raceItemEvents: RaceItemEvent[];
}

function loadInitialState(): LocalState {
  const seasons: RawSeason[] = (realHistory.seasons as RawSeason[]).map((s) => ({ ...s }));
  const racesBySeasonId = new Map<string, RawRace[]>();
  for (const race of realHistory.races as RawRace[]) {
    const list = racesBySeasonId.get(race.seasonId) ?? [];
    list.push(race);
    racesBySeasonId.set(race.seasonId, list);
  }

  return {
    circuits: [...CIRCUITS],
    pointsMapping: [...DEFAULT_POINTS_MAPPING],
    seasons,
    racesBySeasonId,
    importedHashes: new Set(),
    battleRounds: new Map(),
    roundPowerups: new Map(),
    racePowerups: [],
    liveTelemetryEvents: new Map(),
    racePositionSamples: [],
    raceItemEvents: [],
  };
}

// Survive Next.js dev-server hot-reloads by stashing state on globalThis.
const globalForStore = globalThis as unknown as { __mkRivalryStore?: LocalState };
const state: LocalState = globalForStore.__mkRivalryStore ?? loadInitialState();
globalForStore.__mkRivalryStore = state;

function nextSeasonNumber(): number {
  return state.seasons.reduce((max, s) => Math.max(max, s.seasonNumber), 0) + 1;
}

export const localStore: DataStore = {
  async getPlayers() {
    return PLAYERS;
  },

  async getCircuits() {
    return state.circuits;
  },

  async addCircuits(circuits) {
    const existingIds = new Set(state.circuits.map((c) => c.id));
    for (const c of circuits) {
      if (!existingIds.has(c.id)) {
        state.circuits.push(c);
        existingIds.add(c.id);
      }
    }
  },

  async getPointsMapping() {
    return state.pointsMapping;
  },

  async setPointsMapping(mapping) {
    state.pointsMapping = mapping;
  },

  async getSeasons() {
    return state.seasons;
  },

  async getRacesBySeasonId() {
    return state.racesBySeasonId;
  },

  async startSeason() {
    const seasonNumber = nextSeasonNumber();
    const season: RawSeason = {
      id: `season-${seasonNumber}-${Date.now()}`,
      seasonNumber,
      startDate: new Date().toISOString(),
      completionDate: null,
      isComplete: false,
      winnerId: null,
      adiFinalPoints: null,
      renFinalPoints: null,
      createdAt: new Date().toISOString(),
    };
    state.seasons.push(season);
    state.racesBySeasonId.set(season.id, []);
    return season;
  },

  async addRace(seasonId, input: RaceInput) {
    const existing = state.racesBySeasonId.get(seasonId) ?? [];
    if (existing.length >= RACES_PER_SEASON) {
      throw new Error(`Season already has ${RACES_PER_SEASON} races recorded.`);
    }
    const race: RawRace = {
      id: `${seasonId}-race-${existing.length + 1}`,
      seasonId,
      raceNumber: existing.length + 1,
      circuitId: input.circuitId,
      adiFinishingPosition: input.adiFinishingPosition,
      renFinishingPosition: input.renFinishingPosition,
      createdAt: new Date().toISOString(),
      guestFinishingPosition: input.guestFinishingPosition ?? null,
      // Immersive only -- undefined on every Manual/Battle Mode RaceInput, so these stay undefined (not fabricated null) exactly like the omitted-field convention elsewhere on RawRace.
      adiLap1TimeMs: input.adiLap1TimeMs ?? null,
      adiLap2TimeMs: input.adiLap2TimeMs ?? null,
      adiLap3TimeMs: input.adiLap3TimeMs ?? null,
      adiFinalTimeMs: input.adiFinalTimeMs ?? null,
      renLap1TimeMs: input.renLap1TimeMs ?? null,
      renLap2TimeMs: input.renLap2TimeMs ?? null,
      renLap3TimeMs: input.renLap3TimeMs ?? null,
      renFinalTimeMs: input.renFinalTimeMs ?? null,
    };
    state.racesBySeasonId.set(seasonId, [...existing, race]);
    return race;
  },

  async completeSeason(seasonId, cached) {
    const season = state.seasons.find((s) => s.id === seasonId);
    if (!season) throw new Error("Season not found");
    season.isComplete = true;
    season.completionDate = new Date().toISOString();
    season.winnerId = cached.winnerId;
    season.adiFinalPoints = cached.adiFinalPoints;
    season.renFinalPoints = cached.renFinalPoints;
    return season;
  },

  async importSeasons(seasons, racesBySeasonId, contentHash, sourceFileName): Promise<ImportBatchResult> {
    if (state.importedHashes.has(contentHash)) {
      return {
        imported: false,
        reason: `This file has already been imported (matched by content hash). Source: ${sourceFileName}`,
        seasonNumbers: [],
        raceCount: 0,
      };
    }

    const existingNumbers = new Set(state.seasons.map((s) => s.seasonNumber));
    const conflicting = seasons.filter((s) => existingNumbers.has(s.seasonNumber));
    if (conflicting.length > 0) {
      return {
        imported: false,
        reason: `Season number(s) ${conflicting
          .map((s) => s.seasonNumber)
          .join(", ")} already exist — remap or clear existing data before re-importing.`,
        seasonNumbers: [],
        raceCount: 0,
      };
    }

    state.seasons.push(...seasons);
    for (const [seasonId, races] of racesBySeasonId.entries()) {
      state.racesBySeasonId.set(seasonId, races);
    }
    state.importedHashes.add(contentHash);

    return {
      imported: true,
      seasonNumbers: seasons.map((s) => s.seasonNumber),
      raceCount: [...racesBySeasonId.values()].reduce((sum, r) => sum + r.length, 0),
    };
  },

  // --- Battle Mode ------------------------------------------------------
  // No real concurrency here (single in-process JS thread), so the
  // "atomic" guards below are really just about matching the interface's
  // semantics for local/dev testing — the live-multi-device behavior this
  // exists to validate can only really be exercised against Supabase.

  async startBattleSeason(guestEnabled) {
    const seasonNumber = nextSeasonNumber();
    let code = generateBattleCode();
    while (state.seasons.some((s) => s.battleCode === code)) code = generateBattleCode();
    const season: RawSeason = {
      id: `season-${seasonNumber}-${Date.now()}`,
      seasonNumber,
      startDate: new Date().toISOString(),
      completionDate: null,
      isComplete: false,
      winnerId: null,
      adiFinalPoints: null,
      renFinalPoints: null,
      createdAt: new Date().toISOString(),
      battleCode: code,
      adminPlayerId: null,
      adiJoinedAt: null,
      renJoinedAt: null,
      guestEnabled,
      guestJoinedAt: null,
    };
    state.seasons.push(season);
    state.racesBySeasonId.set(season.id, []);
    return season;
  },

  async getSeasonByBattleCode(code) {
    return state.seasons.find((s) => s.battleCode === code) ?? null;
  },

  async joinBattleSeason(seasonId, playerId: DriverId) {
    const season = state.seasons.find((s) => s.id === seasonId);
    if (!season) throw new Error("Season not found");
    const key = playerId === "adi" ? "adiJoinedAt" : playerId === "ren" ? "renJoinedAt" : "guestJoinedAt";
    if (!season[key]) season[key] = new Date().toISOString();
    return season;
  },

  async claimAdmin(seasonId, playerId) {
    const season = state.seasons.find((s) => s.id === seasonId);
    if (!season) throw new Error("Season not found");
    if (!season.adminPlayerId) season.adminPlayerId = playerId;
    return season;
  },

  async getActiveRound(seasonId) {
    for (const round of state.battleRounds.values()) {
      if (round.seasonId === seasonId && round.finalizedAt === null) return round;
    }
    return null;
  },

  async startRound(seasonId) {
    const existing = await localStore.getActiveRound(seasonId);
    if (existing) throw new Error("A round is already in progress for this season.");
    const season = state.seasons.find((s) => s.id === seasonId);
    const races = state.racesBySeasonId.get(seasonId) ?? [];
    if (races.length >= RACES_PER_SEASON) {
      throw new Error(`Season already has ${RACES_PER_SEASON} races recorded.`);
    }
    const round: BattleRound = {
      id: `round-${seasonId}-${Date.now()}`,
      seasonId,
      raceNumber: races.length + 1,
      circuitId: null,
      adiPosition: null,
      renPosition: null,
      adiBlueShellCount: 0,
      renBlueShellCount: 0,
      finalizedAt: null,
      finalizedRaceId: null,
      createdAt: new Date().toISOString(),
      guestEnabled: Boolean(season?.guestEnabled),
      guestPosition: null,
      guestBlueShellCount: 0,
      adiCharacter: null,
      adiKart: null,
      adiTransmission: null,
      renCharacter: null,
      renKart: null,
      renTransmission: null,
    };
    state.battleRounds.set(round.id, round);
    return round;
  },

  async setRoundCircuit(roundId, circuitId) {
    const round = state.battleRounds.get(roundId);
    if (!round) throw new Error("Round not found");
    if (round.finalizedAt) return round; // no-op, matches recordRoundPosition's idempotent behavior
    round.circuitId = circuitId;
    return round;
  },

  async recordRoundPosition(roundId, playerId: DriverId, position) {
    const round = state.battleRounds.get(roundId);
    if (!round) throw new Error("Round not found");
    if (round.finalizedAt) return round; // no-op, matches supabase-store's idempotent behavior
    if (playerId === "adi") round.adiPosition = position;
    else if (playerId === "ren") round.renPosition = position;
    else round.guestPosition = position;
    return round;
  },

  async setRoundLoadout(roundId, playerId, loadout) {
    const round = state.battleRounds.get(roundId);
    if (!round) throw new Error("Round not found");
    if (round.finalizedAt) return round; // no-op, matches recordRoundPosition's idempotent behavior
    if (playerId === "adi") {
      round.adiCharacter = loadout.character;
      round.adiKart = loadout.kart;
      round.adiTransmission = loadout.transmission;
    } else {
      round.renCharacter = loadout.character;
      round.renKart = loadout.kart;
      round.renTransmission = loadout.transmission;
    }
    return round;
  },

  async incrementBlueShellCount(roundId, playerId: DriverId) {
    const round = state.battleRounds.get(roundId);
    if (!round) throw new Error("Round not found");
    if (playerId === "adi") round.adiBlueShellCount += 1;
    else if (playerId === "ren") round.renBlueShellCount += 1;
    else round.guestBlueShellCount += 1;
    return round;
  },

  async decrementBlueShellCount(roundId, playerId: DriverId) {
    const round = state.battleRounds.get(roundId);
    if (!round) throw new Error("Round not found");
    if (playerId === "adi") round.adiBlueShellCount = Math.max(0, round.adiBlueShellCount - 1);
    else if (playerId === "ren") round.renBlueShellCount = Math.max(0, round.renBlueShellCount - 1);
    else round.guestBlueShellCount = Math.max(0, round.guestBlueShellCount - 1);
    return round;
  },

  async setRoundPowerupCount(roundId, playerId, itemId, count) {
    const existing = state.roundPowerups.get(roundId) ?? [];
    const idx = existing.findIndex((p) => p.playerId === playerId && p.itemId === itemId);
    const entry: RoundPowerup = { battleRoundId: roundId, playerId, itemId, count };
    if (idx >= 0) existing[idx] = entry;
    else existing.push(entry);
    state.roundPowerups.set(roundId, existing);
  },

  async getRoundPowerups(roundId) {
    return state.roundPowerups.get(roundId) ?? [];
  },

  async claimFinalizeRound(roundId) {
    const round = state.battleRounds.get(roundId);
    if (!round) return null;
    if (round.finalizedAt) return null;
    if (round.adiPosition === null || round.renPosition === null) return null;
    if (round.guestEnabled && round.guestPosition === null) return null;
    round.finalizedAt = new Date().toISOString();
    return round;
  },

  async unclaimFinalizeRound(roundId) {
    const round = state.battleRounds.get(roundId);
    if (round) round.finalizedAt = null;
  },

  async completeFinalizeRound(roundId, raceId) {
    const round = state.battleRounds.get(roundId);
    if (round) round.finalizedRaceId = raceId;
  },

  async setRaceBlueShellCounts(raceId, adiCount, renCount, guestCount) {
    for (const races of state.racesBySeasonId.values()) {
      const race = races.find((r) => r.id === raceId);
      if (race) {
        race.adiBlueShellCount = adiCount;
        race.renBlueShellCount = renCount;
        race.guestBlueShellCount = guestCount ?? null;
        return;
      }
    }
  },

  async setRaceLoadout(raceId, loadout) {
    for (const races of state.racesBySeasonId.values()) {
      const race = races.find((r) => r.id === raceId);
      if (race) {
        race.adiCharacter = loadout.adiCharacter;
        race.adiKart = loadout.adiKart;
        race.adiTransmission = loadout.adiTransmission;
        race.renCharacter = loadout.renCharacter;
        race.renKart = loadout.renKart;
        race.renTransmission = loadout.renTransmission;
        return;
      }
    }
  },

  async copyRoundPowerupsToRace(roundId, raceId) {
    const roundPowerups = state.roundPowerups.get(roundId) ?? [];
    for (const p of roundPowerups) {
      state.racePowerups.push({ raceId, playerId: p.playerId, itemId: p.itemId, count: p.count });
    }
  },

  async getRacePowerups() {
    return state.racePowerups;
  },

  async deleteEmptySeason(seasonId) {
    state.seasons = state.seasons.filter((s) => s.id !== seasonId);
    state.racesBySeasonId.delete(seasonId);
    for (const [roundId, round] of state.battleRounds) {
      if (round.seasonId === seasonId) {
        state.battleRounds.delete(roundId);
        state.roundPowerups.delete(roundId);
      }
    }
  },

  // --- Immersive War Mode ------------------------------------------------

  async startImmersiveSeason(displayConfig: DisplayConfig) {
    const seasonNumber = nextSeasonNumber();
    let battleCode: string | null = null;
    if (displayConfig === "dual-device") {
      battleCode = generateBattleCode();
      while (state.seasons.some((s) => s.battleCode === battleCode)) battleCode = generateBattleCode();
    }
    const season: RawSeason = {
      id: `season-${seasonNumber}-${Date.now()}`,
      seasonNumber,
      startDate: new Date().toISOString(),
      completionDate: null,
      isComplete: false,
      winnerId: null,
      adiFinalPoints: null,
      renFinalPoints: null,
      createdAt: new Date().toISOString(),
      mode: "immersive",
      displayConfig,
      adiTelemetrySlot: null,
      renTelemetrySlot: null,
      adiCharacter: null,
      adiKart: null,
      adiTransmission: null,
      renCharacter: null,
      renKart: null,
      renTransmission: null,
      ...(battleCode ? { battleCode, adminPlayerId: null, adiJoinedAt: null, renJoinedAt: null } : {}),
    };
    state.seasons.push(season);
    state.racesBySeasonId.set(season.id, []);
    return season;
  },

  async setSeasonTelemetrySlots(seasonId, adiSlot, renSlot) {
    const season = state.seasons.find((s) => s.id === seasonId);
    if (!season) throw new Error("Season not found");
    season.adiTelemetrySlot = adiSlot;
    season.renTelemetrySlot = renSlot;
    return season;
  },

  async setSeasonImmersiveLoadout(seasonId, loadout) {
    const season = state.seasons.find((s) => s.id === seasonId);
    if (!season) throw new Error("Season not found");
    season.adiCharacter = loadout.adiCharacter;
    season.adiKart = loadout.adiKart;
    season.adiTransmission = loadout.adiTransmission;
    season.renCharacter = loadout.renCharacter;
    season.renKart = loadout.renKart;
    season.renTransmission = loadout.renTransmission;
    return season;
  },

  async ingestTelemetryEvents(seasonId, raceNumber, events) {
    const key = `${seasonId}:${raceNumber}`;
    const existing = state.liveTelemetryEvents.get(key) ?? [];
    state.liveTelemetryEvents.set(key, [...existing, ...events]);
  },

  async getLiveTelemetryEvents(seasonId, raceNumber) {
    return state.liveTelemetryEvents.get(`${seasonId}:${raceNumber}`) ?? [];
  },

  async clearLiveTelemetryEvents(seasonId, raceNumber) {
    state.liveTelemetryEvents.delete(`${seasonId}:${raceNumber}`);
  },

  async addRacePositionSamples(raceId, samples) {
    state.racePositionSamples.push(...samples.map((s) => ({ ...s, raceId })));
  },

  async getRacePositionSamples(raceId) {
    return state.racePositionSamples.filter((s) => s.raceId === raceId);
  },

  async addRaceItemEvents(raceId, events) {
    state.raceItemEvents.push(...events.map((e) => ({ ...e, raceId })));
  },

  async getRaceItemEvents(raceId) {
    return state.raceItemEvents.filter((e) => e.raceId === raceId);
  },

  async addRacePowerups(raceId, powerups) {
    state.racePowerups.push(...powerups.map((p) => ({ ...p, raceId })));
  },
};
