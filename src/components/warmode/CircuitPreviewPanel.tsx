"use client";

import type { Circuit, PlayerId } from "@/lib/types";
import type { CircuitStat } from "@/lib/stats";
import { PLAYERS } from "@/lib/data/points-mapping";
import { ChevronLeft, Flag } from "lucide-react";

/**
 * Step 2 of the War Mode per-race flow: circuit picked, race hasn't
 * happened yet. Plain-text history for this matchup at this circuit — no
 * bars, no thumbnails, the track photo behind it is doing the visual work
 * already. "Record Results" is the explicit signal the race is over.
 *
 * `onBack`/`onRecordResults` are optional so Battle Mode's cockpit can
 * reuse this exact historic-stats block without the solo-mode navigation
 * that doesn't apply there (the track is already locked in by the admin,
 * and "record results" is its own separate "Race concluded?" affordance
 * elsewhere in the cockpit) — omit either and that button just doesn't
 * render, solo mode's own callers are unaffected either way.
 */
export function CircuitPreviewPanel({
  circuit,
  stat,
  raceNumber,
  onBack,
  onRecordResults,
}: {
  circuit: Circuit;
  stat: CircuitStat | null;
  raceNumber: number;
  onBack?: () => void;
  onRecordResults?: () => void;
}) {
  // Whoever is more likely to finish ahead here — the direction the swing
  // text below names — with the accompanying point swing describing how
  // much it typically matters when it goes that way. `hasSwingData` is
  // its own check (not just `dominant !== null`) so an exact tie in the
  // probabilities still renders a line — a dead-even matchup is real
  // information, not a reason to show nothing here.
  const hasSwingData = Boolean(stat && stat.adiSwingProbability !== null && stat.renSwingProbability !== null);
  const isTie = hasSwingData && stat!.adiSwingProbability === stat!.renSwingProbability;
  const dominant: PlayerId | null = hasSwingData && !isTie ? (stat!.adiSwingProbability! > stat!.renSwingProbability! ? "adi" : "ren") : null;
  const dominantProbability = dominant === "adi" ? stat?.adiSwingProbability ?? null : dominant === "ren" ? stat?.renSwingProbability ?? null : null;

  return (
    <div className="w-full max-w-md text-center">
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-paper/60 hover:text-paper/85 mb-5 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Change circuit
        </button>
      )}

      <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase flex items-center justify-center gap-2 mb-2">
        <Flag className="h-4 w-4" /> Race {raceNumber} of 32
      </p>
      <h3 className="font-display text-4xl sm:text-5xl text-paper tracking-wide mb-6 drop-shadow-lg">
        {circuit.name}
      </h3>

      <div className="rounded-xl bg-void/55 backdrop-blur-sm border border-paper/10 px-5 py-4 text-sm sm:text-base text-paper/90 leading-relaxed space-y-1 mb-8">
        {stat && stat.appearances > 0 ? (
          <>
            <p>
              <span className="text-adi-vivid font-semibold">{PLAYERS.adi.name}</span> has won{" "}
              <span className="text-stat font-bold">{stat.adiFirstPlaceFinishes}</span> here,{" "}
              <span className="text-ren-vivid font-semibold">{PLAYERS.ren.name}</span>{" "}
              <span className="text-stat font-bold">{stat.renFirstPlaceFinishes}</span>, across{" "}
              <span className="text-stat font-bold">{stat.appearances}</span> race{stat.appearances === 1 ? "" : "s"}.
            </p>
            {dominant && dominantProbability !== null && (
              <p>
                <span className={`text-stat font-bold ${dominant === "adi" ? "text-adi-vivid" : "text-ren-vivid"}`}>
                  {dominantProbability.toFixed(0)}%
                </span>{" "}
                chance of{stat.medianPointSwing !== null ? ` a ${stat.medianPointSwing}-point swing` : " a swing"} to{" "}
                <span className={`font-semibold ${dominant === "adi" ? "text-adi-vivid" : "text-ren-vivid"}`}>
                  {PLAYERS[dominant].name.toUpperCase()}
                </span>
                .
              </p>
            )}
            {isTie && (
              <p>
                Dead even here so far — <span className="text-stat font-bold">50%</span> either way.
              </p>
            )}
            <p className="text-paper/65">
              Median finish:{" "}
              <span className="text-stat font-semibold text-adi-vivid">P{stat.adiMedianFinishingPosition ?? "—"}</span>{" "}
              vs <span className="text-stat font-semibold text-ren-vivid">P{stat.renMedianFinishingPosition ?? "—"}</span>
            </p>
          </>
        ) : (
          <p className="text-paper/65">No history at this circuit yet — this will be the first recorded race here.</p>
        )}
      </div>

      {onRecordResults && (
        <>
          <button
            onClick={onRecordResults}
            className="rounded-xl bg-danger px-10 py-4 font-display text-lg tracking-widest text-paper hover:brightness-110 active:scale-[0.99] shadow-lg shadow-danger/40 transition-all"
          >
            RECORD RESULTS
          </button>
          <p className="text-[13px] text-paper/45 mt-3">Race the track first, then log what happened.</p>
        </>
      )}
    </div>
  );
}
