import type { RawRace, RaceSpeedSample } from "@/lib/types";
import { MIN_SAMPLE_SIZE } from "./kart-kontrol";

/**
 * The REAL-TELEMETRY counterpart to lib/data/circuit-demand.ts's hand-
 * authored baseline -- derived on read from recorded Immersive War Mode
 * races (race_speed_samples, joined to a circuit via RawRace.circuitId),
 * never stored, same "derive on read" convention as every other stat in
 * this codebase (points, Circuit Records, Kart Kontrol's suitability
 * engine).
 *
 * This only ever produces a result once a circuit has at least
 * MIN_SAMPLE_SIZE recorded races (the same confidence threshold
 * lib/stats/kart-kontrol.ts already established) -- below that, callers
 * keep showing the hand-authored CircuitDemand alone, never a profile
 * built from one or two noisy races. When it IS available, Playbook shows
 * it labeled "from N recorded races" ALONGSIDE the hand-authored numbers,
 * not blended into them -- a thin real sample should never silently
 * override a researched baseline.
 *
 * lowSpeedFraction is the proxy for "how tight/off-road-heavy does this
 * track actually play": the share of speed samples sitting well below the
 * circuit's own observed peak, which is what a driver's speed does
 * through a tight corner or a slow off-road patch, regardless of what any
 * one build's raw stats are.
 */

const LOW_SPEED_THRESHOLD_FRACTION = 0.6; // below 60% of this circuit's observed peak counts as "slow"

export interface CircuitProfile {
  circuitId: string;
  raceCount: number;
  sampleCount: number;
  avgSpeedKph: number;
  peakSpeedKph: number;
  speedStdDevKph: number;
  /** Share (0-1) of speed samples below LOW_SPEED_THRESHOLD_FRACTION of this circuit's own peak. */
  lowSpeedFraction: number;
}

export function buildCircuitProfile(
  circuitId: string,
  races: RawRace[],
  speedSamples: RaceSpeedSample[]
): CircuitProfile | null {
  const raceIdsAtCircuit = new Set(races.filter((r) => r.circuitId === circuitId).map((r) => r.id));
  if (raceIdsAtCircuit.size < MIN_SAMPLE_SIZE) return null;

  const samples = speedSamples.filter((s) => raceIdsAtCircuit.has(s.raceId));
  if (samples.length === 0) return null;

  const speeds = samples.map((s) => s.speed);
  const peakSpeedKph = Math.max(...speeds);
  const avgSpeedKph = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
  const variance = speeds.reduce((sum, v) => sum + (v - avgSpeedKph) ** 2, 0) / speeds.length;
  const speedStdDevKph = Math.sqrt(variance);
  const lowSpeedCutoff = peakSpeedKph * LOW_SPEED_THRESHOLD_FRACTION;
  const lowSpeedFraction = speeds.filter((v) => v < lowSpeedCutoff).length / speeds.length;

  return {
    circuitId,
    raceCount: raceIdsAtCircuit.size,
    sampleCount: samples.length,
    avgSpeedKph: Math.round(avgSpeedKph * 10) / 10,
    peakSpeedKph: Math.round(peakSpeedKph * 10) / 10,
    speedStdDevKph: Math.round(speedStdDevKph * 10) / 10,
    lowSpeedFraction: Math.round(lowSpeedFraction * 100) / 100,
  };
}
