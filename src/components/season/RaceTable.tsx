import type { RaceStat } from "@/lib/stats";
import type { PointsMapping } from "@/lib/types";
import { calculatePointsFromPosition } from "@/lib/stats/points";
import { cn } from "@/lib/utils";
import { StaggerIn } from "@/components/ui/StaggerIn";

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
 */
export function RaceTable({
  races,
  showGuest = false,
  pointsMapping,
}: {
  races: RaceStat[];
  showGuest?: boolean;
  pointsMapping?: PointsMapping;
}) {
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
          </tr>
        </thead>
        <StaggerIn as="tbody">
          {races.map((r, i) => (
            <tr key={r.id} data-stagger-item className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}>
              <td className="px-3 py-2 text-text-faint">{r.raceNumber}</td>
              <td className="px-3 py-2 text-text font-medium">{r.circuit.name}</td>
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
            </tr>
          ))}
        </StaggerIn>
      </table>
    </div>
  );
}
