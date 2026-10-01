import type { Circuit, PlayerId, TransmissionMode } from "@/lib/types";
import type { RaceStat, SeasonStat } from "./types";
import { median, average, round } from "./math";
import { CHARACTERS_BY_ID } from "@/lib/data/characters";
import { VEHICLES_BY_ID } from "@/lib/data/karts";

/**
 * Kart Kontrol (Season 15+): character / kart / transmission stats, derived
 * entirely from the loadout fields on RaceStat (which come straight from
 * RawRace — see lib/types.ts). Every function here treats a race with no
 * loadout data (every Season 1-14 race, and every guest-driver result) as
 * simply absent from character/kart-filtered views — never backfilled,
 * never guessed. The unfiltered ("everything") view is the one place
 * pre-Season-15 history still shows up, since it's just this player's full
 * career with no loadout slice applied.
 *
 * Minimum sample size before drawing a "strong"/"weak" circuit or combo
 * conclusion — below this, callers should show "Insufficient data" instead
 * of a fabricated pattern.
 */
export const MIN_SAMPLE_SIZE = 3;

export interface KartKontrolFilter {
  character: string | null;
  kart: string | null;
  transmission?: TransmissionMode | null;
}

function avgRound(values: number[]): number | null {
  const a = average(values);
  return a === null ? null : round(a, 2);
}

function playerCharacter(race: RaceStat, playerId: PlayerId): string | null {
  return (playerId === "adi" ? race.adiCharacter : race.renCharacter) ?? null;
}

function playerKart(race: RaceStat, playerId: PlayerId): string | null {
  return (playerId === "adi" ? race.adiKart : race.renKart) ?? null;
}

function playerTransmission(race: RaceStat, playerId: PlayerId): TransmissionMode | null {
  return (playerId === "adi" ? race.adiTransmission : race.renTransmission) ?? null;
}

function playerFinish(race: RaceStat, playerId: PlayerId): number {
  return playerId === "adi" ? race.adiFinishingPosition : race.renFinishingPosition;
}

function playerPoints(race: RaceStat, playerId: PlayerId): number {
  return playerId === "adi" ? race.adiPoints : race.renPoints;
}

function hasFilter(filter: KartKontrolFilter): boolean {
  return Boolean(filter.character || filter.kart || filter.transmission);
}

function matchesFilter(race: RaceStat, playerId: PlayerId, filter: KartKontrolFilter): boolean {
  if (filter.character && playerCharacter(race, playerId) !== filter.character) return false;
  if (filter.kart && playerKart(race, playerId) !== filter.kart) return false;
  if (filter.transmission && playerTransmission(race, playerId) !== filter.transmission) return false;
  return true;
}

/** Distinct characters this player has actually used (Season 15+ only), by name. */
export function getUsedCharacterIds(seasons: SeasonStat[], playerId: PlayerId): string[] {
  const ids = new Set<string>();
  for (const season of seasons) {
    for (const race of season.races) {
      const c = playerCharacter(race, playerId);
      if (c) ids.add(c);
    }
  }
  return [...ids].sort((a, b) =>
    (CHARACTERS_BY_ID.get(a)?.name ?? a).localeCompare(CHARACTERS_BY_ID.get(b)?.name ?? b)
  );
}

/** Distinct karts/bikes this player has actually used (Season 15+ only), by name. */
export function getUsedKartIds(seasons: SeasonStat[], playerId: PlayerId): string[] {
  const ids = new Set<string>();
  for (const season of seasons) {
    for (const race of season.races) {
      const k = playerKart(race, playerId);
      if (k) ids.add(k);
    }
  }
  return [...ids].sort((a, b) =>
    (VEHICLES_BY_ID.get(a)?.name ?? a).localeCompare(VEHICLES_BY_ID.get(b)?.name ?? b)
  );
}

/**
 * Every race matching the current filter for this player. With no filter
 * set at all, this is the player's entire career (including pre-Season-15
 * races, which simply have null loadout fields) — exactly what "everything"
 * should mean in the two-way character/kart filter.
 */
