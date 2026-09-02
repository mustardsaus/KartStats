"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleRound, Circuit, DriverId, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { buildRaceStats, calculateSeasonTotals, calculateCircuitStats } from "@/lib/stats";
import { slideIn } from "@/lib/animation";
import { CircuitPreviewPanel } from "@/components/warmode/CircuitPreviewPanel";
import { BlueShellButton } from "./BlueShellButton";
import { BattlePositionForm } from "./BattlePositionForm";
import { EndBattleControl } from "./EndBattleControl";
import { ChevronRight } from "lucide-react";

interface CockpitProps {
  season: RawSeason;
  round: BattleRound;
  circuit: Circuit | undefined;
  myPlayerId: DriverId;
  races: RawRace[];
  historicalSeasons: RawSeason[];
  historicalRacesBySeasonId: Map<string, RawRace[]>;
  circuits: Circuit[];
  pointsMapping: PointsMapping;
  isAdmin: boolean;
  onChanged: () => void;
  onEnded: () => void;
}

/**
 * The real gameplay screen's content: current race + historic stats for
 * this circuit, the blue-shell button, and a "Race concluded?" button
 * that navigates to a dedicated full-screen position-entry screen
 * (BattlePositionForm) rather than expanding inline. The full-bleed
 * backdrop and the live leaderboard live one level up, in BattleScreen —
 * shared with the track-picker screen so they stay mounted (and the
 * leaderboard stays visibly put) across the switch between picking a
 * track and racing.
 *
 * The main-content <-> position-entry swap is a single ref'd container:
 * React just swaps its children on toggle (no remount needed for the
 * animation itself), and an anime.js slide plays on that container every
 * time showPositionEntry changes. Simpler than choreographing a
 * separate exit animation for the outgoing screen — it disappears
 * immediately and whatever replaces it slides/fades in.
 */
export function Cockpit({
  season,
  round,
  circuit,
  myPlayerId,
  races,
  historicalSeasons,
  historicalRacesBySeasonId,
  circuits,
  pointsMapping,
  isAdmin,
  onChanged,
  onEnded,
}: CockpitProps) {
  // showPositionEntry deliberately resets whenever a new round starts —
  // handled by the parent mounting this component with key={round.id}
  // (see BattleModeClient), rather than an effect that resets it here,
  // since "reset local state when a prop identifies a new thing" is
  // exactly what a key remount is for.
  const [showPositionEntry, setShowPositionEntry] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const circuitsById = useMemo(() => new Map(circuits.map((c) => [c.id, c])), [circuits]);

  useEffect(() => {
    slideIn(screenRef.current, showPositionEntry ? 28 : -28);
  }, [showPositionEntry]);

  // Same "every season, including the in-progress one" shape WarModeClient
  // builds for the solo-mode historic panel, so this circuit's history
  // reads identically in both modes.
  const circuitStat = useMemo(() => {
    if (!circuit) return null;
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
    return calculateCircuitStats(seasonStats, circuit);
  }, [circuit, historicalSeasons, historicalRacesBySeasonId, season, races, circuitsById, pointsMapping]);

  return (
    <div ref={screenRef}>
      {showPositionEntry ? (
        <BattlePositionForm
          seasonId={season.id}
          roundId={round.id}
          circuit={circuit}
          raceNumber={round.raceNumber}
          myPlayerId={myPlayerId}
          adiPosition={round.adiPosition}
          renPosition={round.renPosition}
          guestEnabled={round.guestEnabled}
          guestPosition={round.guestPosition}
          onBack={() => setShowPositionEntry(false)}
          onChanged={onChanged}
        />
      ) : (
        <div className="space-y-6">
          {/* CircuitPreviewPanel supplies its own "Race N of 32" + track-name
              header, so this is the only place that title renders. circuit
              should always resolve from round.circuitId — the fallback below
              is defensive, not an expected path. */}
          {circuit ? (
            <CircuitPreviewPanel circuit={circuit} stat={circuitStat} raceNumber={round.raceNumber} />
          ) : (
            <p className="text-center font-display text-2xl text-paper">Race {round.raceNumber} of 32</p>
          )}

          <BlueShellButton
            roundId={round.id}
            myPlayerId={myPlayerId}
            adiCount={round.adiBlueShellCount}
            renCount={round.renBlueShellCount}
            guestEnabled={round.guestEnabled}
            guestCount={round.guestBlueShellCount}
            onChanged={onChanged}
          />

          <button
            onClick={() => setShowPositionEntry(true)}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-hud font-semibold tracking-wide text-paper/75 hover:text-paper py-2 transition-colors"
          >
            Race concluded?
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="text-center pt-2">
            <EndBattleControl seasonId={season.id} raceCount={races.length} isAdmin={isAdmin} onEnded={onEnded} />
          </div>
        </div>
      )}
    </div>
  );
}
