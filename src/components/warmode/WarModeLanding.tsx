"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Swords, Smartphone, Trophy } from "lucide-react";
import { startSeasonAction } from "@/app/war-mode/actions";
import { engageBattleAction } from "@/app/war-mode/battle-actions";
import { popIn, tapPulse } from "@/lib/animation";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { PLAYERS } from "@/lib/data/points-mapping";
import type { RawSeason } from "@/lib/types";

/**
 * The "no active season" screen. Offers the existing single-device solo
 * flow (unchanged) and, when Battle Mode is actually configured (see
 * isBattleModeAvailable — it needs a live Supabase project with Realtime
 * set up, so this quietly disappears rather than offering a mode that
 * can't go live), the new multi-device battle flow.
 */
export function WarModeLanding({
  seasonNumber,
  battleModeAvailable,
  justCompletedSeason,
}: {
  seasonNumber: number;
  battleModeAvailable: boolean;
  /**
   * The most recently finished season (solo or battle), if any — recapped
   * inline above the start buttons. See the comment in war-mode/page.tsx
   * for why this lives here instead of a client-side "just completed"
   * screen: the server action that finalizes the 32nd race revalidates
   * this route, and Next swaps straight to this landing page before any
   * client component's own local "just completed" state would ever
   * actually be rendered.
   */
  justCompletedSeason?: RawSeason | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"solo" | "battle" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askingDriverCount, setAskingDriverCount] = useState(false);
  const iconRef = useRef<HTMLElement>(null);

  useEffect(() => {
    popIn(iconRef.current);
  }, []);

  const handleStartSolo = () => {
    setError(null);
    setPendingAction("solo");
    startTransition(async () => {
      await startSeasonAction();
      router.refresh();
    });
  };

  const handleEngageBattle = (driverCount: 2 | 3) => {
    setError(null);
    setPendingAction("battle");
    startTransition(async () => {
      try {
        await engageBattleAction(driverCount);
        router.refresh();
      } catch {
        setError("Couldn't start a battle — try again in a moment.");
        setAskingDriverCount(false);
      }
    });
  };

  const winner = justCompletedSeason?.winnerId ?? null;
  const recapAccent =
    winner === "adi" ? "var(--color-adi)" : winner === "ren" ? "var(--color-ren)" : "var(--color-gold)";

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      {justCompletedSeason && (
        <div
          className="mb-10 rounded-2xl border p-6 text-center"
          style={{
            borderColor: `${recapAccent}55`,
            background: `linear-gradient(160deg, ${recapAccent}18, var(--color-surface) 60%)`,
          }}
        >
          <div className="inline-flex mb-2">
            <Trophy className="h-8 w-8" style={{ color: recapAccent }} />
          </div>
          <p className="font-hud text-xs font-bold tracking-[0.3em] text-text-faint uppercase mb-2">
            Season {justCompletedSeason.seasonNumber} Complete
          </p>
          {winner && winner !== "tie" ? (
            <div className="flex items-center justify-center gap-3 mb-1">
              <PlayerAvatar playerId={winner} size={44} />
              <h2 className="font-display text-xl sm:text-2xl tracking-wide" style={{ color: recapAccent }}>
                {PLAYERS[winner].name.toUpperCase()} WON
              </h2>
            </div>
          ) : (
            <h2 className="font-display text-xl sm:text-2xl tracking-wide text-gold mb-1">SEASON TIED</h2>
          )}
          <p className="text-stat text-2xl font-bold flex items-center justify-center gap-2">
            <span className={winner === "adi" ? "text-adi" : "text-text"}>{justCompletedSeason.adiFinalPoints}</span>
            <span className="text-text-faint text-base">—</span>
            <span className={winner === "ren" ? "text-ren" : "text-text"}>{justCompletedSeason.renFinalPoints}</span>
          </p>
        </div>
      )}

      <Swords ref={iconRef as React.Ref<SVGSVGElement>} className="h-10 w-10 text-danger mx-auto mb-4 animate-pulse" />
      <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-text mb-3">WAR MODE</h1>
      <p className="text-text-dim mb-8">
        Start Season {seasonNumber} and record all 32 races — pick the circuit, race it, then log
        what happened. Points and the leaderboard update automatically after every entry.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={(e) => {
            tapPulse(e.currentTarget);
            handleStartSolo();
          }}
          disabled={pending}
          className="rounded-xl bg-danger px-8 py-4 font-display text-lg tracking-widest text-paper hover:brightness-110 shadow-lg shadow-danger/30 transition-all disabled:opacity-60"
        >
          {pending && pendingAction === "solo" ? "STARTING…" : "SOLO DEVICE"}
        </button>

        {battleModeAvailable && !askingDriverCount && (
          <button
            onClick={(e) => {
              tapPulse(e.currentTarget);
              setAskingDriverCount(true);
            }}
            disabled={pending}
            className="rounded-xl border-2 border-danger/60 bg-transparent px-8 py-4 font-display text-lg tracking-widest text-text hover:border-danger hover:text-danger shadow-lg transition-all disabled:opacity-60 inline-flex items-center gap-2.5"
          >
            <Smartphone className="h-5 w-5" />
            DUAL DEVICE
          </button>
        )}
      </div>

      {battleModeAvailable && askingDriverCount && (
        <div className="mt-6 rounded-xl border border-border bg-surface px-6 py-5">
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">
            How many drivers?
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={(e) => {
                tapPulse(e.currentTarget);
                handleEngageBattle(2);
              }}
              disabled={pending}
              className="rounded-lg bg-danger px-5 py-2.5 font-hud text-sm font-bold tracking-wide text-paper hover:brightness-110 shadow-md shadow-danger/25 transition-all disabled:opacity-60"
            >
              {pending && pendingAction === "battle" ? "ENGAGING…" : "2 — Adi & Ren"}
            </button>
            <button
              onClick={(e) => {
                tapPulse(e.currentTarget);
                handleEngageBattle(3);
              }}
              disabled={pending}
              className="rounded-lg bg-danger px-5 py-2.5 font-hud text-sm font-bold tracking-wide text-paper hover:brightness-110 shadow-md shadow-danger/25 transition-all disabled:opacity-60"
            >
              {pending && pendingAction === "battle" ? "ENGAGING…" : "3 — add Prawns"}
            </button>
          </div>
          <button
            onClick={() => setAskingDriverCount(false)}
            disabled={pending}
            className="mt-3 text-xs text-text-faint hover:text-text underline underline-offset-2 disabled:opacity-60"
          >
            Never mind
          </button>
        </div>
      )}

      {battleModeAvailable && (
        <p className="text-xs text-text-faint mt-4">
          Battle mode: each player joins from their own phone with a code, one becomes admin, and
          blue shells and power-ups get tracked too.
        </p>
      )}

      {error && <p className="text-sm text-danger mt-4">{error}</p>}
    </div>
  );
}
