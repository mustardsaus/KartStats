import type { PlayerId } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { ITEMS_BY_ID } from "@/lib/data/items";
import { Card } from "@/components/ui/Card";
import type { TomfooleryStats } from "@/lib/stats/tomfoolery";

export function PowerupBreakdown({ stats }: { stats: TomfooleryStats }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <PlayerBreakdown playerId="adi" stats={stats} />
      <PlayerBreakdown playerId="ren" stats={stats} />
    </div>
  );
}

function PlayerBreakdown({ playerId, stats }: { playerId: PlayerId; stats: TomfooleryStats }) {
  const player = PLAYERS[playerId];
  const accent = playerId === "adi" ? "text-adi" : "text-ren";
  const totals = stats.powerupTotals[playerId];
  const favorite = stats.favoriteItem[playerId];

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <PlayerAvatar playerId={playerId} size={40} />
        <div>
          <h3 className={`font-display text-lg tracking-wide ${accent}`}>{player.name}&apos;s Power-ups</h3>
          <p className="text-[13px] text-text-faint">{stats.totalPowerupsLogged[playerId]} logged total</p>
        </div>
      </div>

      {favorite && (
        <div className="flex items-center gap-3 rounded-lg bg-surface-raised p-3 mb-4">
          <img src={`/items/${favorite.itemId}.png`} alt="" className="h-7 w-7 object-contain" />
          <div>
            <p className="text-sm text-text">Favorite: {ITEMS_BY_ID[favorite.itemId].name}</p>
            <p className="text-[12px] text-text-faint">{favorite.count}x received</p>
          </div>
        </div>
      )}

      {totals.length === 0 ? (
        <p className="text-sm text-text-faint">No power-ups logged yet.</p>
      ) : (
        <div className="space-y-1.5">
          {totals.map((t) => (
            <div key={t.itemId} className="flex items-center gap-3">
              <img src={`/items/${t.itemId}.png`} alt="" className="h-4 w-4 object-contain shrink-0" />
              <span className="text-sm text-text flex-1 truncate">{ITEMS_BY_ID[t.itemId].name}</span>
              <span className="text-stat text-sm font-bold text-text">{t.count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
