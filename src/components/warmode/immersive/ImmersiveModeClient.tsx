"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Circuit, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import type { StoredTelemetryEvent } from "@/lib/telemetry/events";
import { getImmersiveStateAction, abandonImmersiveSeasonAction } from "@/app/war-mode/immersive-actions";
import { useImmersiveRealtime } from "@/lib/hooks/useImmersiveRealtime";
import { buildRaceStats, calculateCircuitStats, calculateSeasonTotals, buildCircuitRecords, getCircuitRecord } from "@/lib/stats";
import { CircuitPreviewPanel } from "../CircuitPreviewPanel";
import { LiveLeaderboard } from "../LiveLeaderboard";
import { SeasonCompletionScreen } from "../SeasonCompletionScreen";
import { RaceResultPanel } from "./RaceResultPanel";
import { Loader2, Radio, Copy, Check } from "lucide-react";


/** Most recent position-update event for one player — events arrive in order, so the last match IS the latest. */
interface Props {
  initialSeason: RawSeason;
  initialRaces: RawRace[];
  initialLiveEvents: StoredTelemetryEvent[];
  circuits: Circuit[];
  pointsMapping: PointsMapping;
  historicalSeasons: RawSeason[];
  historicalRacesBySeasonId: Map<string, RawRace[]>;
}

/**
 * The Immersive live dashboard — rendered by war-mode/page.tsx whenever
 * the active season has mode "immersive" (any device landing on
 * /war-mode sees this exact same read-only view; see the module doc on
 * useImmersiveRealtime for why Dual Device needs nothing more than that
 * to "just work": unlike Battle Mode, nobody submits anything from their
 * own device in Immersive mode once setup is done, so there's no
 * per-device identity to establish here).
 *
 * The one simplification from the original spec, confirmed directly: no
 * live-updating position graph mid-race. Instead, `justFinishedRace`
 * shows a static, once-loaded result panel (graph + item feed) the
 * instant a race finalizes, and keeps showing it until the Dolphin
 * tracker's first event for the NEXT race arrives — "loads once the
 * tracker shifts to the next one," nothing incremental.
 */
