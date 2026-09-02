import type { PlayerId, RawRace, RawSeason, Circuit } from "@/lib/types";

/** A race enriched with derived points + cumulative totals. What the UI consumes. */
export interface RaceStat extends RawRace {
  circuit: Circuit;
  adiPoints: number;
  renPoints: number;
  adiCumulativePoints: number; // cumulative WITHIN the season, through this race
  renCumulativePoints: number;
  leader: PlayerId | "tie";
}

export interface SeasonStat {
  season: RawSeason;
  races: RaceStat[];
  adiFinalPoints: number;
  renFinalPoints: number;
  winner: PlayerId | "tie" | null; // null only if season incomplete
  winningMargin: number;
  isComplete: boolean;
  racesPlayed: number;
}

export interface CircuitStat {
  circuit: Circuit;
  appearances: number;
  adiTotalPoints: number;
  renTotalPoints: number;
  adiFirstPlaceFinishes: number;
  renFirstPlaceFinishes: number;
  adiMedianFinishingPosition: number | null;
  renMedianFinishingPosition: number | null;
  adiMedianPoints: number | null;
  renMedianPoints: number | null;
  /** % of races here this player finished ahead of the other (lower position wins). 0..100, null if no races here. */
  adiSwingProbability: number | null;
  renSwingProbability: number | null;
  /** Median, across every race at this track, of that race's own |adiPoints - renPoints| — the typical single-race point swing. Not the gap between the two players' median points (a different, smoothed-over number); null if the track has never been raced. */
  medianPointSwing: number | null;
}

export interface PlayerCareerStat {
  playerId: PlayerId;
  careerPoints: number;
  championships: number;
  ties: number;
  raceWins: number;
  podiums: number;
  medianFinishingPosition: number | null;
  medianSeasonPoints: number | null;
  averageFinishingPosition: number | null;
  averagePointsPerRace: number | null;
  bestSeason: SeasonStat | null;
  highestSeasonPoints: number | null;
  strongestCircuit: CircuitStat | null;
  weakestCircuit: CircuitStat | null;
  headToHeadWinPercentage: number | null; // championships won vs completed seasons
  racesPlayed: number;
}

export interface TrackRanking {
  circuit: Circuit;
  totalPoints: number;
  appearances: number;
  averagePoints: number;
}

export interface ChampionInfo {
  playerId: PlayerId;
  points: number;
  seasonNumber: number;
  completionDate: string;
}

export interface AllTimeRecordInfo {
  playerId: PlayerId;
  points: number;
  seasonNumber: number;
  completionDate: string;
}
