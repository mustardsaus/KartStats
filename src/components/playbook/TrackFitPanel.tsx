"use client";

import type { PlayerId } from "@/lib/types";
import type { CircuitFitEntry } from "@/lib/stats/build-stats";
import type { CircuitProfile } from "@/lib/stats/circuit-profile";
import type { CircuitSuitability } from "@/lib/stats/kart-kontrol";
import { cn } from "@/lib/utils";

/**
 * Two deliberately SEPARATE panels, never merged into one score:
 *   - "Estimated fit" from build-stats.ts' scoreBuildForCircuit -- a
 *     research-based heuristic, available for every build/circuit pair
 *     immediately, even a combo nobody has ever actually raced.
 *   - "Your results" from kart-kontrol.ts' buildComboCircuitSuitability
 *     (reused as-is, unmodified) -- real race outcomes, only available
 *     once a player has raced this exact character+kart combo
 *     MIN_SAMPLE_SIZE+ times at a circuit.
 * Showing them side by side rather than blended means a thin real sample
 * never silently overrides the estimate, and the estimate never gets
 * mistaken for a measurement.
 */
export function TrackFitPanel({
  best,
  worst,
  realSuitability,
  circuitProfiles,
  playerId,
  onSelectPlayer,
}: {
  best: CircuitFitEntry[];
  worst: CircuitFitEntry[];
  realSuitability: CircuitSuitability;
  /** Derived telemetry profile per circuit (lib/stats/circuit-profile.ts) -- only present once a circuit has enough recorded Immersive races. */
  circuitProfiles: Map<string, CircuitProfile>;
  playerId: PlayerId;
  onSelectPlayer: (id: PlayerId) => void;
}) {
  const accent = playerId === "adi" ? "adi" : "ren";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <p className="mb-3 font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase">
          Estimated track fit
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FitList title="Best for this build" entries={best} tone="good" circuitProfiles={circuitProfiles} />
          <FitList title="Struggles on" entries={worst} tone="bad" circuitProfiles={circuitProfiles} />
        </div>
        <p className="mt-3 text-[11px] text-text-faint">
          A research-based estimate from this build&apos;s raw stats vs. each circuit&apos;s layout — not measured
          from recorded races.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase">
            Your results with this build
          </p>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-raised p-0.5">
            {(["adi", "ren"] as const).map((id) => (
              <button
                key={id}
                onClick={() => onSelectPlayer(id)}
                className={cn(
                  "px-2.5 py-1 rounded-md font-hud text-[11px] font-bold tracking-wide uppercase transition-colors",
                  playerId === id
                    ? id === "adi"
                      ? "bg-adi text-bg"
                      : "bg-ren text-void"
                    : "text-text-dim hover:text-text"
                )}
              >
                {id === "adi" ? "Adi" : "Ren"}
              </button>
            ))}
          </div>
        </div>

        {realSuitability.insufficientData ? (
          <p className="text-sm text-text-faint">
            Not enough recorded races with this exact build yet — play it a few more times to see real results here.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SuitabilityList title="Strong circuits" entries={realSuitability.strong} tone="good" accent={accent} />
            <SuitabilityList title="Weak circuits" entries={realSuitability.weak} tone="bad" accent={accent} />
          </div>
        )}
      </div>
    </div>
  );
}

function FitList({
  title,
  entries,
  tone,
  circuitProfiles,
}: {
  title: string;
  entries: CircuitFitEntry[];
  tone: "good" | "bad";
  circuitProfiles: Map<string, CircuitProfile>;
}) {
  return (
    <div>
      <p className={cn("mb-1.5 text-xs font-semibold", tone === "good" ? "text-emerald" : "text-danger")}>{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-text-faint">—</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => {
            const profile = circuitProfiles.get(e.circuit.id);
            return (
              <li key={e.circuit.id} className="text-sm text-text">
                {e.circuit.name}
                {profile && (
                  <span className="ml-1.5 text-[11px] text-text-faint">
                    &middot; {Math.round(profile.lowSpeedFraction * 100)}% slow samples ({profile.raceCount}r)
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SuitabilityList({
  title,
  entries,
  tone,
  accent,
}: {
  title: string;
  entries: { circuit: { id: string; name: string }; races: number; avgPoints: number | null }[];
  tone: "good" | "bad";
  accent: "adi" | "ren";
}) {
  return (
    <div>
      <p className={cn("mb-1.5 text-xs font-semibold", tone === "good" ? "text-emerald" : "text-danger")}>{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-text-faint">—</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.circuit.id} className="flex items-center justify-between gap-2 text-sm text-text">
              <span>{e.circuit.name}</span>
              <span className={cn("text-xs font-hud font-bold", accent === "adi" ? "text-adi" : "text-ren")}>
                {e.avgPoints ?? "—"} pts &middot; {e.races}r
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
