import type { CircuitTomfoolery, ItemTotal } from "@/lib/stats/tomfoolery";
import { ITEMS_BY_ID } from "@/lib/data/items";
import { CircuitImage } from "@/components/circuits/CircuitImage";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { cn } from "@/lib/utils";

/**
 * Per-circuit breakdown — which tracks see the most blue shells and
 * power-up chaos, most mayhem-heavy first. Only lists circuits that have
 * actually been played in Battle Mode (buildTomfooleryStats already
 * filters that), mirroring how CircuitSeasonTable only shows seasons a
 * circuit's actually seen.
 */
export function TrackMayhemTable({ rows }: { rows: CircuitTomfoolery[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-faint">No Battle Mode races recorded at any circuit yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="bg-surface-raised">
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
              Track
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">
              Adi Shells
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">
              Ren Shells
            </th>
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase hidden sm:table-cell">
              Adi&rsquo;s Pick
            </th>
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase hidden sm:table-cell">
              Ren&rsquo;s Pick
            </th>
          </tr>
        </thead>
        <StaggerIn as="tbody">
          {rows.map((row, i) => {
            const adiAhead = row.totalBlueShells.adi > row.totalBlueShells.ren;
            const renAhead = row.totalBlueShells.ren > row.totalBlueShells.adi;
            return (
              <tr
                key={row.circuit.id}
                data-stagger-item
                className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-11 rounded overflow-hidden shrink-0">
                      <CircuitImage circuit={row.circuit} workingLongEdge={160} />
                    </div>
                    <span className="text-text font-medium truncate">{row.circuit.name}</span>
                  </div>
                </td>
                <td className={cn("px-3 py-2 text-right text-stat", adiAhead ? "font-bold text-adi" : "text-text-dim")}>
                  {row.totalBlueShells.adi}
                </td>
                <td className={cn("px-3 py-2 text-right text-stat", renAhead ? "font-bold text-ren" : "text-text-dim")}>
                  {row.totalBlueShells.ren}
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <FavoriteCell favorite={row.favoriteItem.adi} />
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <FavoriteCell favorite={row.favoriteItem.ren} />
                </td>
              </tr>
            );
          })}
        </StaggerIn>
      </table>
    </div>
  );
}

function FavoriteCell({ favorite }: { favorite: ItemTotal | null }) {
  if (!favorite) return <span className="text-text-faint">—</span>;
  return (
    <div className="flex items-center gap-1.5 text-text-dim">
      <img src={`/items/${favorite.itemId}.png`} alt="" className="h-4 w-4 object-contain shrink-0" />
      <span className="truncate">{ITEMS_BY_ID[favorite.itemId].name}</span>
    </div>
  );
}
