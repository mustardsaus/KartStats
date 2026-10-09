"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Circuit, PlayerId, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import type { StoredTelemetryEvent } from "@/lib/telemetry/events";
import { getImmersiveStateAction, abandonImmersiveSeasonAction, endImmersiveSeasonEarlyAction } from "@/app/war-mode/immersive-actions";
import { useImmersiveRealtime } from "@/lib/hooks/useImmersiveRealtime";
import { buildRaceStats, calculateCircuitStats, calculateSeasonTotals, buildCircuitRecords, getCircuitRecord } from "@/lib/stats";
import { CircuitPreviewPanel } from "../CircuitPreviewPanel";
import { SeasonCompletionScreen } from "../SeasonCompletionScreen";
import { BattleScreen } from "../battle/BattleScreen";
import { CharacterIcon } from "../battle/CharacterIcon";
import { VehicleIcon } from "../battle/VehicleIcon";
import { CHARACTERS_BY_ID } from "@/lib/data/characters";
import { VEHICLES_BY_ID } from "@/lib/data/karts";
import { PLAYERS } from "@/lib/data/points-mapping";
import { RaceResultPanel } from "./RaceResultPanel";
import { cn } from "@/lib/utils";
import { Loader2, Radio, Copy, Check, Terminal } from "lucide-react";

/** One player's season-long loadout, resolved from either the locked-in season fields or a live detection event. */
interface ResolvedLoadout {
  characterId: string;
  kartId: string;
}

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
 *
 * Shares the exact same full-bleed track-photo backdrop + persistent
 * leaderboard component Battle Mode's live screen uses (BattleScreen) --
 * this is "pull up the background image for the detected track, like
 * Manual does" applied here too, not a separate implementation.
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

  // While justFinishedRace is showing, this is still "Race N" (N = the
  // race whose results are on screen) -- it only ticks ahead to N+1 once
  // the next race's own data (currentCircuit) has actually shown up, not
  // the instant races.length increments (which happens the moment the
  // PREVIOUS race finalizes, well before anything about the next one is
  // known). Avoids the header reading "Race 2 of 32" while the screen is
  // still showing Race 1's results and Race 2 hasn't loaded yet.
  const displayedRaceNumber = justFinishedRace ? justFinishedRace.raceNumber : races.length + 1;

  // The track photo behind everything: the one just detected for the
  // race in progress, or (once it's over, while the result panel is
  // showing) the one the just-finished race was run on. Falls back to
  // the generic war-mode backdrop inside BattleScreen when neither is
  // known yet (e.g. still waiting on the very first circuit-detected event).
  const backdropCircuit = currentCircuit ?? (justFinishedRace ? circuitsById.get(justFinishedRace.circuitId) ?? undefined : undefined);

  // Each player's season-long loadout: prefer the locked-in season
  // columns (set once finalize.ts sees race 1 complete, from race 2
  // onward this is always available immediately) and fall back to
  // scanning the live events for race 1 itself, before that lock-in has
  // happened yet -- same "detect once, never re-detect" rule the bridge
  // and finalize.ts already apply, just read from whichever source has
  // it right now.
  const adiLoadout = useMemo<ResolvedLoadout | null>(() => resolveLoadout(season.adiCharacter, season.adiKart, liveEvents, "adi"), [
    season.adiCharacter,
    season.adiKart,
    liveEvents,
  ]);
  const renLoadout = useMemo<ResolvedLoadout | null>(() => resolveLoadout(season.renCharacter, season.renKart, liveEvents, "ren"), [
    season.renCharacter,
    season.renKart,
    liveEvents,
  ]);

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

  // Same transition/error state as Cancel above -- the two buttons are
  // mutually exclusive (races.length === 0 vs > 0), never shown together.
  const handleEndEarly = () => {
    setAbandonError(null);
    startAbandon(async () => {
      const result = await endImmersiveSeasonEarlyAction(season.id);
      if ("error" in result && result.error) {
        setAbandonError(result.error);
      }
      // On success, revalidatePath swaps this whole component out for the season-completion screen.
    });
  };

  return (
    <BattleScreen circuit={backdropCircuit} adiPoints={adiTotal} renPoints={renTotal}>
      <div className="text-center">
        <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase flex items-center justify-center gap-1.5">
          <Radio className="h-3 w-3 animate-pulse" /> Immersive &mdash; Season {season.seasonNumber}
        </p>
        <h1 className="font-display text-2xl text-paper drop-shadow-lg">
          Race {displayedRaceNumber} of {RACES_PER_SEASON}
        </h1>
        <SeasonIdChip seasonId={season.id} />
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
          <LoadoutStrip adiLoadout={adiLoadout} renLoadout={renLoadout} />
          <p className="text-center text-sm text-paper/75 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-danger" /> Race in progress &mdash; results, lap splits and the position graph appear when it ends.
          </p>
        </div>
      ) : (
        <div className="text-center py-20">
          <Loader2 className="h-8 w-8 text-danger mx-auto mb-4 animate-spin" />
          <p className="text-paper/75 text-sm">Waiting for Dolphin to detect the next race&hellip;</p>
          <a
            href="kartstats-tracker://start"
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-paper/20 bg-paper/5 px-4 py-2 text-xs text-paper/75 hover:bg-paper/10 hover:text-paper transition-colors"
          >
            <Terminal className="h-3.5 w-3.5" /> Start Tracker
          </a>
          <p className="mt-2 text-[11px] text-paper/40">
            Opens a Terminal on your Mac and runs the tracker. One-time setup: open &ldquo;KartStats Tracker Launcher&rdquo; from Applications once.
          </p>
        </div>
      )}

      <div className="pt-6 border-t border-paper/15 text-center">
        {races.length === 0 ? (
          <button
            onClick={handleAbandon}
            disabled={abandonPending}
            className="text-xs text-paper/50 hover:text-danger underline underline-offset-2 disabled:opacity-60 transition-colors"
          >
            {abandonPending ? "Cancelling…" : "Started this by mistake? Cancel season"}
          </button>
        ) : (
          <button
            onClick={handleEndEarly}
            disabled={abandonPending}
            className="text-xs text-paper/50 hover:text-danger underline underline-offset-2 disabled:opacity-60 transition-colors"
          >
            {abandonPending ? "Ending…" : `End season now (${races.length} race${races.length === 1 ? "" : "s"} recorded)`}
          </button>
        )}
        {abandonError && <p className="text-xs text-danger mt-2">{abandonError}</p>}
      </div>
    </BattleScreen>
  );
}

