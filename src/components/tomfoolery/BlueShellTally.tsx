import type { PlayerId } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { Card } from "@/components/ui/Card";
import type { TomfooleryStats } from "@/lib/stats/tomfoolery";

export function BlueShellTally({ stats }: { stats: TomfooleryStats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
      <PlayerTally playerId="adi" stats={stats} />
      <PlayerTally playerId="ren" stats={stats} />
    </div>
  );
}

function PlayerTally({ playerId, stats }: { playerId: PlayerId; stats: TomfooleryStats }) {
  const player = PLAYERS[playerId];
  const accent = playerId === "adi" ? "text-adi" : "text-ren";
  const count = stats.totalBlueShells[playerId];
  const rate = stats.blueShellsPerRace[playerId];

  return (
    <Card className="p-6 flex items-center gap-5">
      <PlayerAvatar playerId={playerId} size={56} />
      <div>
        <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-1">
          {player.name}&apos;s Blue Shells
        </p>
        <p className={`text-stat text-4xl font-bold ${accent}`}>{count}</p>
        <p className="text-[13px] text-text-faint mt-1">
          {rate !== null ? `${rate} per race` : "No battle races recorded yet"}
        </p>
      </div>
    </Card>
  );
}