export function filterRaces(seasons: SeasonStat[], playerId: PlayerId, filter: KartKontrolFilter): RaceStat[] {
  return seasons.flatMap((s) => s.races).filter((r) => matchesFilter(r, playerId, filter));
}

/** Every season in which this player has at least one race matching the filter — "everything" means every season played. */
export function getSeasonsUsingLoadout(seasons: SeasonStat[], playerId: PlayerId, filter: KartKontrolFilter): SeasonStat[] {
  if (!hasFilter(filter)) return seasons;
  return seasons.filter((s) => s.races.some((r) => matchesFilter(r, playerId, filter)));
}

export interface KartKontrolSummary {
  races: number;
  racesWon: number;
  seasonsWon: number;
  podiums: number;
  totalPoints: number;
  avgPointsPerRace: number | null;
  medianFinish: number | null;
  avgFinish: number | null;
  winRate: number | null;
  podiumRate: number | null;
}

export function buildKartKontrolSummary(
  seasons: SeasonStat[],
  playerId: PlayerId,
  filter: KartKontrolFilter
): KartKontrolSummary {
  const races = filterRaces(seasons, playerId, filter);
  const finishes = races.map((r) => playerFinish(r, playerId));
  const points = races.map((r) => playerPoints(r, playerId));
  const racesWon = finishes.filter((p) => p === 1).length;
  const podiums = finishes.filter((p) => p >= 1 && p <= 3).length;
  const seasonsUsing = getSeasonsUsingLoadout(seasons, playerId, filter);
  const seasonsWon = seasonsUsing.filter((s) => s.isComplete && s.winner === playerId).length;

  return {
    races: races.length,
    racesWon,
    seasonsWon,
    podiums,
    totalPoints: points.reduce((a, b) => a + b, 0),
    avgPointsPerRace: avgRound(points),
    medianFinish: median(finishes),
    avgFinish: avgRound(finishes),
    winRate: races.length === 0 ? null : round((racesWon / races.length) * 100, 1),
    podiumRate: races.length === 0 ? null : round((podiums / races.length) * 100, 1),
  };
}

export interface KartKontrolSeasonRow {
  seasonNumber: number;
  isComplete: boolean;
  winner: PlayerId | "tie" | null;
  playerFinalPoints: number | null;
  racesWithLoadout: number;
  totalRaces: number;
}

/** Rows for the "Seasons using this loadout" table — each links to the existing /season-rewind/[seasonNumber] page. */
export function buildSeasonsTable(
  seasons: SeasonStat[],
  playerId: PlayerId,
  filter: KartKontrolFilter
): KartKontrolSeasonRow[] {
  const using = getSeasonsUsingLoadout(seasons, playerId, filter);
  const filterApplied = hasFilter(filter);
  return [...using]
    .sort((a, b) => b.season.seasonNumber - a.season.seasonNumber)
    .map((s) => ({
      seasonNumber: s.season.seasonNumber,
      isComplete: s.isComplete,
      winner: s.winner,
      playerFinalPoints: playerId === "adi" ? s.adiFinalPoints : s.renFinalPoints,
      racesWithLoadout: filterApplied ? s.races.filter((r) => matchesFilter(r, playerId, filter)).length : s.racesPlayed,
      totalRaces: s.racesPlayed,
    }));
}

export interface KartKontrolCircuitRow {
  circuit: Circuit;
  races: number;
  wins: number;
  podiums: number;
  avgFinish: number | null;
  medianFinish: number | null;
  totalPoints: number;
  avgPoints: number | null;
}

