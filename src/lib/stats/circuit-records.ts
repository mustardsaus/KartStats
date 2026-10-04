import type { PlayerId, RawRace } from "@/lib/types";

/**
 * Circuit Records: the best-ever single lap and the best-ever full race
 * time at a circuit, tracked completely independently of one another
 * (spec section 11 -- a Race Record is NOT "sum of the three fastest
 * laps ever", and holding the Race Record does not imply holding the
 * Fastest Lap, or vice versa). Only Immersive races carry lap-time data
 * -- Manual and Battle Mode races have none of the eight lap-time
 * columns on RawRace populated -- so these only ever surface from
 * Immersive races. That's intended, not a gap (see RawRace in
 * lib/types.ts).
 *
 * Derived on read from RawRace rows, same as every other stat in this
 * codebase (points, season totals, circuit stats) -- never stored as
 * its own cached truth. Lap 0 is dropped at telemetry ingestion (see
 * dropLapZeroEvents in lib/telemetry/events.ts) long before a race ever
 * becomes a RawRace row, so there is nothing to filter here -- lap1/2/3
 * on a RawRace are always real laps.
 */

export interface FastestLapRecord {
  playerId: PlayerId;
  lap: 1 | 2 | 3;
  lapTimeMs: number;
  raceNumber: number;
  seasonId: string;
}

export interface RaceTimeRecord {
  playerId: PlayerId;
  finalTimeMs: number;
  raceNumber: number;
  seasonId: string;
}

export interface CircuitRecord {
  circuitId: string;
  fastestLap: FastestLapRecord | null;
  raceRecord: RaceTimeRecord | null;
}

const PLAYER_IDS: PlayerId[] = ["adi", "ren"];
const LAPS = [1, 2, 3] as const;

function lapTimeMs(race: RawRace, playerId: PlayerId, lap: 1 | 2 | 3): number | null | undefined {
  const key = `${playerId}Lap${lap}TimeMs` as keyof RawRace;
  return race[key] as number | null | undefined;
}

function finalTimeMs(race: RawRace, playerId: PlayerId): number | null | undefined {
  const key = `${playerId}FinalTimeMs` as keyof RawRace;
  return race[key] as number | null | undefined;
}

function considerLap(current: FastestLapRecord | null, candidate: FastestLapRecord): FastestLapRecord {
  return !current || candidate.lapTimeMs < current.lapTimeMs ? candidate : current;
}

function considerRaceTime(current: RaceTimeRecord | null, candidate: RaceTimeRecord): RaceTimeRecord {
  return !current || candidate.finalTimeMs < current.finalTimeMs ? candidate : current;
}

/**
 * Builds the Fastest Lap + Race Record for every circuit that appears in
 * `races`, scanning the optional lap-time columns Immersive races
 * populate. Call once per stats build (same pattern as
 * calculateAllCircuitStats in lib/stats/circuit.ts) and look up by
 * circuit id with getCircuitRecord.
 */
export function buildCircuitRecords(races: RawRace[]): Map<string, CircuitRecord> {
  const records = new Map<string, CircuitRecord>();

  for (const race of races) {
    let entry = records.get(race.circuitId);
    if (!entry) {
      entry = { circuitId: race.circuitId, fastestLap: null, raceRecord: null };
      records.set(race.circuitId, entry);
    }

    for (const playerId of PLAYER_IDS) {
      for (const lap of LAPS) {
        const ms = lapTimeMs(race, playerId, lap);
        if (ms == null) continue;
        entry.fastestLap = considerLap(entry.fastestLap, {
          playerId,
          lap,
          lapTimeMs: ms,
          raceNumber: race.raceNumber,
          seasonId: race.seasonId,
        });
      }

      const finalMs = finalTimeMs(race, playerId);
      if (finalMs == null) continue;
      entry.raceRecord = considerRaceTime(entry.raceRecord, {
        playerId,
        finalTimeMs: finalMs,
        raceNumber: race.raceNumber,
        seasonId: race.seasonId,
      });
    }
  }

  return records;
}

/** Convenience lookup for a single circuit -- null if it has never been raced with lap-time data. */
export function getCircuitRecord(records: Map<string, CircuitRecord>, circuitId: string): CircuitRecord | null {
  return records.get(circuitId) ?? null;
}
