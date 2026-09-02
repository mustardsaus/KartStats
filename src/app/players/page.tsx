import Link from "next/link";
import { loadStatsModel } from "@/lib/services/stats-service";
import {
  calculateStrongestTracks,
  calculateWeakestTracks,
  appearancesAreUneven,
  type TrackRanking,
  type CircuitStat,
} from "@/lib/stats";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { CircuitImage } from "@/components/circuits/CircuitImage";
import { CompareTable, type CompareRow } from "@/components/stats/CompareTable";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { PLAYERS } from "@/lib/data/points-mapping";
import { formatDate } from "@/lib/utils";
import type { PlayerId } from "@/lib/types";

export default async function PlayersPage() {
  const model = await loadStatsModel();
  const { adi, ren } = model.players;
  const normalize = appearancesAreUneven(model.seasons, model.circuits.map((c) => c.circuit));

  const adiStrong = calculateStrongestTracks(model.seasons, model.circuits.map((c) => c.circuit), "adi", 3, normalize);
  const renStrong = calculateStrongestTracks(model.seasons, model.circuits.map((c) => c.circuit), "ren", 3, normalize);
  const adiWeak = calculateWeakestTracks(model.seasons, model.circuits.map((c) => c.circuit), "adi", 3, normalize);
  const renWeak = calculateWeakestTracks(model.seasons, model.circuits.map((c) => c.circuit), "ren", 3, normalize);

  const rows: CompareRow[] = [
    { label: "Championships", adi: adi.championships, ren: ren.championships, winner: adi.championships === ren.championships ? null : adi.championships > ren.championships ? "adi" : "ren" },
    { label: "Career Points", adi: adi.careerPoints.toLocaleString(), ren: ren.careerPoints.toLocaleString(), winner: adi.careerPoints > ren.careerPoints ? "adi" : ren.careerPoints > adi.careerPoints ? "ren" : null },
    { label: "Race Wins", adi: adi.raceWins, ren: ren.raceWins, winner: adi.raceWins === ren.raceWins ? null : adi.raceWins > ren.raceWins ? "adi" : "ren" },
    { label: "Podiums", adi: adi.podiums, ren: ren.podiums, winner: adi.podiums === ren.podiums ? null : adi.podiums > ren.podiums ? "adi" : "ren" },
    {
      label: "Median Finishing Position",
      adi: adi.medianFinishingPosition ?? "—",
      ren: ren.medianFinishingPosition ?? "—",
      winner:
        adi.medianFinishingPosition === null || ren.medianFinishingPosition === null
          ? null
          : adi.medianFinishingPosition < ren.medianFinishingPosition
            ? "adi"
            : adi.medianFinishingPosition > ren.medianFinishingPosition
              ? "ren"
              : null,
    },
    { label: "Median Season Points", adi: adi.medianSeasonPoints ?? "—", ren: ren.medianSeasonPoints ?? "—" },
    { label: "Strongest Track", adi: adiStrong[0]?.circuit.name ?? "—", ren: renStrong[0]?.circuit.name ?? "—" },
    { label: "Weakest Track", adi: adiWeak[0]?.circuit.name ?? "—", ren: renWeak[0]?.circuit.name ?? "—" },
  ];

  return (
    <div>
      {/* Versus hero */}
      <div className="relative overflow-hidden border-b border-border speed-lines">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,77,46,0.14), transparent 45%, transparent 55%, rgba(34,199,245,0.14))",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24 grid grid-cols-3 items-center gap-4">
          <PlayerVersusSide playerId="adi" side="left" />
          <div className="flex flex-col items-center">
            <span className="font-display text-2xl sm:text-4xl text-text-faint tracking-widest">VS</span>
          </div>
          <PlayerVersusSide playerId="ren" side="right" />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20 space-y-16">
        <div>
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">
            Head-to-Head Statistics
          </p>
          <CompareTable rows={rows} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <PlayerDeepStats playerId="adi" />
          <PlayerDeepStats playerId="ren" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <TrackList title="Adi's Strongest Tracks" tracks={adiStrong} accent="adi" normalize={normalize} />
          <TrackList title="Ren's Strongest Tracks" tracks={renStrong} accent="ren" normalize={normalize} />
          <TrackList title="Adi's Weakest Tracks" tracks={adiWeak} accent="adi" normalize={normalize} />
          <TrackList title="Ren's Weakest Tracks" tracks={renWeak} accent="ren" normalize={normalize} />
        </div>
      </div>
    </div>
  );

  function PlayerDeepStats({ playerId }: { playerId: PlayerId }) {
    const career = model.players[playerId];
    const opponentId: PlayerId = playerId === "adi" ? "ren" : "adi";
    const opponent = model.players[opponentId];
    const player = PLAYERS[playerId];
    const accent = playerId === "adi" ? "text-adi" : "text-ren";

    return (
      <div className="rounded-2xl border border-border bg-surface p-6 sm:p-7">
        <div className="flex items-center gap-3 mb-6">
          <PlayerAvatar playerId={playerId} size={48} />
          <div>
            <h3 className={`font-display text-xl tracking-wide ${accent}`}>{player.name.toUpperCase()}</h3>
            <p className="text-xs text-text-faint">{player.characterName}</p>
          </div>
        </div>

        <StaggerIn className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MiniStat label="Career Pts" value={career.careerPoints.toLocaleString()} accent={accent} />
          <MiniStat label="Champs" value={career.championships} accent={accent} />
          <MiniStat label="Races Won" value={career.raceWins} accent={accent} />
          <MiniStat label="Podiums" value={career.podiums} accent={accent} />
          <MiniStat label="Avg. Finish" value={career.averageFinishingPosition ?? "—"} accent={accent} />
          <MiniStat label="Med. Finish" value={career.medianFinishingPosition ?? "—"} accent={accent} />
          <MiniStat label="Avg. Pts/Race" value={career.averagePointsPerRace ?? "—"} accent={accent} />
          <MiniStat
            label="H2H Win %"
            value={career.headToHeadWinPercentage !== null ? `${career.headToHeadWinPercentage}%` : "—"}
            accent={accent}
          />
        </StaggerIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl bg-surface-raised p-4">
            <p className="font-hud text-[12px] font-bold tracking-[0.2em] text-text-faint uppercase mb-2">Best Season</p>
            {career.bestSeason ? (
              <Link href={`/season-rewind/${career.bestSeason.season.seasonNumber}`} className="block hover:opacity-80">
                <p className="font-display text-lg text-text">Season {career.bestSeason.season.seasonNumber}</p>
                <p className={`text-stat text-2xl font-bold mt-0.5 ${accent}`}>
                  {career.highestSeasonPoints?.toLocaleString()} pts
                </p>
                <p className="text-[13px] text-text-faint mt-1">
                  {formatDate(career.bestSeason.season.completionDate)}
                </p>
              </Link>
            ) : (
              <p className="text-sm text-text-faint">No completed season yet.</p>
            )}
          </div>
          <div className="rounded-xl bg-surface-raised p-4">
            <p className="font-hud text-[12px] font-bold tracking-[0.2em] text-text-faint uppercase mb-2">
              vs {PLAYERS[opponentId].name}
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-stat text-2xl font-bold text-text">
                  {career.championships}
                  <span className="text-text-faint text-base mx-1">–</span>
                  {opponent.championships}
                </p>
                <p className="text-[13px] text-text-faint mt-0.5">Championships</p>
              </div>
              <PlayerAvatar playerId={opponentId} size={38} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CircuitCallout label="Strongest Circuit" stat={career.strongestCircuit} accent={accent} playerId={playerId} />
          <CircuitCallout label="Weakest Circuit" stat={career.weakestCircuit} accent={accent} playerId={playerId} />
        </div>
      </div>
    );
  }
}