export function ImmersiveModeClient({
  initialSeason,
  initialRaces,
  initialLiveEvents,
  circuits,
  pointsMapping,
  historicalSeasons,
  historicalRacesBySeasonId,
}: Props) {
  const [season, setSeason] = useState(initialSeason);
  const [races, setRaces] = useState(initialRaces);
  const [liveEvents, setLiveEvents] = useState(initialLiveEvents);
  const [abandonPending, startAbandon] = useTransition();
  const [abandonError, setAbandonError] = useState<string | null>(null);

  const circuitsById = useMemo(() => new Map(circuits.map((c) => [c.id, c])), [circuits]);

  const refetch = useCallback(() => {
    getImmersiveStateAction(season.id).then((state) => {
      if (state.season) setSeason(state.season);
      setRaces(state.races);
      setLiveEvents(state.liveEvents);
    });
  }, [season.id]);

  useImmersiveRealtime(season.id, refetch);

  // A gentle polling fallback so local/dev (no Supabase Realtime
  // configured) still sees updates — harmless once real Realtime is live
  // too, since refetch just re-reads current state either way.
  useEffect(() => {
    const interval = setInterval(refetch, 4000);
    return () => clearInterval(interval);
  }, [refetch]);

  const raceStats = useMemo(() => buildRaceStats(races, circuitsById, pointsMapping), [races, circuitsById, pointsMapping]);
  const { adiTotal, renTotal } = useMemo(() => calculateSeasonTotals(raceStats), [raceStats]);

  // Latest, not first: if the tracker restarted mid-race there can be several circuit-detected events and the newest one is the truth.
  const circuitEvent = [...liveEvents].reverse().find((e) => e.type === "circuit-detected");
  const currentCircuit =
    circuitEvent && circuitEvent.type === "circuit-detected" ? circuitsById.get(circuitEvent.circuitId) ?? null : null;

  // Nothing has arrived for the NEXT race yet -> still showing the
  // previous one's result. races.length === 0 means there's no "previous
  // race" at all (first race of the season still in progress).
  const justFinishedRace = liveEvents.length === 0 && races.length > 0 ? races[races.length - 1] : null;

  const circuitStat = useMemo(() => {
    if (!currentCircuit) return null;
    // Same inline SeasonStat-shape assembly Cockpit.tsx uses for Battle
    // Mode's identical circuit-history panel — every season including
    // this in-progress one, so the history reads the same way everywhere.
    const historical = historicalSeasons.map((s) => ({ season: s, races: historicalRacesBySeasonId.get(s.id) ?? [] }));
    const live = { season, races };
    const seasonStats = [...historical, live].map(({ season: s, races: r }) => {
      const stats = buildRaceStats(r, circuitsById, pointsMapping);
      const totals = calculateSeasonTotals(stats);
      return {
        season: s,
        races: stats,
        adiFinalPoints: totals.adiTotal,
        renFinalPoints: totals.renTotal,
        winner: null,
        winningMargin: 0,
        isComplete: s.isComplete,
        racesPlayed: stats.length,
      };
    });
    return calculateCircuitStats(seasonStats, currentCircuit);
  }, [currentCircuit, historicalSeasons, historicalRacesBySeasonId, season, races, circuitsById, pointsMapping]);

  // Circuit Records are the whole point of Immersive's lap-time data --
  // computed across every season (historical + this one in progress),
  // same reasoning as WarModeClient/Cockpit's identical blocks.
  const circuitRecord = useMemo(() => {
    if (!currentCircuit) return null;
    const historicalRaces = historicalSeasons.flatMap((s) => historicalRacesBySeasonId.get(s.id) ?? []);
    return getCircuitRecord(buildCircuitRecords([...historicalRaces, ...races]), currentCircuit.id);
  }, [currentCircuit, historicalSeasons, historicalRacesBySeasonId, races]);

  if (season.isComplete && season.winnerId) {
    return (
      <SeasonCompletionScreen
        seasonNumber={season.seasonNumber}
        winner={season.winnerId}
        adiPoints={season.adiFinalPoints ?? adiTotal}
        renPoints={season.renFinalPoints ?? renTotal}
      />
    );
  }

  const handleAbandon = () => {
    setAbandonError(null);
    startAbandon(async () => {
      const result = await abandonImmersiveSeasonAction(season.id);
      if ("error" in result && result.error) {
        setAbandonError(result.error);
      }
      // On success, revalidatePath swaps this whole component out server-side.
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase flex items-center gap-1.5">
            <Radio className="h-3 w-3 animate-pulse" /> Immersive &mdash; Season {season.seasonNumber}
          </p>
          <h1 className="font-display text-2xl text-text">
            Race {races.length + 1} of {RACES_PER_SEASON}
          </h1>
          <SeasonIdChip seasonId={season.id} />
        </div>
        <LiveLeaderboard adiPoints={adiTotal} renPoints={renTotal} />
      </div>

      {justFinishedRace ? (
        <RaceResultPanel
          key={justFinishedRace.id}
          race={justFinishedRace}
          circuitName={circuitsById.get(justFinishedRace.circuitId)?.name ?? "Unknown circuit"}
        />
      ) : currentCircuit ? (
        <div className="space-y-5">
          <CircuitPreviewPanel circuit={currentCircuit} stat={circuitStat} record={circuitRecord} raceNumber={races.length + 1} />
          <p className="text-center text-sm text-text-dim flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-danger" /> Race in progress &mdash; results, lap splits and the position graph appear when it ends.
          </p>
        </div>
      ) : (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 text-danger mx-auto mb-4 animate-spin" />
          <p className="text-text-dim text-sm">Waiting for Dolphin to detect the next race&hellip;</p>
        </div>
      )}

      {races.length === 0 && (
        <div className="mt-8 pt-6 border-t border-border text-center">
          <button
            onClick={handleAbandon}
            disabled={abandonPending}
            className="text-xs text-danger/80 hover:text-danger underline underline-offset-2 disabled:opacity-60"
          >
            {abandonPending ? "Cancelling…" : "Started this by mistake? Cancel season"}
          </button>
          {abandonError && <p className="text-xs text-danger mt-2">{abandonError}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The Dolphin tracker's --season-id flag needs this exact id -- there's
 * no other way to tell the Python bridge which season to post into, so
 * it has to be copyable from right here. Click-to-copy rather than a
 * plain text blob so it's usable on the TV-facing Same Device screen
 * too, not just when inspecting via devtools.
 */
function SeasonIdChip({ seasonId }: { seasonId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard
          ?.writeText(seasonId)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
      title="Copy for the Dolphin tracker's --season-id flag"
      className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-text-faint hover:text-text-dim transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span className="font-mono truncate max-w-[220px]">{seasonId}</span>
    </button>
  );
}