/** Circuit-by-circuit breakdown for the current filter. */
export function buildCircuitBreakdown(
  seasons: SeasonStat[],
  playerId: PlayerId,
  filter: KartKontrolFilter,
  circuits: Circuit[]
): KartKontrolCircuitRow[] {
  const races = filterRaces(seasons, playerId, filter);
  const circuitsById = new Map(circuits.map((c) => [c.id, c]));
  const byCircuit = new Map<string, RaceStat[]>();
  for (const r of races) {
    const list = byCircuit.get(r.circuitId) ?? [];
    list.push(r);
    byCircuit.set(r.circuitId, list);
  }

  const rows: KartKontrolCircuitRow[] = [];
  for (const [circuitId, circuitRaces] of byCircuit) {
    const circuit = circuitsById.get(circuitId);
    if (!circuit) continue;
    const finishes = circuitRaces.map((r) => playerFinish(r, playerId));
    const points = circuitRaces.map((r) => playerPoints(r, playerId));
    rows.push({
      circuit,
      races: circuitRaces.length,
      wins: finishes.filter((p) => p === 1).length,
      podiums: finishes.filter((p) => p >= 1 && p <= 3).length,
      avgFinish: avgRound(finishes),
      medianFinish: median(finishes),
      totalPoints: points.reduce((a, b) => a + b, 0),
      avgPoints: avgRound(points),
    });
  }
  return rows.sort((a, b) => b.races - a.races || a.circuit.name.localeCompare(b.circuit.name));
}

export interface LoadoutUsageRow {
  id: string;
  name: string;
  races: number;
  wins: number;
  podiums: number;
  winRate: number | null;
  podiumRate: number | null;
  avgFinish: number | null;
  avgPoints: number | null;
}

function buildUsageRows(
  seasons: SeasonStat[],
  playerId: PlayerId,
  pick: (race: RaceStat) => string | null,
  nameOf: (id: string) => string
): LoadoutUsageRow[] {
  const byId = new Map<string, RaceStat[]>();
  for (const season of seasons) {
    for (const race of season.races) {
      const id = pick(race);
      if (!id) continue;
      const list = byId.get(id) ?? [];
      list.push(race);
      byId.set(id, list);
    }
  }

  const rows: LoadoutUsageRow[] = [];
  for (const [id, races] of byId) {
    const finishes = races.map((r) => playerFinish(r, playerId));
    const points = races.map((r) => playerPoints(r, playerId));
    const wins = finishes.filter((p) => p === 1).length;
    const podiums = finishes.filter((p) => p >= 1 && p <= 3).length;
    rows.push({
      id,
      name: nameOf(id),
      races: races.length,
      wins,
      podiums,
      winRate: round((wins / races.length) * 100, 1),
      podiumRate: round((podiums / races.length) * 100, 1),
      avgFinish: avgRound(finishes),
      avgPoints: avgRound(points),
    });
  }
  return rows.sort((a, b) => b.races - a.races);
}

/** Insights: character-vs-character comparison, limited to characters this player has actually used. */
export function buildCharacterComparison(seasons: SeasonStat[], playerId: PlayerId): LoadoutUsageRow[] {
  return buildUsageRows(
    seasons,
    playerId,
    (r) => playerCharacter(r, playerId),
    (id) => CHARACTERS_BY_ID.get(id)?.name ?? id
  );
}

/** Insights: kart-vs-kart comparison, limited to vehicles this player has actually used. */
export function buildKartComparison(seasons: SeasonStat[], playerId: PlayerId): LoadoutUsageRow[] {
  return buildUsageRows(
    seasons,
    playerId,
    (r) => playerKart(r, playerId),
    (id) => VEHICLES_BY_ID.get(id)?.name ?? id
  );
}

export interface CircuitSuitabilityEntry {
  circuit: Circuit;
  races: number;
  avgFinish: number | null;
  avgPoints: number | null;
}

export interface CircuitSuitability {
  strong: CircuitSuitabilityEntry[];
  weak: CircuitSuitabilityEntry[];
  /** True when not even one circuit has reached MIN_SAMPLE_SIZE races yet — callers should show "Insufficient data" rather than strong/weak. */
  insufficientData: boolean;
}

/**
 * Strong/weak circuits for a given set of races (already filtered to one
 * character, one kart, or one combo). A circuit only counts once it has at
 * least MIN_SAMPLE_SIZE races with this loadout — "strong"/"weak" is
 * relative to this loadout's OWN overall average points per race, not
 * against the other player or any other loadout, so it reads as "this
 * loadout does better/worse than usual here," not "this track is good in
 * general."
 */
