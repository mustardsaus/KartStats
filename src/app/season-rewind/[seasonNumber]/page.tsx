import Link from "next/link";
import { notFound } from "next/navigation";
import { loadStatsModel } from "@/lib/services/stats-service";
import { getStore } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { SeasonChart } from "@/components/season/SeasonChart";
import { RaceTable } from "@/components/season/RaceTable";
import { PopIn } from "@/components/ui/PopIn";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default async function SeasonDetailPage({ params }: PageProps<"/season-rewind/[seasonNumber]">) {
  const { seasonNumber: seasonNumberParam } = await params;
  const seasonNumber = Number(seasonNumberParam);
  const [model, pointsMapping] = await Promise.all([loadStatsModel(), getStore().getPointsMapping()]);
  const season = model.seasons.find((s) => s.season.seasonNumber === seasonNumber);
  if (!season) notFound();

  const winnerLabel = season.winner === "adi" ? "ADI WINS" : season.winner === "ren" ? "REN WINS" : "SEASON TIED";
  const winnerColor = season.winner === "adi" ? "text-adi" : season.winner === "ren" ? "text-ren" : "text-gold";

  const prevSeason = model.seasons.find((s) => s.season.seasonNumber === seasonNumber - 1 && s.isComplete);
  const nextSeason = model.seasons.find((s) => s.season.seasonNumber === seasonNumber + 1 && s.isComplete);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-14">
      <Link href="/season-rewind" className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text mb-6">
        <ChevronLeft className="h-3.5 w-3.5" /> Season Rewind
      </Link>

      <div className="text-center mb-10 rounded-2xl border border-border bg-surface speed-lines py-10 px-4">
        <p className="font-hud text-xs font-bold tracking-[0.3em] text-text-faint uppercase mb-2">
          Season {season.season.seasonNumber}
        </p>
        <div className="text-stat text-3xl sm:text-5xl font-bold flex items-center justify-center gap-3 sm:gap-5">
          <PopIn className={season.winner === "adi" ? "text-adi" : "text-text"}>{season.adiFinalPoints}</PopIn>
          <span className="text-text-faint text-xl sm:text-2xl">—</span>
          <PopIn className={season.winner === "ren" ? "text-ren" : "text-text"}>{season.renFinalPoints}</PopIn>
        </div>
        <p className={`font-hud font-bold tracking-[0.15em] text-sm sm:text-base mt-4 ${winnerColor}`}>
          {season.winner !== "tie" ? `${winnerLabel} BY ${season.winningMargin} POINTS` : winnerLabel}
        </p>
        <p className="text-xs text-text-faint mt-2">
          Completed {formatDate(season.season.completionDate)} &middot; {season.racesPlayed}/32 races
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3 sm:p-6 mb-10">
        <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3 px-2">
          Season Trendline
        </p>
        <SeasonChart races={season.races} />
      </div>

      <div className="mb-10">
        <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">
          Full Race Log
        </p>
        <RaceTable races={season.races} showGuest={Boolean(season.season.guestEnabled)} pointsMapping={pointsMapping} />
      </div>

      <div className="flex items-center justify-between">
        {prevSeason ? (
          <Link href={`/season-rewind/${prevSeason.season.seasonNumber}`} className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text">
            <ChevronLeft className="h-4 w-4" /> Season {prevSeason.season.seasonNumber}
          </Link>
        ) : <span />}
        {nextSeason ? (
          <Link href={`/season-rewind/${nextSeason.season.seasonNumber}`} className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text">
            Season {nextSeason.season.seasonNumber} <ChevronRight className="h-4 w-4" />
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}