/**
 * Resolves one player's season loadout: the locked-in season columns win
 * once they exist (every race from the 2nd onward, set by finalize.ts the
 * instant race 1 finalizes), otherwise falls back to that player's most
 * recent "loadout-detected" live event -- the only way to show anything
 * during race 1 itself, before there's a finalized race to lock it in from.
 */
function resolveLoadout(
  lockedCharacter: string | null | undefined,
  lockedKart: string | null | undefined,
  liveEvents: StoredTelemetryEvent[],
  playerId: PlayerId
): ResolvedLoadout | null {
  if (lockedCharacter && lockedKart) return { characterId: lockedCharacter, kartId: lockedKart };
  const event = [...liveEvents].reverse().find((e) => e.type === "loadout-detected" && e.playerId === playerId);
  if (event && event.type === "loadout-detected") return { characterId: event.characterId, kartId: event.kartId };
  return null;
}

/**
 * Both players' detected character + kart, shown directly below the
 * track name while a race is in progress -- real portrait/vehicle art via
 * CharacterIcon/VehicleIcon, not just ids. Renders a "Detecting…" card in
 * place of either side that hasn't come in yet (a brief window early in
 * race 1, before the tracker's first loadout-detected event for that
 * player arrives) rather than hiding the whole strip.
 */
function LoadoutStrip({ adiLoadout, renLoadout }: { adiLoadout: ResolvedLoadout | null; renLoadout: ResolvedLoadout | null }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <LoadoutCard playerId="adi" loadout={adiLoadout} />
      <LoadoutCard playerId="ren" loadout={renLoadout} />
    </div>
  );
}

function LoadoutCard({ playerId, loadout }: { playerId: PlayerId; loadout: ResolvedLoadout | null }) {
  return (
    <div className="rounded-xl bg-void/55 backdrop-blur-sm border border-paper/10 px-4 py-3 text-center">
      <p
        className={cn(
          "font-hud text-[11px] font-bold tracking-[0.2em] uppercase mb-1.5",
          playerId === "adi" ? "text-adi-vivid" : "text-ren-vivid"
        )}
      >
        {PLAYERS[playerId].name}
      </p>
      {loadout ? (
        <>
          <div className="flex items-center justify-center -space-x-1.5 mb-1.5">
            <CharacterIcon characterId={loadout.characterId} accent={playerId} size="md" className="ring-2 ring-void/40" />
            <VehicleIcon vehicleId={loadout.kartId} accent={playerId} size="md" className="ring-2 ring-void/40" />
          </div>
          <p className="text-xs text-paper/95 font-medium">
            {CHARACTERS_BY_ID.get(loadout.characterId)?.name ?? loadout.characterId} &middot;{" "}
            {VEHICLES_BY_ID.get(loadout.kartId)?.name ?? loadout.kartId}
          </p>
        </>
      ) : (
        <p className="text-xs text-paper/50 py-3.5">Detecting&hellip;</p>
      )}
    </div>
  );
}

/**
 * Mostly a debugging aid now that the tracker auto-discovers the waiting
 * season on its own (see kartstats_bridge.discover_season_id) -- useful
 * for confirming which season is actually live, or for the --season-id
 * override flag on the rare occasion discovery picks the wrong one.
 * Click-to-copy rather than a plain text blob so it's usable on the
 * TV-facing Same Device screen too, not just when inspecting via devtools.
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
      className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-paper/50 hover:text-paper/80 transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span className="font-mono truncate max-w-[220px]">{seasonId}</span>
    </button>
  );
}
