import { cn } from "@/lib/utils";
import { StaggerIn } from "@/components/ui/StaggerIn";

export interface CircuitSeasonRow {
  seasonNumber: number;
  /** Distinguishes a season with more than one race at this circuit (rare, but the data model allows it). */
  raceNumber?: number;
  adiFinishingPosition: number;
  adiPoints: number;
  renFinishingPosition: number;
  renPoints: number;
}

/**
 * Season-by-season history at a single circuit: how each player finished
 * here, season by season, rather than the all-time totals above. Most
 * recent season first, matching the rest of the app's history views.
 */
export function CircuitSeasonTable({ rows }: { rows: CircuitSeasonRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-faint">No seasons have raced this circuit yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="bg-surface-raised">
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
              Season
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">
              Adi Pos
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">
              Adi Pts
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">
              Ren Pos
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">
              Ren Pts
            </th>
          </tr>
        </thead>
        <StaggerIn as="tbody">
          {rows.map((r, i) => {
            const adiAhead = r.adiFinishingPosition < r.renFinishingPosition;
            const renAhead = r.renFinishingPosition < r.adiFinishingPosition;
            return (
              <tr key={`${r.seasonNumber}-${r.raceNumber ?? 0}`} data-stagger-item className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}>
                <td className="px-3 py-2 text-text font-medium">
                  Season {r.seasonNumber}
                  {r.raceNumber !== undefined && <span className="text-text-faint"> &middot; Race {r.raceNumber}</span>}
                </td>
                <td className={cn("px-3 py-2 text-right text-stat", adiAhead ? "font-bold text-adi" : "text-text-dim")}>
                  P{r.adiFinishingPosition}
                </td>
                <td className={cn("px-3 py-2 text-right text-stat font-semibold text-adi")}>{r.adiPoints}</td>
                <td className={cn("px-3 py-2 text-right text-stat", renAhead ? "font-bold text-ren" : "text-text-dim")}>
                  P{r.renFinishingPosition}
                </td>
                <td className={cn("px-3 py-2 text-right text-stat font-semibold text-ren")}>{r.renPoints}</td>
              </tr>
            );
          })}
        </StaggerIn>
      </table>
    </div>
  );
}
