"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Swords, Smartphone, Trophy, Gamepad2 } from "lucide-react";
import { startSeasonAction } from "@/app/war-mode/actions";
import { engageBattleAction } from "@/app/war-mode/battle-actions";
import { popIn, tapPulse } from "@/lib/animation";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { PLAYERS } from "@/lib/data/points-mapping";
import type { RawSeason } from "@/lib/types";
import { ImmersiveSetupWizard } from "./immersive/ImmersiveSetupWizard";

/**
 * The "no active season" screen. Offers Manual (the original single-device
 * flow, unchanged) and Immersive (Dolphin-tracked) unconditionally, plus,
 * only when Battle Mode is actually configured (see isBattleModeAvailable
 * — it needs a live Supabase project with Realtime set up, so this
 * quietly disappears rather than offering a mode that can't go live), the
 * multi-device battle flow nested inside Manual. Immersive does NOT share
 * that gate: it runs fine against the local in-memory store too (see
 * useImmersiveRealtime's polling fallback), so `battleModeAvailable` below
 * only ever gates Battle-Mode-specific UI, never Immersive's.
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
  // Top-level Manual/Immersive choice (spec section 1). "none" shows both
  // options; picking one reveals that flow, with a way back to "none".
  // Manual's own content below (Solo/Dual Device) is completely unchanged
  // from before this choice existed — it just now sits behind one extra tap.
  const [topChoice, setTopChoice] = useState<"none" | "manual" | "immersive">("none");
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

  // Immersive renders as its own standalone flow (own padding/back button/
  // cancel), same spirit as JoinBattleForm/WaitingRoom sitting outside
  // BattleModeClient's wrapper — router.refresh() on completion is what
  // swaps this out for the live dashboard, once war-mode/page.tsx sees the
  // new active Immersive season.
  if (topChoice === "immersive") {
    return (
      <ImmersiveSetupWizard onCancel={() => setTopChoice("none")} onComplete={() => router.refresh()} />
    );
  }

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

      {topChoice === "none" && (
        <>
          <p className="text-text-dim mb-8">
            Start Season {seasonNumber}. Manual: pick the circuit, race it, then log what happened
            yourself. Immersive: Dolphin tracks everything automatically while you play.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={(e) => {
                tapPulse(e.currentTarget);
                setTopChoice("manual");
              }}
              className="rounded-xl bg-danger px-8 py-4 font-display text-lg tracking-widest text-paper hover:brightness-110 shadow-lg shadow-danger/30 transition-all"
            >
              MANUAL
            </button>
            {/* Unlike Battle Mode just below (gated on battleModeAvailable --
                it genuinely cannot work without a hosted Supabase project
                for cross-device Realtime), Immersive runs fine against the
                local in-memory store too -- useImmersiveRealtime falls back
                to a 4s poll when there's no real Realtime to subscribe to.
                So this button is never gated on Supabase being configured. */}
            <button
              onClick={(e) => {
                tapPulse(e.currentTarget);
                setTopChoice("immersive");
              }}
              className="rounded-xl border-2 border-danger/60 bg-transparent px-8 py-4 font-display text-lg tracking-widest text-text hover:border-danger hover:text-danger shadow-lg transition-all inline-flex items-center gap-2.5"
            >
              <Gamepad2 className="h-5 w-5" />
              IMMERSIVE
            </button>
          </div>
          <p className="text-xs text-text-faint mt-4">
            Immersive: live-tracked from Dolphin — positions, laps, and items update automatically
            as you race, with the circuit history, leaderboard, and race graphs shown live.
          </p>
        </>
      )}

      {topChoice === "manual" && (
        <>
          <p className="text-text-dim mb-8">
            Record all 32 races — pick the circuit, race it, then log what happened. Points and the
            leaderboard update automatically after every entry.
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

          <button
            onClick={() => setTopChoice("none")}
            disabled={pending}
            className="mt-4 text-xs text-text-faint hover:text-text underline underline-offset-2 disabled:opacity-60"
          >
            Back
          </button>
        </>
      )}

      {error && <p className="text-sm text-danger mt-4">{error}</p>}
    </div>
  );
}
