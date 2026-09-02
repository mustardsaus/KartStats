import { cn } from "@/lib/utils";
import { StaggerIn } from "@/components/ui/StaggerIn";

export interface CompareRow {
  label: string;
  adi: React.ReactNode;
  ren: React.ReactNode;
  /** which side "wins" this row, for a subtle highlight — optional */
  winner?: "adi" | "ren" | "tie" | null;
}

/**
 * The strong Adi-vs-Ren comparison table reused across Circuit Detail,
 * Head-to-Head, and Player Stats. One place for the visual language of
 * "rivalry stat table" so it never has to be rebuilt per page.
 */
export function CompareTable({ rows }: { rows: CompareRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-raised">
            <th className="px-4 py-3 text-left font-hud text-xs font-bold tracking-[0.15em] text-adi uppercase">
              Adi
            </th>
            <th className="px-4 py-3 text-center font-hud text-xs font-bold tracking-[0.15em] text-text-faint uppercase">
              Statistic
            </th>
            <th className="px-4 py-3 text-right font-hud text-xs font-bold tracking-[0.15em] text-ren uppercase">
              Ren
            </th>
          </tr>
        </thead>
        <StaggerIn as="tbody">
          {rows.map((row, i) => (
            <tr key={i} data-stagger-item className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}>
              {/* text-stat, not font-display: the display font (Mario Kart
                  F2 in Dark Mode) has generous per-glyph side-bearings
                  meant for spaced-out titles, which reads as broken,
                  gappy kerning on tight multi-digit numbers. text-stat is
                  the numeral-safe family already used everywhere else
                  points are shown (TrophyCard, StatFax). */}
              <td
                className={cn(
                  "px-4 py-3.5 text-left text-stat text-lg sm:text-xl font-bold",
                  row.winner === "adi" ? "text-adi" : "text-text"
                )}
              >
                {row.adi}
              </td>
              <td className="px-4 py-3 text-center text-text-dim">{row.label}</td>
              <td
                className={cn(
                  "px-4 py-3.5 text-right text-stat text-lg sm:text-xl font-bold",
                  row.winner === "ren" ? "text-ren" : "text-text"
                )}
              >
                {row.ren}
              </td>
            </tr>
          ))}
        </StaggerIn>
      </table>
    </div>
  );
}
