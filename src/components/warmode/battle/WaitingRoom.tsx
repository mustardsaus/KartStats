"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { DriverId, RawSeason } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { abandonBattleAction } from "@/app/war-mode/battle-actions";
import { slideIn } from "@/lib/animation";
import { PopIn } from "@/components/ui/PopIn";
import { Check, Loader2, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shown once this device has joined but before both players are in the
 * room. Live via the parent's realtime refresh — as soon as the other
 * player's join lands server-side, their checkmark appears here with no
 * reload needed.
 */
export function WaitingRoom({
  season,
  myPlayerId,
  onSwitchPlayer,
  onAbandoned,
  canAbandon,
}: {
  season: RawSeason;
  myPlayerId: DriverId;
  onSwitchPlayer: () => void;
  onAbandoned: () => void;
  canAbandon: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    slideIn(screenRef.current, -28);
  }, []);

  const handleAbandon = () => {
    setError(null);
    startTransition(async () => {
      const result = await abandonBattleAction(season.id);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      onAbandoned();
    });
  };

  return (
    <div ref={screenRef} className="mx-auto max-w-sm px-4 py-20 text-center">
      <Swords className="h-9 w-9 text-danger mx-auto mb-4 animate-pulse" />
      <h1 className="font-display text-2xl sm:text-3xl tracking-wide text-text mb-2">Waiting for both players</h1>
      <p className="text-text-dim text-sm mb-1">
        You&rsquo;re in as{" "}
        <span className="font-semibold text-text">{myPlayerId === "guest" ? "Prawns" : PLAYERS[myPlayerId].name}</span>.
      </p>
      <p className="text-xs text-text-faint mb-8">
        Share this code — Season {season.seasonNumber}: {" "}
        <span className="text-stat font-bold text-text tracking-[0.2em]">{season.battleCode}</span>
      </p>

      <div className="space-y-2.5 mb-6">
        <JoinedRow name={PLAYERS.adi.name} joined={Boolean(season.adiJoinedAt)} />
        <JoinedRow name={PLAYERS.ren.name} joined={Boolean(season.renJoinedAt)} />
        {season.guestEnabled && <JoinedRow name="Prawns" joined={Boolean(season.guestJoinedAt)} />}
      </div>

      <p className="text-xs text-text-faint mb-4">Starting the season automatically once both are in.</p>

      <button onClick={onSwitchPlayer} className="text-xs text-text-faint hover:text-text underline underline-offset-2">
        Not you? Switch player
      </button>

      {canAbandon && (
        <div className="mt-8 pt-6 border-t border-border">
          <button
            onClick={handleAbandon}
            disabled={pending}
            className="text-xs text-danger/80 hover:text-danger underline underline-offset-2 disabled:opacity-60"
          >
            {pending ? "Cancelling…" : "Started this by mistake? Cancel battle"}
          </button>
          {error && <p className="text-xs text-danger mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}

function JoinedRow({ name, joined }: { name: string; joined: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm transition-colors",
        joined ? "border-gold/40 bg-gold/10 text-text" : "border-border bg-surface text-text-dim"
      )}
    >
      <span className="font-medium">{name}</span>
      {joined ? (
        <PopIn key="joined">
          <Check className="h-4 w-4 text-gold" />
        </PopIn>
      ) : (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-text-faint" />
      )}
    </div>
  );
}
