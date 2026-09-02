import Link from "next/link";
import { loadStatsModel } from "@/lib/services/stats-service";
import { calculateCareerPoints } from "@/lib/stats";
import { formatDate } from "@/lib/utils";
import { SectionHeading } from "@/components/ui/Card";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { PopIn } from "@/components/ui/PopIn";
import { ChevronRight } from "lucide-react";

export default async function SeasonRewindPage() {
  const model = await loadStatsModel();
  const adiCareer = calculateCareerPoints(model.seasons, "adi");
  const renCareer = calculateCareerPoints(model.seasons, "ren");
  const completed = [...model.seasons].filter((s) => s.isComplete).sort((a, b) => b.season.seasonNumber - a.season.seasonNumber);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
      <SectionHeading eyebrow="History" title="Season Rewind" />

      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="rounded-xl border border-adi-dim bg-surface p-5 text-center">
          <p className="text-stat text-3xl sm:text-4xl font-bold text-adi">
            <PopIn>{adiCareer.toLocaleString()}</PopIn>
          </p>
          <p className="text-xs text-text-faint uppercase tracking-wide mt-1">Adi &middot; Career Points</p>
        </div>
        <div className="rounded-xl border border-ren-dim bg-surface p-5 text-center">
          <p className="text-stat text-3xl sm:text-4xl font-bold text-ren">
            <PopIn>{renCareer.toLocaleString()}</PopIn>
          </p>
          <p className="text-xs text-text-faint uppercase tracking-wide mt-1">Ren &middot; Career Points</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-raised">
              <th className="px-4 py-3 text-left font-hud text-xs font-bold tracking-[0.15em] text-text-faint uppercase">Season</th>
              <th className="px-4 py-3 text-right font-hud text-xs font-bold tracking-[0.15em] text-adi uppercase">Adi</th>
              <th className="px-4 py-3 text-right font-hud text-xs font-bold tracking-[0.15em] text-ren uppercase">Ren</th>
              <th className="px-4 py-3 text-left font-hud text-xs font-bold tracking-[0.15em] text-text-faint uppercase hidden sm:table-cell">Date</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <StaggerIn as="tbody">
            {completed.map((s, i) => (
              <tr key={s.season.id} data-stagger-item className={"border-t border-border " + (i % 2 === 1 ? "bg-surface/50" : "")}>
                <td className="px-4 py-3">
                  <Link href={`/season-rewind/${s.season.seasonNumber}`} className="font-hud font-bold text-text hover:text-gold">
                    Season {s.season.seasonNumber}
                  </Link>
                </td>
                <td className={"px-4 py-3 text-right text-stat font-semibold " + (s.winner === "adi" ? "text-adi" : "text-text")}>
                  {s.adiFinalPoints}
                </td>
                <td className={"px-4 py-3 text-right text-stat font-semibold " + (s.winner === "ren" ? "text-ren" : "text-text")}>
                  {s.renFinalPoints}
                </td>
                <td className="px-4 py-3 text-text-faint hidden sm:table-cell">{formatDate(s.season.completionDate)}</td>
                <td className="px-2 py-3 text-right">
                  <Link href={`/season-rewind/${s.season.seasonNumber}`}>
                    <ChevronRight className="h-4 w-4 text-text-faint" />
                  </Link>
                </td>
              </tr>
            ))}
            {completed.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-faint">
                  No completed seasons yet.
                </td>
              </tr>
            )}
          </StaggerIn>
        </table>
      </div>
    </div>
  );
}