function PlayerVersusSide({ playerId, side }: { playerId: "adi" | "ren"; side: "left" | "right" }) {
  const player = PLAYERS[playerId];
  const accent = playerId === "adi" ? "text-adi" : "text-ren";
  return (
    <div className={`flex flex-col items-center ${side === "left" ? "sm:items-end" : "sm:items-start"} text-center sm:text-inherit`}>
      <PlayerAvatar playerId={playerId} size={112} className="mb-4" />
      <h2 className={`font-display text-3xl sm:text-5xl tracking-wide ${accent}`}>{player.name.toUpperCase()}</h2>
      <p className="text-xs text-text-faint mt-1.5">{player.characterName}</p>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div data-stagger-item className="rounded-lg bg-surface p-2.5 text-center">
      <p className={`text-stat text-lg font-bold ${accent}`}>{value}</p>
      <p className="text-[11px] text-text-faint uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function CircuitCallout({
  label,
  stat,
  accent,
  playerId,
}: {
  label: string;
  stat: CircuitStat | null;
  accent: string;
  playerId: PlayerId;
}) {
  if (!stat) {
    return (
      <div className="rounded-xl bg-surface-raised p-4">
        <p className="font-hud text-[12px] font-bold tracking-[0.2em] text-text-faint uppercase mb-2">{label}</p>
        <p className="text-sm text-text-faint">Not enough data yet.</p>
      </div>
    );
  }
  const points = playerId === "adi" ? stat.adiTotalPoints : stat.renTotalPoints;
  const brightAccent = accent === "text-adi" ? "text-adi-glow" : "text-ren-glow";
  return (
    <Link href={`/circuits/${stat.circuit.id}`} className="relative overflow-hidden rounded-xl h-32 group block">
      <CircuitImage
        circuit={stat.circuit}
        className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
        workingLongEdge={480}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-void/85 to-void/10" />
      <div className="absolute inset-0 p-3.5 flex flex-col justify-end">
        <p className="font-hud text-[10px] font-bold tracking-[0.2em] text-paper/70 uppercase mb-1">{label}</p>
        <p className="font-display text-base text-paper leading-tight">{stat.circuit.name}</p>
        <p className={`text-stat font-bold mt-0.5 ${brightAccent}`}>{points} pts</p>
      </div>
    </Link>
  );
}

function TrackList({
  title,
  tracks,
  accent,
  normalize,
}: {
  title: string;
  tracks: TrackRanking[];
  accent: "adi" | "ren";
  normalize: boolean;
}) {
  return (
    <div>
      <p className={`font-hud text-xs font-bold tracking-[0.2em] uppercase mb-3 ${accent === "adi" ? "text-adi" : "text-ren"}`}>
        {title}
      </p>
      <StaggerIn className="space-y-2">
        {tracks.length === 0 && <p className="text-sm text-text-faint">Not enough data yet.</p>}
        {tracks.map((t, i) => (
          <div key={t.circuit.id} data-stagger-item className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5">
            <span className="font-display text-lg text-text-faint w-5 text-center">{i + 1}</span>
            <div className="h-10 w-14 rounded-md overflow-hidden shrink-0">
              <CircuitImage circuit={t.circuit} workingLongEdge={240} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{t.circuit.name}</p>
            </div>
            <p className="text-stat font-bold text-text shrink-0">
              {normalize ? t.averagePoints : t.totalPoints}
              <span className="text-[12px] text-text-faint ml-1">{normalize ? "avg" : "pts"}</span>
            </p>
          </div>
        ))}
      </StaggerIn>
    </div>
  );
}
