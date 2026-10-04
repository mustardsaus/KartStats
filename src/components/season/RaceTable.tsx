"use client";

import { useState } from "react";
import type { CircuitRecord, RaceStat } from "@/lib/stats";
import type { PointsMapping } from "@/lib/types";
import { calculatePointsFromPosition } from "@/lib/stats/points";
import { cn } from "@/lib/utils";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { RaceTelemetryModal } from "./RaceTelemetryModal";
import { LineChart, Trophy } from "lucide-react";

/**
 * `showGuest`/`pointsMapping` are optional and only ever passed by the
 * season-rewind detail page for a season that had a third guest driver
 * (Prawns) — every other caller (WarModeClient's solo-mode log) omits them
 * and gets the original two-column layout unchanged. Guest points aren't
 * precomputed on RaceStat (that type stays Adi/Ren-only, like the rest of
 * the core stats layer), so they're derived here from the raw
 * guestFinishingPosition each RaceStat already carries (RaceStat extends
 * RawRace) via the same calculatePointsFromPosition lookup used everywhere
 * else — never folded into adiPoints/renPoints or the cumulative totals.
 *
 * A "View Graph" icon-button appears on any race that has lap-time data
 * (RaceStat extends RawRace, so the lap columns are already there) —
 * which in practice means an Immersive race; Manual/Battle races simply
 * never gate it on. "use client" only exists on this component for that
 * button's local open/close state — both callers (this Server Component
 * page and WarModeClient's Client Component parent) can render a Client
 * Component child with no other change needed on their end.
 */
export function RaceTable({
  races,
  showGuest = false,
  pointsMapping,
  circuitRecords,
}: {
  races: RaceStat[];
  showGuest?: boolean;
  pointsMapping?: PointsMapping;
  // Optional: when supplied, any race that currently holds its circuit's
  // Fastest Lap or Race Record (see buildCircuitRecords) gets a small
  // trophy badge next to the circuit name. Omitted by callers that don't
  // have it computed — same opt-in shape as showGuest/pointsMapping.
  circuitRecords?: Map<string, CircuitRecord> | null;
}) {
  const [openRaceId, setOpenRaceId] = useState<string | null>(null);
  const openRace = openRaceId ? races.find((r) => r.id === openRaceId) ?? null : null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="bg-surface-raised">
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase w-10">#</th>
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Race</th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">Adi Pos</th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">Adi Pts</th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">Ren Pos</th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">Ren Pts</th>
            {showGuest && (
              <>
                <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
                  Prawns Pos
                </th>
                <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
                  Prawns Pts
                </th>
              </>
            )}
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase w-10" />
          </tr>
        </thead>
        <StaggerIn as="tbody">
          {races.map((r, i) => {
            const hasTelemetry = r.adiLap1TimeMs != null || r.renLap1TimeMs != null;
            const record = circuitRecords?.get(r.circuitId) ?? null;
            const holdsLapRecord = record?.fastestLap?.raceNumber === r.raceNumber && record.fastestLap.seasonId === r.seasonId;
            const holdsRaceRecord = record?.raceRecord?.raceNumber === r.raceNumber && record.raceRecord.seasonId === r.seasonId;
            return (
              <tr key={r.id} data-stagger-item className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}>
                <td className="px-3 py-2 text-text-faint">{r.raceNumber}</td>
                <td className="px-3 py-2 text-text font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {r.circuit.name}
                    {(holdsLapRecord || holdsRaceRecord) && (
                      <Trophy
                        className="h-3.5 w-3.5 text-gold shrink-0"
                        aria-label={
                          holdsLapRecord && holdsRaceRecord
                            ? "Holds this circuit's Fastest Lap and Race Record"
                            : holdsLapRecord
                              ? "Holds this circuit's Fastest Lap record"
                              : "Holds this circuit's Race Record"
                        }
                      />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-stat text-text-dim">P{r.adiFinishingPosition}</td>
                <td className="px-3 py-2 text-right text-stat font-semibold text-adi">{r.adiPoints}</td>
                <td className="px-3 py-2 text-right text-stat text-text-dim">P{r.renFinishingPosition}</td>
                <td className="px-3 py-2 text-right text-stat font-semibold text-ren">{r.renPoints}</td>
                {showGuest && (
                  <>
                    <td className="px-3 py-2 text-right text-stat text-text-dim">
                      {r.guestFinishingPosition != null ? `P${r.guestFinishingPosition}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-stat font-semibold text-text-dim">
                      {r.guestFinishingPosition != null && pointsMapping
                        ? calculatePointsFromPosition(r.guestFinishingPosition, pointsMapping)
                        : "—"}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 text-right">
                  {hasTelemetry && (
                    <button
                      onClick={() => setOpenRaceId(r.id)}
                      aria-label={`View telemetry graph for Race ${r.raceNumber}`}
                      className="text-text-faint hover:text-text transition-colors"
                    >
                      <LineChart className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </StaggerIn>
      </table>

      {openRace && (
        <RaceTelemetryModal
          key={openRace.id}
          raceId={openRace.id}
          raceLabel={`Race ${openRace.raceNumber} — ${openRace.circuit.name}`}
          onClose={() => setOpenRaceId(null)}
        />
      )}
    </div>
  );
}
