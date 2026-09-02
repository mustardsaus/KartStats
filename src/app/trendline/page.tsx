import { loadStatsModel } from "@/lib/services/stats-service";
import { calculateCareerTrendlineSeries } from "@/lib/stats";
import { TrendlineChart } from "@/components/trendline/TrendlineChart";
import { SectionHeading } from "@/components/ui/Card";

export default async function TrendlinePage() {
  const model = await loadStatsModel();
  const { points, boundaries } = calculateCareerTrendlineSeries(model.seasons);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
      <SectionHeading eyebrow="Analyze" title="Trendline" />
      <p className="text-text-dim max-w-2xl mb-10 text-sm leading-relaxed">
        One running total across the entire rivalry — every point either player has ever scored,
        race by race, never reset. Season boundaries are marked for reference; for a single
        season&rsquo;s own trendline, open it from Season Rewind.
      </p>
      {points.length === 0 ? (
        <p className="text-text-dim">No race data yet — completed seasons will appear here.</p>
      ) : (
        <TrendlineChart points={points} boundaries={boundaries} />
      )}
    </div>
  );
}
