"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import type { DriverId, ItemId, RoundPowerup } from "@/lib/types";
import { ITEMS } from "@/lib/data/items";
import { PLAYERS } from "@/lib/data/points-mapping";
import { setPowerupCountAction } from "@/app/war-mode/battle-actions";
import { PopIn } from "@/components/ui/PopIn";
import { tapPulse } from "@/lib/animation";
import { useDebouncedCallback } from "@/lib/hooks/useDebouncedCallback";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Optional per-race power-up tally. Same "logging for myself by default,
 * with a quiet switch to log for the other player" pattern as
 * BlueShellButton — tap an item to select it, then a stepper underneath
 * sets how many times you got it this race. Nothing here is required to
 * submit a race's positions.
 *
 * Counts are optimistic (useOptimistic): a tap on +/- updates the number
 * on screen immediately, in the same tick as the click. The +/- buttons
 * are never disabled while a write is in flight — each stepper tap sets
 * an ABSOLUTE count (not a delta), so unlike the blue-shell counter,
 * these do need to land on the server in the order they were tapped;
 * that's handled by chaining each write onto `mutationChainRef` rather
 * than by blocking the button, so taps still register instantly and in
 * order no matter how the network resolves them. `onChanged` is
 * debounced so a burst of taps triggers one refresh once things settle.
 */
const DRIVER_LABEL = (id: DriverId) => (id === "guest" ? "Prawns" : PLAYERS[id].name);

export function PowerupGrid({
  roundId,
  myPlayerId,
  guestEnabled = false,
  powerups,
  onChanged,
}: {
  roundId: string;
  myPlayerId: DriverId;
  guestEnabled?: boolean;
  powerups: RoundPowerup[];
  onChanged: () => void;
}) {
  const [loggingFor, setLoggingFor] = useState<DriverId>(myPlayerId);
  const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(null);
  const [, startTransition] = useTransition();
  const roster: DriverId[] = guestEnabled ? ["adi", "ren", "guest"] : ["adi", "ren"];
  const otherPlayerId: DriverId = loggingFor === "adi" ? "ren" : "adi";
  const mutationChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const debouncedRefresh = useDebouncedCallback(onChanged, 280);

  const [optimisticPowerups, addOptimisticPowerup] = useOptimistic(
    powerups,
    (current: RoundPowerup[], update: { playerId: DriverId; itemId: ItemId; count: number }) => {
      const idx = current.findIndex((p) => p.playerId === update.playerId && p.itemId === update.itemId);
      if (idx === -1) return [...current, { ...update, battleRoundId: roundId }];
      const next = [...current];
      next[idx] = { ...next[idx], count: update.count };
      return next;
    }
  );

  const countFor = (playerId: DriverId, itemId: ItemId) =>
    optimisticPowerups.find((p) => p.playerId === playerId && p.itemId === itemId)?.count ?? 0;

  const selectedCount = selectedItemId ? countFor(loggingFor, selectedItemId) : 0;

  const setCount = (itemId: ItemId, count: number) => {
    startTransition(async () => {
      addOptimisticPowerup({ playerId: loggingFor, itemId, count });
      mutationChainRef.current = mutationChainRef.current.then(() =>
        setPowerupCountAction(roundId, loggingFor, itemId, count)
      );
      await mutationChainRef.current;
      debouncedRefresh();
    });
  };

  return (
    <div className="rounded-xl bg-void/55 backdrop-blur-sm border border-paper/10 px-5 py-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <p className="font-hud text-xs font-bold tracking-[0.2em] text-paper/70 uppercase">Power-ups (optional)</p>
        {guestEnabled ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-paper/50">Logging for</span>
            {roster.map((id) => (
              <button
                key={id}
                onClick={() => {
                  setLoggingFor(id);
                  setSelectedItemId(null);
                }}
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
            onClick={() => {
              setLoggingFor(otherPlayerId);
              setSelectedItemId(null);
            }}
            className="text-[11px] text-paper/40 hover:text-paper/70 underline underline-offset-2"
          >
            Logging for {DRIVER_LABEL(loggingFor)} — switch to {DRIVER_LABEL(otherPlayerId)}
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
        {ITEMS.map((item) => {
          const count = countFor(loggingFor, item.id);
          const selected = selectedItemId === item.id;
          return (
            <button
              key={item.id}
              onClick={(e) => {
                tapPulse(e.currentTarget);
                setSelectedItemId(item.id);
              }}
              title={item.name}
              className={cn(
                "relative aspect-square rounded-lg border flex items-center justify-center transition-colors",
                selected
                  ? "border-transparent bg-danger/25 ring-2 ring-danger/60"
                  : "border-paper/10 bg-void/20 hover:border-paper/25 hover:bg-void/35"
              )}
            >
              <img src={`/items/${item.id}.png`} alt={item.name} className="h-7 w-7 object-contain" />
              {count > 0 && (
                <PopIn
                  key={count}
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-gold text-[10px] font-bold text-void flex items-center justify-center"
                >
                  {count}
                </PopIn>
              )}
            </button>
          );
        })}
      </div>

      {selectedItemId && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-void/40 px-4 py-2.5">
          <span className="text-sm text-paper/85 flex items-center gap-2">
            <img src={`/items/${selectedItemId}.png`} alt="" className="h-5 w-5 object-contain" />
            {ITEMS.find((i) => i.id === selectedItemId)?.name}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                tapPulse(e.currentTarget);
                setCount(selectedItemId, Math.max(0, selectedCount - 1));
              }}
              disabled={selectedCount === 0}
              className="h-7 w-7 rounded-full bg-void/60 flex items-center justify-center text-paper hover:bg-void/80 disabled:opacity-40 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <PopIn key={selectedCount} className="text-stat font-bold text-paper w-4 text-center inline-block">
              {selectedCount}
            </PopIn>
            <button
              onClick={(e) => {
                tapPulse(e.currentTarget);
                setCount(selectedItemId, selectedCount + 1);
              }}
              className="h-7 w-7 rounded-full bg-void/60 flex items-center justify-center text-paper hover:bg-void/80 disabled:opacity-40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
