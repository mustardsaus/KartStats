"use client";

import type { ReactNode } from "react";
import type { Circuit } from "@/lib/types";
import { CircuitImage } from "@/components/circuits/CircuitImage";
import { WatercolorImage } from "@/components/media/WatercolorImage";
import { useIsDarkTheme } from "@/lib/hooks/useIsDarkTheme";
import { LiveLeaderboard } from "@/components/warmode/LiveLeaderboard";

/**
 * Shared full-bleed backdrop + persistent leaderboard for every Battle
 * Mode screen once both players have joined — the track picker and the
 * cockpit both render through this, as the SAME component instance at
 * the same position in BattleModeClient's returned tree, so React keeps
 * it mounted across the switch instead of tearing it down and rebuilding
 * it: the background photo and the live score never flash blank or reset
 * while an admin is picking the next track.
 *
 * `circuit` is the current/just-picked track; while one is still being
 * chosen there's nothing circuit-specific to show yet, so this falls
 * back to the same generic war-mode backdrop photo used elsewhere.
 */
export function BattleScreen({
  circuit,
  adiPoints,
  renPoints,
  guestEnabled = false,
  guestPoints = 0,
  children,
}: {
  circuit: Circuit | undefined;
  adiPoints: number;
  renPoints: number;
  guestEnabled?: boolean;
  guestPoints?: number;
  children: ReactNode;
}) {
  const isDark = useIsDarkTheme();

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen min-h-[85vh] overflow-hidden px-4 sm:px-6 py-6">
      <div className="absolute inset-0">
        <div className="absolute inset-0 animate-slow-drift">
          {circuit ? (
            // instant: this backdrop swaps on every round of a live battle —
            // skip the multi-second animated reveal, same reasoning as
            // WarModeClient's solo-mode backdrop.
            <CircuitImage circuit={circuit} className="absolute inset-0" instant />
          ) : (
            <WatercolorImage
              src="/war-mode-bg.jpg"
              alt=""
              className="absolute inset-0 h-full w-full"
              durationMs={4200}
              raw={isDark}
              eager
              instant
            />
          )}
        </div>
        <div className="absolute inset-0 bg-void/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-void/70 via-transparent to-void/35" />
      </div>

      <div className="relative z-10 mx-auto max-w-md space-y-6">
        <div className="flex justify-center">
          <LiveLeaderboard adiPoints={adiPoints} renPoints={renPoints} guestEnabled={guestEnabled} guestPoints={guestPoints} />
        </div>
        {children}
      </div>
    </div>
  );
}
