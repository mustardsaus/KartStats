"use client";

import type { Circuit } from "@/lib/types";
import { CircuitPicker } from "@/components/warmode/CircuitPicker";
import { Loader2 } from "lucide-react";

/**
 * Shown once both players have joined and no round is currently open.
 * The admin picks the next track (reuses the existing solo-mode
 * CircuitPicker as-is); everyone else sees a waiting placeholder. The
 * backdrop and leaderboard aren't this component's concern — the parent
 * (BattleModeClient) renders this inside the shared BattleScreen wrapper.
 */
export function TrackPicker({
  circuits,
  raceNumber,
  isAdmin,
  adminName,
  onSelect,
  pending,
}: {
  circuits: Circuit[];
  raceNumber: number;
  isAdmin: boolean;
  adminName: string;
  onSelect: (circuitId: string) => void;
  pending: boolean;
}) {
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20 text-center">
        <Loader2 className="h-8 w-8 text-danger mx-auto mb-4 animate-spin" />
        <h1 className="font-display text-2xl tracking-wide text-text mb-2">Waiting on {adminName}</h1>
        <p className="text-text-dim text-sm">They&rsquo;re picking the track for race {raceNumber}.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh] py-10">
      {pending ? (
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-danger mx-auto mb-4 animate-spin" />
          <p className="text-paper/70 text-sm">Loading the track…</p>
        </div>
      ) : (
        <CircuitPicker circuits={circuits} raceNumber={raceNumber} onSelect={onSelect} />
      )}
    </div>
  );
}
