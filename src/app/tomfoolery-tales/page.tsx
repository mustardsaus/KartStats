import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getStore } from "@/lib/db";
import { buildTomfooleryStats } from "@/lib/stats/tomfoolery";
import { BlueShellTally } from "@/components/tomfoolery/BlueShellTally";
import { PowerupBreakdown } from "@/components/tomfoolery/PowerupBreakdown";
import { TrackMayhemTable } from "@/components/tomfoolery/TrackMayhemTable";
import { SeasonMayhemTable } from "@/components/tomfoolery/SeasonMayhemTable";
import { SectionHeading } from "@/components/ui/Card";

/**
 * The Battle Mode summary page: blue shells taken and power-ups received,
 * aggregated across every race that carries battle-mode data. Kept
 * completely separate from loadStatsModel()/buildStatsModel() — this data
 * only exists for battle-recorded races (a partial dataset), unlike the
 * core stats pipeline which assumes every race is complete.
 */
export default async function TomfooleryTalesPage() {
  const store = getStore();
  const [racesBySeasonId, racePowerups, circuits, seasons] = await Promise.all([
    store.getRacesBySeasonId(),
    store.getRacePowerups(),
    store.getCircuits(),
    store.getSeasons(),
  ]);
  const races = [...racesBySeasonId.values()].flat();
  const stats = buildTomfooleryStats(races, racePowerups, circuits, seasons);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20 space-y-14">
      <SectionHeading
        eyebrow="Battle Mode"
        title="Tomfoolery Tales"
      />

      {stats.battleRacesRecorded === 0 ? (
        <p className="text-sm text-text-faint">
          No Battle Mode races recorded yet — play a season in Battle Mode to start tracking blue shells and
          power-ups here.
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
            <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">Power-up Log</p>
            <PowerupBreakdown stats={stats} />
          </div>

          <div>
            <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">
              By Track — where the mayhem happens
            </p>
            <TrackMayhemTable rows={stats.byTrack} />
          </div>

          <div>
            <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">
              By Season
            </p>
            <SeasonMayhemTable rows={stats.bySeason} />
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
