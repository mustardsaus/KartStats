import type { CumulativeItemTotal } from "@/lib/stats/tomfoolery";
import { ITEMS_BY_ID } from "@/lib/data/items";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { cn } from "@/lib/utils";

/**
 * Tomfoolery Tales' one flat table (Season 20+) — every item either
 * player has ever received, summed across every race ever recorded, no
 * per-track or per-season split. Replaces TrackMayhemTable,
 * SeasonMayhemTable, and PowerupBreakdown, which broke the same
 * underlying race_powerups rows down three different ways; this is the
 * single cumulative view the simplified spec asks for instead.
 */
export function CumulativeTomfooleryTable({ rows }: { rows: CumulativeItemTotal[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-faint">No power-ups logged yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="bg-surface-raised">
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
              Item
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">
              Adi
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">
              Ren
            </th>
          </tr>
        </thead>
        <StaggerIn as="tbody">
          {rows.map((row, i) => {
            const adiAhead = row.adiCount > row.renCount;
            const renAhead = row.renCount > row.adiCount;
            return (
              <tr
                key={row.itemId}
                data-stagger-item
                className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <img src={`/items/${row.itemId}.png`} alt="" className="h-5 w-5 object-contain shrink-0" />
                    <span className="text-text font-medium truncate">{ITEMS_BY_ID[row.itemId].name}</span>
                  </div>
                </td>
                <td className={cn("px-3 py-2 text-right text-stat font-bold", adiAhead ? "text-adi" : "text-text-dim")}>
                  {row.adiCount}
                </td>
                <td className={cn("px-3 py-2 text-right text-stat font-bold", renAhead ? "text-ren" : "text-text-dim")}>
                  {row.renCount}
                </td>
              </tr>
            );
          })}
        </StaggerIn>
      </table>
    </div>
  );
}
