import Link from "next/link";
import { notFound } from "next/navigation";
import { loadStatsModel } from "@/lib/services/stats-service";
import { CircuitImage } from "@/components/circuits/CircuitImage";
import { CompareTable, type CompareRow } from "@/components/stats/CompareTable";
import { SwingBar } from "@/components/stats/SwingBar";
import { CircuitSeasonTable, type CircuitSeasonRow } from "@/components/circuits/CircuitSeasonTable";
import { ChevronLeft } from "lucide-react";

export default async function CircuitDetailPage({ params }: PageProps<"/circuits/[slug]">) {
  const { slug } = await params;
  const model = await loadStatsModel();
  const stat = model.circuits.find((c) => c.circuit.id === slug);
  if (!stat) notFound();

  // Season-by-season history at this circuit — every race here across
  // every season, most recent first. Normally one per season (one lap
  // through the full 32-circuit rotation), but a season with more than
  // one race here is labeled by race number too rather than merged away.
  const seasonRows: CircuitSeasonRow[] = [...model.seasons]
    .sort((a, b) => b.season.seasonNumber - a.season.seasonNumber)
    .flatMap((s) => {
      const races = s.races.filter((r) => r.circuitId === slug);
      return races.map((r) => ({
        seasonNumber: s.season.seasonNumber,
        raceNumber: races.length > 1 ? r.raceNumber : undefined,
        adiFinishingPosition: r.adiFinishingPosition,
        adiPoints: r.adiPoints,
        renFinishingPosition: r.renFinishingPosition,
        renPoints: r.renPoints,
      }));
    });

  const rows: CompareRow[] = [
    {
      label: "No. of 1st Place Finishes",
      adi: stat.adiFirstPlaceFinishes,
      ren: stat.renFirstPlaceFinishes,
      winner: stat.adiFirstPlaceFinishes === stat.renFirstPlaceFinishes ? null : stat.adiFirstPlaceFinishes > stat.renFirstPlaceFinishes ? "adi" : "ren",
    },
    {
      label: "Total Points",
      adi: stat.adiTotalPoints,
      ren: stat.renTotalPoints,
      winner: stat.adiTotalPoints === stat.renTotalPoints ? null : stat.adiTotalPoints > stat.renTotalPoints ? "adi" : "ren",
    },
    {
      label: "Median Finishing Position",
      adi: stat.adiMedianFinishingPosition ?? "—",
      ren: stat.renMedianFinishingPosition ?? "—",
      winner:
        stat.adiMedianFinishingPosition === null || stat.renMedianFinishingPosition === null
          ? null
          : stat.adiMedianFinishingPosition < stat.renMedianFinishingPosition
            ? "adi"
            : stat.adiMedianFinishingPosition > stat.renMedianFinishingPosition
              ? "ren"
              : null,
    },
    {
      label: "Median Points",
      adi: stat.adiMedianPoints ?? "—",
      ren: stat.renMedianPoints ?? "—",
      winner:
        stat.adiMedianPoints === null || stat.renMedianPoints === null
          ? null
          : stat.adiMedianPoints > stat.renMedianPoints
            ? "adi"
            : stat.adiMedianPoints < stat.renMedianPoints
              ? "ren"
              : null,
    },
    {
      label: "Swing Probability",
      adi: stat.adiSwingProbability !== null ? `${stat.adiSwingProbability}%` : "—",
      ren: stat.renSwingProbability !== null ? `${stat.renSwingProbability}%` : "—",
    },
  ];

  return (
    <div>
      <div className="relative h-64 sm:h-80 w-full overflow-hidden">
        <CircuitImage circuit={stat.circuit} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-void/35" />
        <div className="absolute inset-0 flex flex-col justify-end mx-auto max-w-5xl px-4 sm:px-6 pb-6 w-full left-0 right-0">
          <Link
            href="/circuits"
            className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-text mb-3 w-fit"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> All Circuits
          </Link>
          {stat.circuit.cup && (
            <p className="font-hud text-xs font-bold tracking-[0.25em] text-gold uppercase mb-1">
              {stat.circuit.cup} &middot; {stat.circuit.category}
            </p>
          )}
          {/* text-text (not text-paper): the scrim below fades to a fully
              opaque from-bg right where this sits, so the flat page bg
              color is what's actually behind the title — text-text tracks
              that exactly (dark ink in the lore theme, light in Dark
              Mode) instead of a fixed light color that washed out against
              brighter circuit photos and the light lore-theme scrim. */}
          <h1 className="font-display text-3xl sm:text-5xl tracking-wide text-text">{stat.circuit.name}</h1>
          <p className="text-sm text-text-dim mt-1">
            {stat.appearances} historical race{stat.appearances === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 space-y-8">
        <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">
            Swing Probability
          </p>
          <SwingBar adiPct={stat.adiSwingProbability} renPct={stat.renSwingProbability} size="md" />
          <p className="text-xs text-text-faint mt-2">
            Chance of finishing ahead of the other here, across all {stat.appearances} race
            {stat.appearances === 1 ? "" : "s"}
            {stat.medianPointSwing !== null && <> &middot; typical swing when it does: {stat.medianPointSwing} points</>}.
          </p>
        </div>

        <div>
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">
            Head-to-Head at {stat.circuit.name}
          </p>
          <CompareTable rows={rows} />
        </div>

        <div>
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">
            Season by Season at {stat.circuit.name}
          </p>
          <CircuitSeasonTable rows={seasonRows} />
        </div>
      </div>
    </div>
  );
}
