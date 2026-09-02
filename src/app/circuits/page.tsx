import Link from "next/link";
import { loadStatsModel } from "@/lib/services/stats-service";
import { CircuitImage } from "@/components/circuits/CircuitImage";
import { SectionHeading } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { PLAYERS } from "@/lib/data/points-mapping";

export default async function CircuitsPage() {
  const model = await loadStatsModel();
  const circuits = [...model.circuits].sort((a, b) => a.circuit.name.localeCompare(b.circuit.name));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-14">
      <SectionHeading eyebrow="Analyze" title="Circuit Stats" />
      <p className="text-text-dim max-w-2xl mb-8 text-sm">
        Every circuit in the rotation. Open one to see the full historical head-to-head, including
        swing probability — who really owns this track.
      </p>

      <StaggerIn className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {circuits.map((c) => {
          // Who "owns" this track, by raw points earned here — not win
          // count, so a player who's finished 2nd a lot but always ahead
          // of the other's 3rd still shows up as the track's dominant
          // player once the points reflect it.
          const dominant =
            c.adiTotalPoints === c.renTotalPoints ? null : c.adiTotalPoints > c.renTotalPoints ? "adi" : "ren";
          return (
            <Link
              key={c.circuit.id}
              data-stagger-item
              href={`/circuits/${c.circuit.id}`}
              className="group relative overflow-hidden rounded-xl border border-border bg-surface aspect-[4/3] transition-transform hover:-translate-y-0.5 hover:border-border-strong"
            >
              <CircuitImage
                circuit={c.circuit}
                className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                workingLongEdge={480}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-void/80 via-void/10 to-transparent" />
              {dominant && (
                <span
                  className="absolute top-2 right-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
                  title={`${PLAYERS[dominant].name} leads on points here`}
                >
                  <PlayerAvatar playerId={dominant} size={28} />
                </span>
              )}
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="font-display text-base text-paper tracking-wide leading-tight">
                  {c.circuit.name}
                </p>
                <p className="text-stat text-base font-bold text-paper mt-1">
                  {c.appearances} race{c.appearances === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          );
        })}
      </StaggerIn>
    </div>
  );
}
