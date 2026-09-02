"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { DriverId, RawSeason } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { joinBattleAction } from "@/app/war-mode/battle-actions";
import { slideIn, tapPulse } from "@/lib/animation";
import { Swords } from "lucide-react";

export interface BattleIdentity {
  playerId: DriverId;
  seasonId: string;
  battleCode: string;
}

/**
 * "A battle has been engaged" — pick your name and enter the code. Any
 * device landing on /war-mode while a battle season is active sees this
 * (the code isn't strictly needed to locate the season — there's only
 * ever one active season, server-side — but re-typing it is a small,
 * deliberate confirmation step, and catches a stale/mistyped join).
 */
export function JoinBattleForm({ season, onJoined }: { season: RawSeason; onJoined: (identity: BattleIdentity) => void }) {
  const [playerId, setPlayerId] = useState<DriverId | "">("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const screenRef = useRef<HTMLDivElement>(null);

  // This screen (and WaitingRoom) sit outside BattleModeClient's own
  // screenRef slide — they render before that wrapper even mounts — so
  // each animates its own entrance instead of relying on the parent.
  useEffect(() => {
    slideIn(screenRef.current, -28);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId) {
      setError("Pick who you are first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await joinBattleAction(code, playerId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("season" in result && result.season) {
        onJoined({ playerId, seasonId: result.season.id, battleCode: result.season.battleCode ?? season.battleCode ?? "" });
      }
    });
  };

  return (
    <div ref={screenRef} className="mx-auto max-w-sm px-4 py-20 text-center">
      <Swords className="h-9 w-9 text-danger mx-auto mb-4 animate-pulse" />
      <h1 className="font-display text-2xl sm:text-3xl tracking-wide text-text mb-2">A battle has been engaged</h1>
      <p className="text-text-dim text-sm mb-1">Season {season.seasonNumber} — join in to start recording your side.</p>
      {season.battleCode && (
        <p className="text-xs text-text-faint mb-8">
          Code:{" "}
          <span className="text-stat font-bold text-text tracking-[0.2em]">{season.battleCode}</span>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div>
          <label className="block text-xs font-hud font-bold tracking-[0.2em] text-text-faint uppercase mb-1.5">
            Who are you?
          </label>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value as DriverId)}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-danger/50"
          >
            <option value="" disabled>
              Choose your name…
            </option>
            <option value="adi">{PLAYERS.adi.name}</option>
            <option value="ren">{PLAYERS.ren.name}</option>
            {season.guestEnabled && <option value="guest">Prawns</option>}
          </select>
        </div>

        <div>
          <label className="block text-xs font-hud font-bold tracking-[0.2em] text-text-faint uppercase mb-1.5">
            Battle code
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. XK3P9"
            autoCapitalize="characters"
            autoComplete="off"
            className="text-stat w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm tracking-[0.2em] text-text placeholder:tracking-normal placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-danger/50"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          onClick={(e) => tapPulse(e.currentTarget)}
          className="w-full rounded-xl bg-danger px-6 py-3.5 font-display text-base tracking-widest text-paper hover:brightness-110 shadow-lg shadow-danger/30 transition-all disabled:opacity-60"
        >
          {pending ? "JOINING…" : "JOIN BATTLE"}
        </button>
      </form>
    </div>
  );
}