function buildCircuitSuitabilityFor(races: RaceStat[], playerId: PlayerId, circuits: Circuit[]): CircuitSuitability {
  const circuitsById = new Map(circuits.map((c) => [c.id, c]));
  const byCircuit = new Map<string, RaceStat[]>();
  for (const r of races) {
    const list = byCircuit.get(r.circuitId) ?? [];
    list.push(r);
    byCircuit.set(r.circuitId, list);
  }

  const overallAvgPoints = avgRound(races.map((r) => playerPoints(r, playerId))) ?? 0;

  const eligible: CircuitSuitabilityEntry[] = [];
  for (const [circuitId, circuitRaces] of byCircuit) {
    if (circuitRaces.length < MIN_SAMPLE_SIZE) continue;
    const circuit = circuitsById.get(circuitId);
    if (!circuit) continue;
    eligible.push({
      circuit,
      races: circuitRaces.length,
      avgFinish: avgRound(circuitRaces.map((r) => playerFinish(r, playerId))),
      avgPoints: avgRound(circuitRaces.map((r) => playerPoints(r, playerId))),
    });
  }

  if (eligible.length === 0) {
    return { strong: [], weak: [], insufficientData: true };
  }

  const strong = eligible
    .filter((e) => (e.avgPoints ?? 0) > overallAvgPoints)
    .sort((a, b) => (b.avgPoints ?? 0) - (a.avgPoints ?? 0))
    .slice(0, 3);
  const weak = eligible
    .filter((e) => (e.avgPoints ?? 0) < overallAvgPoints)
    .sort((a, b) => (a.avgPoints ?? 0) - (b.avgPoints ?? 0))
    .slice(0, 3);

  return { strong, weak, insufficientData: false };
}

export function buildCharacterCircuitSuitability(
  seasons: SeasonStat[],
  playerId: PlayerId,
  characterId: string,
  circuits: Circuit[]
): CircuitSuitability {
  const races = seasons.flatMap((s) => s.races).filter((r) => playerCharacter(r, playerId) === characterId);
  return buildCircuitSuitabilityFor(races, playerId, circuits);
}

export function buildKartCircuitSuitability(
  seasons: SeasonStat[],
  playerId: PlayerId,
  kartId: string,
  circuits: Circuit[]
): CircuitSuitability {
  const races = seasons.flatMap((s) => s.races).filter((r) => playerKart(r, playerId) === kartId);
  return buildCircuitSuitabilityFor(races, playerId, circuits);
}

export function buildComboCircuitSuitability(
  seasons: SeasonStat[],
  playerId: PlayerId,
  characterId: string,
  kartId: string,
  circuits: Circuit[]
): CircuitSuitability {
  const races = seasons
    .flatMap((s) => s.races)
    .filter((r) => playerCharacter(r, playerId) === characterId && playerKart(r, playerId) === kartId);
  return buildCircuitSuitabilityFor(races, playerId, circuits);
}

export interface LoadoutCombo {
  character: string;
  characterName: string;
  kart: string;
  kartName: string;
  races: number;
}

/** Every character+kart combo this player has actually raced, most-used first — the candidate list for combo-level insights. */
export function getUsedCombos(seasons: SeasonStat[], playerId: PlayerId): LoadoutCombo[] {
  const byKey = new Map<string, { character: string; kart: string; races: number }>();
  for (const season of seasons) {
    for (const race of season.races) {
      const character = playerCharacter(race, playerId);
      const kart = playerKart(race, playerId);
      if (!character || !kart) continue;
      const key = `${character}::${kart}`;
      const existing = byKey.get(key);
      if (existing) existing.races += 1;
      else byKey.set(key, { character, kart, races: 1 });
    }
  }
  return [...byKey.values()]
    .map((c) => ({
      character: c.character,
      characterName: CHARACTERS_BY_ID.get(c.character)?.name ?? c.character,
      kart: c.kart,
      kartName: VEHICLES_BY_ID.get(c.kart)?.name ?? c.kart,
      races: c.races,
    }))
    .sort((a, b) => b.races - a.races);
}
