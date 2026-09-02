"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import type { DriverId } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { incrementBlueShellAction, decrementBlueShellAction } from "@/app/war-mode/battle-actions";
import { PopIn } from "@/components/ui/PopIn";
import { tapPulse } from "@/lib/animation";
import { useDebouncedCallback } from "@/lib/hooks/useDebouncedCallback";
import { cn } from "@/lib/utils";

/**
 * "Blue shelled?" — one big tap logs a hit for whoever this device is
 * (the common case). A quiet "log for X instead" toggle underneath
 * covers the same "other player's phone died" resilience the position
 * form has, without cluttering the primary one-tap interaction.
 *
 * The count shown is optimistic (useOptimistic) — a tap updates the
 * badge on the button itself immediately. The button is deliberately
 * NEVER disabled while a tap is in flight (a `pending`-gated disabled
 * state is what made rapid taps feel stuck before — each tap had to
 * wait out the full server round trip before the next one even
 * registered) — instead, the actual writes are chained onto
 * `mutationChainRef` so they still apply to the server in the order
 * they were tapped, no matter how the network resolves them, while the
 * UI itself never waits on that chain. `onChanged` (a full battle-state
 * refetch) is debounced so a burst of taps triggers one refresh once
 * things settle, not one per tap.
 */
const DRIVER_LABEL = (id: DriverId) => (id === "guest" ? "Prawns" : PLAYERS[id].name);

export function BlueShellButton({
  roundId,
  myPlayerId,
  adiCount,
  renCount,
  guestEnabled = false,
  guestCount = 0,
  onChanged,
}: {
  roundId: string;
  myPlayerId: DriverId;
  adiCount: number;
  renCount: number;
  guestEnabled?: boolean;
  guestCount?: number;
  onChanged: () => void;
}) {
  const [loggingFor, setLoggingFor] = useState<DriverId>(myPlayerId);
  const [, startTransition] = useTransition();
  const roster: DriverId[] = guestEnabled ? ["adi", "ren", "guest"] : ["adi", "ren"];
  // Two-driver battles keep the old simple toggle (log for the ONE other
  // player); a 3-driver battle needs to pick among two others, so it gets
  // the roster-pill selector below instead — see the render section.
  const otherPlayerId: DriverId = loggingFor === "adi" ? "ren" : "adi";
  const count = loggingFor === "adi" ? adiCount : loggingFor === "ren" ? renCount : guestCount;
  const [optimisticCount, addOptimisticDelta] = useOptimistic(count, (current: number, delta: number) =>
    Math.max(0, current + delta)
  );
  const mutationChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const debouncedRefresh = useDebouncedCallback(onChanged, 280);

  const handleTap = (target: HTMLElement) => {
    tapPulse(target);
    startTransition(async () => {
      addOptimisticDelta(1);
      mutationChainRef.current = mutationChainRef.current.then(() => incrementBlueShellAction(roundId, loggingFor));
      await mutationChainRef.current;
      debouncedRefresh();
    });
  };

  const handleUndo = () => {
    startTransition(async () => {
      addOptimisticDelta(-1);
      mutationChainRef.current = mutationChainRef.current.then(() => decrementBlueShellAction(roundId, loggingFor));
      await mutationChainRef.current;
      debouncedRefresh();
    });
  };

  return (
    <div className="text-center">
      <button
        onClick={(e) => handleTap(e.currentTarget)}
        className="relative w-full max-w-xs mx-auto flex items-center justify-center gap-3 rounded-xl bg-ren px-8 py-5 font-display text-xl tracking-widest text-void hover:brightness-110 active:brightness-95 shadow-lg shadow-ren/30 transition-colors"
      >
        <img src="/items/blue-shell-button.png" alt="" className="h-8 w-8 object-contain drop-shadow" />
        BLUE SHELLED?
        {optimisticCount > 0 && (
          <PopIn
            key={optimisticCount}
            className="absolute -top-3.5 -right-3.5 h-10 min-w-10 px-2 rounded-full bg-gold border-[3px] border-void text-xl font-hud font-extrabold text-void flex items-center justify-center shadow-lg leading-none"
          >
            {optimisticCount}
          </PopIn>
        )}
      </button>

      <div className="flex items-center justify-center gap-3 mt-3 text-xs text-paper/60">
        <span>
          Logging for <span className="font-semibold text-paper/85">{DRIVER_LABEL(loggingFor)}</span>
        </span>
        {optimisticCount > 0 && (
          <button onClick={handleUndo} className="underline underline-offset-2 hover:text-paper">
            undo
          </button>
        )}
      </div>
      {guestEnabled ? (
        <div className="flex items-center justify-center gap-2 mt-1.5">
          {roster.map((id) => (
            <button
              key={id}
              onClick={() => setLoggingFor(id)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-hud font-semibold tracking-wide transition-colors",
                loggingFor === id ? "bg-paper/20 text-paper" : "text-paper/40 hover:text-paper/70"
              )}
            >
              {DRIVER_LABEL(id)}
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setLoggingFor(otherPlayerId)}
          className={cn("text-[11px] text-paper/40 hover:text-paper/70 underline underline-offset-2 mt-1")}
        >
          Log for {DRIVER_LABEL(otherPlayerId)} instead
        </button>
      )}
    </div>
  );
}
