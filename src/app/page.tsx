import Link from "next/link";
import { loadStatsModel } from "@/lib/services/stats-service";
import { calculateAllTimeChampion, calculateCurrentChampion, calculateAllTimeRecord } from "@/lib/stats";
import { computeStatFacts } from "@/lib/stats/facts";
import { TrophyCard, formatChampionSubline } from "@/components/dashboard/TrophyCard";
import { RevealGroup, RevealItem } from "@/components/dashboard/Reveal";
import { ParallaxBackdrop } from "@/components/dashboard/ParallaxBackdrop";
import { StatFax } from "@/components/dashboard/StatFax";
import { formatDate } from "@/lib/utils";
import { LineChart, MapPinned, Users, History, Radio, ChevronRight } from "lucide-react";

export default async function DashboardPage() {
  const model = await loadStatsModel();
  const currentChampion = calculateCurrentChampion(model.seasons);
  const allTimeChampion = calculateAllTimeChampion(model.seasons);
  const allTimeRecord = calculateAllTimeRecord(model.seasons);
  const seasonsPlayed = model.seasons.filter((s) => s.isComplete).length;
  const statFacts = computeStatFacts(model);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-28">
      {/* Wraps only the hero through the trophy scrolls — ParallaxBackdrop
          is inset-0 within THIS element, so the backdrop's height tracks
          this section's content height exactly and stops right where the
          scrolls end, instead of a fixed viewport-relative height that
          either fell short or ran into "Jump In" below. */}
      <div className="relative isolate">
        <ParallaxBackdrop />

        <div className="pt-16 pb-10 sm:pt-24 sm:pb-14 text-center relative">
        <span
          aria-hidden
          className="bleed-halo pointer-events-none absolute left-1/2 -translate-x-1/2 top-[96px] h-[300px] w-[780px] rounded-full"
        />
        <span
          aria-hidden
          className="bleed-wash pointer-events-none absolute left-1/2 -translate-x-1/2 top-[130px] h-[290px] w-[620px] rounded-full"
        />

        <p
          className="bleed-in font-hud text-xs sm:text-sm font-bold tracking-[0.4em] text-text-faint uppercase mb-4"
          style={{ animationDuration: "1.6s", animationDelay: "0.15s" }}
        >
          The Rivalry Archive
        </p>

        <h1
          className="bleed-in bleed-in-display font-display text-4xl sm:text-6xl tracking-wide"
          style={{ animationDuration: "2.4s", animationDelay: "0.45s" }}
        >
          <span className="text-adi">ADI</span>
          <span className="text-text-faint mx-3 sm:mx-4">VS</span>
          <span className="text-ren">REN</span>
        </h1>

          <p
            className="bleed-in mt-5 text-text-dim max-w-xl mx-auto leading-relaxed"
            style={{ animationDuration: "2s", animationDelay: "1.15s" }}
          >
            {seasonsPlayed} season{seasonsPlayed === 1 ? "" : "s"} of Mario Kart Wii history, every race
            logged, every rivalry stat calculated live.
          </p>
        </div>

        {statFacts.length > 0 && (
          <RevealGroup className="max-w-2xl mx-auto mb-12 sm:mb-16">
            <RevealItem>
              <StatFax facts={statFacts} />
            </RevealItem>
          </RevealGroup>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,1fr))] gap-14 mb-24">
          <TrophyCard
            kind="champion"
            index={0}
            label="Current Champion"
            playerId={currentChampion?.playerId ?? null}
            points={currentChampion?.points ?? null}
            pointsLabel="Points"
            subline={
              currentChampion ? formatChampionSubline(currentChampion.seasonNumber, currentChampion.completionDate) : ""
            }
            emptyMessage="No season has been completed yet — finish one in War Mode to crown a champion."
          />
          <TrophyCard
            kind="alltime"
            index={1}
            label="All-Time Champion"
            playerId={allTimeChampion?.playerId ?? null}
            points={allTimeChampion?.points ?? null}
            pointsLabel="Career Points"
            subline={allTimeChampion ? `Leading through Season ${allTimeChampion.seasonNumber}` : ""}
            emptyMessage="Career totals are tied — no all-time champion yet."
          />
          <TrophyCard
            kind="record"
            index={2}
            label="All-Time Record"
            playerId={allTimeRecord?.playerId ?? null}
            points={allTimeRecord?.points ?? null}
            pointsLabel="Points in a Season"
            subline={allTimeRecord ? `Set in Season ${allTimeRecord.seasonNumber} — ${formatDate(allTimeRecord.completionDate)}` : ""}
            emptyMessage="No completed season yet to set the record."
          />
        </div>
      </div>

      <section>
        <div className="mb-5">
          <p className="font-hud text-xs font-bold tracking-[0.25em] text-text-faint uppercase mb-1">Explore</p>
          <h2 className="font-display text-2xl sm:text-3xl tracking-wide text-text">Jump In</h2>
        </div>
        <RevealGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <RevealItem>
            <NavTile href="/trendline" icon={LineChart} label="Trendline" desc="One running point total across the whole rivalry." group="Analyze" />
          </RevealItem>
          <RevealItem>
            <NavTile href="/circuits" icon={MapPinned} label="Circuit Stats" desc="Head-to-head performance at every track." group="Analyze" />
          </RevealItem>
          <RevealItem>
            <NavTile href="/players" icon={Users} label="Player Stats" desc="Full competitive profiles and the direct rivalry comparison." group="Analyze" />
          </RevealItem>
          <RevealItem>
            <NavTile href="/season-rewind" icon={History} label="Season Rewind" desc="Every completed season, archived and replayable." group="History" />
          </RevealItem>
          <RevealItem>
            <NavTile href="/war-mode" icon={Radio} label="War Mode" desc="Record a new season, race by race, live." group="Live" accent="danger" />
          </RevealItem>
        </RevealGroup>
      </section>
    </div>
  );
}

function NavTile({
  href,
  icon: Icon,
  label,
  desc,
  group,
  accent = "gold",
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  group: string;
  accent?: "gold" | "danger";
}) {
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-raised"
    >
      <div className="flex items-start justify-between">
        <div
          className={
            "flex h-10 w-10 items-center justify-center rounded-lg " +
            (accent === "danger" ? "bg-danger/15 text-danger" : "bg-gold/15 text-gold")
          }
        >
          <Icon className="h-5 w-5" />
        </div>
        <ChevronRight className="h-4 w-4 text-text-faint transition-transform group-hover:translate-x-1 group-hover:text-text" />
      </div>
      <p className="font-hud text-[13px] font-bold tracking-[0.2em] text-text-faint uppercase mt-4">{group}</p>
      <h3 className="font-display text-lg tracking-wide text-text mt-0.5">{label}</h3>
      <p className="text-sm text-text-dim mt-1">{desc}</p>
    </Link>
  );
}
