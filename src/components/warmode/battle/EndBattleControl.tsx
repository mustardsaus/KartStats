"use client";

import { useState, useTransition } from "react";
import { abandonBattleAction, endBattleEarlyAction } from "@/app/war-mode/battle-actions";

/**
 * Admin-only "get me out of this" control for a battle already past the
 * waiting room — either the track-picker or the cockpit screen. Branches
 * on whether any races have actually been recorded: zero races cancels
 * the battle outright (abandonBattleAction — same as WaitingRoom's
 * "Cancel battle" link, just reachable from later stages too);
 * one-or-more races ends the season right now with whatever's been
 * played (endBattleEarlyAction), rather than either discarding real
 * results or forcing the admin to grind out the rest of the 32 races.
 */
export function EndBattleControl({
  seasonId,
  raceCount,
  isAdmin,
  onEnded,
}: {
  seasonId: string;
  raceCount: number;
  isAdmin: boolean;
  onEnded: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) return null;

  const handleEnd = () => {
    setError(null);
    startTransition(async () => {
      const result = raceCount === 0 ? await abandonBattleAction(seasonId) : await endBattleEarlyAction(seasonId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      onEnded();
    });
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-paper/40 hover:text-danger underline underline-offset-2 transition-colors"
      >
        End this battle
      </button>
    );
  }

  return (
    <div className="text-xs text-center max-w-xs">
      <p className="text-paper/70 mb-2">
        {raceCount === 0
          ? "Cancel this battle entirely?"
          : `End the season now at ${raceCount} race${raceCount === 1 ? "" : "s"}? Whoever's ahead is recorded as the winner.`}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleEnd}
          disabled={pending}
          className="text-danger font-semibold hover:underline disabled:opacity-60"
        >
          {pending ? "Ending…" : "Yes, end it"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-paper/40 hover:text-paper underline underline-offset-2 disabled:opacity-60"
        >
          Never mind
        </button>
      </div>
      {error && <p className="text-danger mt-2">{error}</p>}
    </div>
  );
}
