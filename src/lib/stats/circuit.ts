import type { Circuit, PlayerId } from "@/lib/types";
import type { CircuitStat, RaceStat, SeasonStat, TrackRanking } from "./types";
import { median, round } from "./math";

function allRacesAtCircuit(seasons: SeasonStat[], circuitId: string): RaceStat[] {
  return seasons.flatMap((s) => s.races.filter((r) => r.circuitId === circuitId));
}

/**
 * Swing probability for a player at a circuit: how often they out-finish
 * the other player here — races where their finishing position beats the
 * other's (a lower position number is better), divided by total races
 * raced at this circuit. This is a finishing-order stat, not a points
 * stat — see `medianPointSwing` on CircuitStat for the points half of the
 * picture (how big the typical swing is when it happens). Returns null
 * when the track has never been raced (avoids division by zero).
 *
 * `races` should already be filtered to races where the two positions
 * differ (see `calculateCircuitStats` below) — a race entered with adi
 * and ren both recorded at the same finishing position is a data-entry
 * error (impossible in an actual race), and counting it here would make
 * adiSwingProbability + renSwingProbability add up to less than 100%.
 * Entry now rejects that going forward (see war-mode/actions.ts and
 * battle-actions.ts), but this stays defensive against any such rows
 * already sitting in older data.
 */
export function calculateSwingProbability(races: RaceStat[], playerId: PlayerId): number | null {
  if (races.length === 0) return null;
  const aheadCount = races.filter((r) =>
    playerId === "adi" ? r.adiFinishingPosition < r.renFinishingPosition : r.renFinishingPosition < r.adiFinishingPosition
  ).length;
  return round((aheadCount / races.length) * 100, 1);
}

export function calculateCircuitStats(seasons: SeasonStat[], circuit: Circuit): CircuitStat {
  const races = allRacesAtCircuit(seasons, circuit.id);
  // A race can't legitimately end with adi and ren tied for the same
  // finishing position — every valid race has one clear "ahead" driver.
  // Excluding any such row here (rather than letting it silently count
  // toward `races.length` while contributing to neither player's "ahead"
  // count) is what guarantees the two swing probabilities below always
  // sum to exactly 100%, regardless of any bad legacy data.
  const decisiveRaces = races.filter((r) => r.adiFinishingPosition !== r.renFinishingPosition);

  const adiPositions = races.map((r) => r.adiFinishingPosition);
  const renPositions = races.map((r) => r.renFinishingPosition);
  const adiPoints = races.map((r) => r.adiPoints);
  const renPoints = races.map((r) => r.renPoints);

  const adiTotalPoints = adiPoints.reduce((a, b) => a + b, 0);
  const renTotalPoints = renPoints.reduce((a, b) => a + b, 0);

  // The typical point swing per race: NOT the gap between the two
  // players' median points (that compares two already-smoothed numbers
  // and can understate how much a single race actually swings by), but
  // the median of each individual race's own point difference — the
  // per-race margin, one figure per race, medianed across every time
  // this circuit has been raced.
  const pointDiffs = races.map((r) => Math.abs(r.adiPoints - r.renPoints));
  const medianPointDiff = median(pointDiffs);

  // adi's share is computed directly from the decisive races; ren's is
  // the exact complement (not a second independent count) so the two
  // can never drift apart and always sum to 100% when there's any
  // decisive history at all.
  const adiSwingProbability = calculateSwingProbability(decisiveRaces, "adi");
  const renSwingProbability = adiSwingProbability === null ? null : round(100 - adiSwingProbability, 1);

  return {
    circuit,
    appearances: races.length,
    adiTotalPoints,
    renTotalPoints,
    adiFirstPlaceFinishes: adiPositions.filter((p) => p === 1).length,
    renFirstPlaceFinishes: renPositions.filter((p) => p === 1).length,
    adiMedianFinishingPosition: median(adiPositions),
    renMedianFinishingPosition: median(renPositions),
    adiMedianPoints: median(adiPoints),
    renMedianPoints: median(renPoints),
    adiSwingProbability,
    renSwingProbability,
    medianPointSwing: medianPointDiff === null ? null : round(medianPointDiff, 1),
  };
}

export function calculateAllCircuitStats(seasons: SeasonStat[], circuits: Circuit[]): CircuitStat[] {
  return circuits.map((c) => calculateCircuitStats(seasons, c));
}

/**
 * Ranks tracks for a player by TOTAL historical points at that track.
 * When circuits have unequal appearance counts, `normalize: true` ranks
 * by average points per appearance instead — pass this explicitly for
 * "weakest tracks" once the dataset has uneven per-circuit appearances,
 * per spec section 15.
 */
function rankTracks(
  seasons: SeasonStat[],
  circuits: Circuit[],
  playerId: PlayerId,
  order: "desc" | "asc",
  normalize: boolean,
  limit: number
): TrackRanking[] {
  const rankings: TrackRanking[] = circuits
    .map((circuit) => {
      const races = allRacesAtCircuit(seasons, circuit.id);
      if (races.length === 0) return null;
      const totalPoints = races.reduce(
        (sum, r) => sum + (playerId === "adi" ? r.adiPoints : r.renPoints),
        0
      );
      return {
        circuit,
        totalPoints,
        appearances: races.length,
        averagePoints: round(totalPoints / races.length, 2),
      };
    })
    .filter((r): r is TrackRanking => r !== null);

  const sortKey = (r: TrackRanking) => (normalize ? r.averagePoints : r.totalPoints);
  rankings.sort((a, b) => (order === "desc" ? sortKey(b) - sortKey(a) : sortKey(a) - sortKey(b)));

  return rankings.slice(0, limit);
}

/** Top 3 tracks by total historical points earned. Auto-updates as seasons are added. */
export function calculateStrongestTracks(
  seasons: SeasonStat[],
  circuits: Circuit[],
  playerId: PlayerId,
  limit = 3,
  normalize = false
): TrackRanking[] {
  return rankTracks(seasons, circuits, playerId, "desc", normalize, limit);
}

/** Bottom 3 tracks by total (or normalized) historical points earned. */
export function calculateWeakestTracks(
  seasons: SeasonStat[],
  circuits: Circuit[],
  playerId: PlayerId,
  limit = 3,
  normalize = false
): TrackRanking[] {
  return rankTracks(seasons, circuits, playerId, "asc", normalize, limit);
}

/** Whether appearance counts vary enough across circuits that normalizing is recommended. */
export function appearancesAreUneven(seasons: SeasonStat[], circuits: Circuit[]): boolean {
  const counts = circuits
    .map((c) => allRacesAtCircuit(seasons, c.id).length)
    .filter((c) => c > 0);
  if (counts.length === 0) return false;
  return Math.max(...counts) !== Math.min(...counts);
}
