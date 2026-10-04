import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getStore } from "@/lib/db";
import { buildTomfooleryStats } from "@/lib/stats/tomfoolery";
import { BlueShellTally } from "@/components/tomfoolery/BlueShellTally";
import { CumulativeTomfooleryTable } from "@/components/tomfoolery/CumulativeTomfooleryTable";
import { SectionHeading } from "@/components/ui/Card";

/**
 * The Battle Mode / Immersive War Mode summary page: blue shells taken
 * and power-ups received, aggregated across every race that carries that
 * data. Kept completely separate from loadStatsModel()/buildStatsModel()
 * — this data only exists for battle-recorded races (a partial dataset),
 * unlike the core stats pipeline which assumes every race is complete.
 *
 * Season 20+: one flat cumulative item table, no more by-track/by-season
 * breakdowns — see CumulativeTomfooleryTable and buildTomfooleryStats.
 */
export default async function TomfooleryTalesPage() {
  const store = getStore();
  const [racesBySeasonId, racePowerups] = await Promise.all([store.getRacesBySeasonId(), store.getRacePowerups()]);
  const races = [...racesBySeasonId.values()].flat();
  const stats = buildTomfooleryStats(races, racePowerups);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 sm:py-20 space-y-14">
      <SectionHeading
        eyebrow="Battle Mode"
        title="Tomfoolery Tales"
      />

      {stats.battleRacesRecorded === 0 ? (
        <p className="text-sm text-text-faint">
          No Battle Mode races recorded yet — play a season in Battle Mode or Immersive War Mode to start tracking
          blue shells and power-ups here.
        </p>
      ) : (
        <>
          <div>
            <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">
              Blue Shell Tally — {stats.battleRacesRecorded} battle race{stats.battleRacesRecorded === 1 ? "" : "s"}{" "}
              recorded
            </p>
            <BlueShellTally stats={stats} />
          </div>

          <div>
            <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">
              Power-up Log — {stats.totalPowerupsLogged.adi + stats.totalPowerupsLogged.ren} items logged, all-time
            </p>
            <CumulativeTomfooleryTable rows={stats.items} />
          </div>
        </>
      )}

      {/* Prawns' stats stay off this page and everywhere else on purpose —
          this is the one, quiet way to reach them, matching the original
          ask that a guest driver's numbers stay hidden unless someone
          specifically comes looking for them. */}
      <div className="pt-4 border-t border-border">
        <Link
          href="/guest-stats"
          className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text transition-colors"
        >
          View Guest Stats
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
