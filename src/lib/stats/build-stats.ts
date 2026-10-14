import { CHARACTERS, CHARACTERS_BY_ID } from "@/lib/data/characters";
import { VEHICLES_BY_ID, getVehiclesForWeightClass } from "@/lib/data/karts";
import type { Circuit } from "@/lib/types";
import type { CircuitDemand } from "@/lib/data/circuit-demand";

/**
 * Playbook's build-stats engine: combine a character + kart into one set
 * of final stats, normalize those for the radar chart, and heuristically
 * rank circuits by how well a build's raw stats suit each track's
 * hand-authored demand profile (lib/data/circuit-demand.ts).
 *
 * This is the RESEARCH-BASED signal -- it works for every character/kart/
 * circuit combination immediately, including ones nobody has ever raced.
 * It is deliberately kept separate from, and never merged with, the
 * REAL-RESULTS signal already built in lib/stats/kart-kontrol.ts
 * (buildComboCircuitSuitability), which answers a different question --
 * "how has this player actually done with this exact loadout here" --
 * and only has an answer once that combo has MIN_SAMPLE_SIZE real races
 * at that circuit. The Playbook UI shows both, side by side, never
 * combined into a single score (see components/playbook/TrackFitPanel.tsx).
 */

export const BUILD_STAT_KEYS = ["speed", "weight", "acceleration", "handling", "drift", "offRoad", "miniTurbo"] as const;
export type BuildStatKey = (typeof BUILD_STAT_KEYS)[number];

export interface BuildStats {
  characterId: string;
  kartId: string;
  speed: number;
  weight: number;
  acceleration: number;
  handling: number;
  drift: number;
  offRoad: number;
  miniTurbo: number;
}

/**
 * MKWii combines a character's stat bonuses and a vehicle's base stats by
 * simple per-stat addition (community-documented -- see the doc comments
 * on CharacterInfo/VehicleInfo). Returns null for an unknown id, or for a
 * character/kart pairing that isn't actually legal in-game (wrong weight
 * class) -- callers should gate the kart picker with
 * getVehiclesForWeightClass beforehand so this should rarely hit the
 * illegal-pairing case in practice.
 */
export function combineBuildStats(characterId: string, kartId: string): BuildStats | null {
  const character = CHARACTERS_BY_ID.get(characterId);
  const vehicle = VEHICLES_BY_ID.get(kartId);
  if (!character || !vehicle || vehicle.weightClass !== character.weightClass) return null;
  return {
    characterId,
    kartId,
    speed: character.speed + vehicle.speed,
    weight: character.weight + vehicle.weight,
    acceleration: character.acceleration + vehicle.acceleration,
    handling: character.handling + vehicle.handling,
    drift: character.drift + vehicle.drift,
    offRoad: character.offRoad + vehicle.offRoad,
    miniTurbo: character.miniTurbo + vehicle.miniTurbo,
  };
}

/** Every legal character+kart combination's combined stats -- the population normalizeBuildStats scales against. */
const ALL_LEGAL_BUILDS: BuildStats[] = CHARACTERS.flatMap((character) =>
  getVehiclesForWeightClass(character.weightClass)
    .map((vehicle) => combineBuildStats(character.id, vehicle.id))
    .filter((b): b is BuildStats => b !== null)
);

const STAT_RANGE: Record<BuildStatKey, { min: number; max: number }> = (() => {
  const ranges = {} as Record<BuildStatKey, { min: number; max: number }>;
  for (const key of BUILD_STAT_KEYS) {
    const values = ALL_LEGAL_BUILDS.map((b) => b[key]);
    ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return ranges;
})();

/**
 * Every stat rescaled to 0-100 against the full range of every legal
 * character+kart combination in the game -- not against this one build's
 * own min/max -- so two different builds' radar charts stay visually
 * comparable (e.g. "80 Speed" means the same thing on every chart).
 */
export function normalizeBuildStats(build: BuildStats): Record<BuildStatKey, number> {
  const out = {} as Record<BuildStatKey, number>;
  for (const key of BUILD_STAT_KEYS) {
    const { min, max } = STAT_RANGE[key];
    out[key] = max === min ? 50 : Math.round(((build[key] - min) / (max - min)) * 100);
  }
  return out;
}

/**
 * A documented estimate, not a measurement: pairs each demand axis with
 * the build stat(s) that plausibly help against it --
 *   - off-road amount & turn tightness -> Off-Road + Handling (+ Mini-Turbo
 *     and Drift, since tight/off-road sections are where cutting a corner
 *     with a well-timed mini-turbo matters most)
 *   - straight length -> Speed, counterbalanced by Acceleration on tracks
 *     with SHORT straights (lots of corners to accelerate out of)
 * Higher is a better fit. The absolute number has no fixed scale and is
 * only meaningful for ranking circuits against each other for ONE build.
 */
export function scoreBuildForCircuit(build: BuildStats, demand: CircuitDemand): number {
  const n = normalizeBuildStats(build);
  const technicalDemand = demand.offRoadAmount + demand.turnTightness; // 2-10
  const speedDemand = demand.straightLength; // 1-5
  const accelDemand = 6 - demand.straightLength; // short straights reward acceleration more

  return (
    n.offRoad * technicalDemand +
    n.handling * technicalDemand +
    n.miniTurbo * demand.turnTightness +
    n.drift * demand.turnTightness +
    n.speed * speedDemand * 2 +
    n.acceleration * accelDemand * 2
  );
}

export interface CircuitFitEntry {
  circuit: Circuit;
  demand: CircuitDemand;
  score: number;
}

/** Every circuit this build has a demand entry for, ranked best-fit first. */
export function rankCircuitsForBuild(
  build: BuildStats,
  circuits: Circuit[],
  demandById: Map<string, CircuitDemand>
): CircuitFitEntry[] {
  return circuits
    .map((circuit) => {
      const demand = demandById.get(circuit.id);
      if (!demand) return null;
      return { circuit, demand, score: scoreBuildForCircuit(build, demand) };
    })
    .filter((e): e is CircuitFitEntry => e !== null)
    .sort((a, b) => b.score - a.score);
}

/** Convenience split of rankCircuitsForBuild's output into a top-N / bottom-N pair for display. */
export function bestAndWorstCircuitsForBuild(
  build: BuildStats,
  circuits: Circuit[],
  demandById: Map<string, CircuitDemand>,
  count = 3
): { best: CircuitFitEntry[]; worst: CircuitFitEntry[] } {
  const ranked = rankCircuitsForBuild(build, circuits, demandById);
  return {
    best: ranked.slice(0, count),
    worst: ranked.slice(-count).reverse(),
  };
}
