import { getStore } from "@/lib/db";
import { buildGuestStats } from "@/lib/stats/guest";
import { SectionHeading, Card } from "@/components/ui/Card";
import { StaggerIn } from "@/components/ui/StaggerIn";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * "View Guest Stats" — the dedicated, low-key page for Prawns' (the third
 * Battle Mode driver's) real, computed stats. Deliberately not linked from
 * the main nav (per the original ask: hidden unless someone specifically
 * comes looking) — reachable from a small link at the bottom of Tomfoolery
 * Tales and directly at /guest-stats. Nothing here feeds any of the site's
 * core Adi-vs-Ren numbers; see lib/stats/guest.ts.
 */
export default async function GuestStatsPage() {
  const store = getStore();
  const [seasons, racesBySeasonId, racePowerups, pointsMapping] = await Promise.all([
    store.getSeasons(),
    store.getRacesBySeasonId(),
    store.getRacePowerups(),
    store.getPointsMapping(),
  ]);
  const stats = buildGuestStats(seasons, racesBySeasonId, racePowerups, pointsMapping);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20 space-y-10">
      <SectionHeading eyebrow="Battle Mode" title="Guest Stats" />

      {stats.seasonsPlayed === 0 ? (
        <p className="text-sm text-text-faint">
          Prawns hasn&rsquo;t joined a battle yet — pick &ldquo;3 — add Prawns&rdquo; when engaging a battle to start
          tracking a guest driver&rsquo;s stats here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MiniStat label="Seasons" value={stats.seasonsPlayed} />
            <MiniStat label="Races" value={stats.careerRacesPlayed} />
            <MiniStat label="Career Points" value={stats.careerPoints} />
            <MiniStat label="Blue Shells Taken" value={stats.careerBlueShells} />
          </div>

          <Card className="p-6 flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-surface-raised font-display text-2xl text-text-dim">
              P
            </span>
            <div>
              <p className="font-display text-lg tracking-wide text-text">Prawns</p>
              <p className="text-[13px] text-text-faint">
                {stats.favoriteItem
                  ? `Favorite pick: ${stats.favoriteItem.item.name} (${stats.favoriteItem.count}x)`
                  : "No power-ups logged yet."}
              </p>
            </div>
          </Card>

          <div>
            <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">By Season</p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="bg-surface-raised">
                    <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
                      Season
                    </th>
                    <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
                      Races
                    </th>
                    <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
                      Points
                    </th>
                    <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
                      Blue Shells
                    </th>
                  </tr>
                </thead>
                <StaggerIn as="tbody">
                  {stats.bySeason.map((row, i) => (
                    <tr
                      key={row.seasonId}
                      data-stagger-item
                      className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}
                    >
                      <td className="px-3 py-2">
                        <Link href={`/season-rewind/${row.seasonNumber}`} className="font-hud font-bold text-text hover:text-gold">
                          Season {row.seasonNumber}
                        </Link>
                        {!row.isComplete && <span className="text-text-faint text-[12px] ml-1.5">&middot; in progress</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-stat text-text-dim">{row.racesPlayed}</td>
                      <td className="px-3 py-2 text-right text-stat font-bold text-text">{row.totalPoints}</td>
                      <td className="px-3 py-2 text-right text-stat text-text-dim">{row.totalBlueShells}</td>
                    </tr>
                  ))}
                </StaggerIn>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-stat text-2xl font-bold text-text">{value}</p>
      <p className="text-[11px] font-hud font-semibold tracking-[0.15em] text-text-faint uppercase mt-1">{label}</p>
    </Card>
  );
}
