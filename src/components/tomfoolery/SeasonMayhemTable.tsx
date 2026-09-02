import Link from "next/link";
import type { SeasonTomfoolery } from "@/lib/stats/tomfoolery";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { cn } from "@/lib/utils";

/**
 * Per-season breakdown — most recent Battle Mode season first, matching
 * Season Rewind's ordering. Only seasons that actually carry battle-mode
 * data show up (solo-mode-only seasons have nothing to report here).
 */
export function SeasonMayhemTable({ rows }: { rows: SeasonTomfoolery[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-faint">No Battle Mode seasons recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="bg-surface-raised">
            <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
              Season
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">
              Adi Shells
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">
              Ren Shells
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-adi uppercase">
              Adi Items
            </th>
            <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-ren uppercase">
              Ren Items
            </th>
          </tr>
        </thead>
        <StaggerIn as="tbody">
          {rows.map((row, i) => {
            const adiShellsAhead = row.totalBlueShells.adi > row.totalBlueShells.ren;
            const renShellsAhead = row.totalBlueShells.ren > row.totalBlueShells.adi;
            return (
              <tr
                key={row.seasonId}
                data-stagger-item
                className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}
              >
                <td className="px-3 py-2">
                  <Link href={`/season-rewind/${row.seasonNumber}`} className="font-hud font-bold text-text hover:text-gold">
                    Season {row.seasonNumber}
                  </Link>
                  <span className="text-text-faint text-[12px] ml-1.5">
                    &middot; {row.battleRacesRecorded} race{row.battleRacesRecorded === 1 ? "" : "s"}
                  </span>
                </td>
                <td className={cn("px-3 py-2 text-right text-stat", adiShellsAhead ? "font-bold text-adi" : "text-text-dim")}>
                  {row.totalBlueShells.adi}
                </td>
                <td className={cn("px-3 py-2 text-right text-stat", renShellsAhead ? "font-bold text-ren" : "text-text-dim")}>
                  {row.totalBlueShells.ren}
                </td>
                <td className="px-3 py-2 text-right text-stat font-semibold text-adi">{row.totalPowerupsLogged.adi}</td>
                <td className="px-3 py-2 text-right text-stat font-semibold text-ren">{row.totalPowerupsLogged.ren}</td>
              </tr>
            );
          })}
        </StaggerIn>
      </table>
    </div>
  );
}
