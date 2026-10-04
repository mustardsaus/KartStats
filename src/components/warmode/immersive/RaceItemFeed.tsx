"use client";

import type { RaceItemEvent } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";

/** The permanent per-race item timeline (spec section 9's "Powerup Graph" data) — a simple chronological list, not a chart; reused as-is by Season Rewind. */
export function RaceItemFeed({ events }: { events: RaceItemEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-faint text-center py-4">No items logged for this race.</p>;
  }
  const sorted = [...events].sort((a, b) => a.tsMs - b.tsMs);
  return (
    <ul className="space-y-1.5 max-h-48 overflow-y-auto">
      {sorted.map((e, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-lg bg-surface border border-border"
        >
          <span className={e.playerId === "adi" ? "text-adi font-medium" : "text-ren font-medium"}>
            {PLAYERS[e.playerId].name}
          </span>
          <span className="text-text-dim capitalize truncate">{e.itemId.replace(/-/g, " ")}</span>
          <span className="text-text-faint text-xs whitespace-nowrap">
            Lap {e.lap} &middot; {Math.round(e.tsMs / 1000)}s
          </span>
        </li>
      ))}
    </ul>
  );
}
