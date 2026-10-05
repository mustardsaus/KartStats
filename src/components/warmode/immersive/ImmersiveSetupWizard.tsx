"use client";

import { useState, useTransition } from "react";
import type { DisplayConfig } from "@/lib/types";
import { startImmersiveSeasonAction, setImmersiveSlotsAction } from "@/app/war-mode/immersive-actions";
import { PLAYERS } from "@/lib/data/points-mapping";
import { tapPulse } from "@/lib/animation";
import { cn } from "@/lib/utils";
import { ChevronLeft, Loader2, Monitor, Smartphone } from "lucide-react";

type Step = "count" | "display" | "assign" | "submitting";

/**
 * The one-time Immersive setup flow: player count (locked to 2 -- see the
 * spec's "for now we only built it for 2 players") -> display config (one
 * screen, or a second device spectating too) -> "are you Player 1 or
 * Player 2?" (which raw Dolphin slot is Adi vs Ren -- the tracker's own
 * slot order isn't guaranteed to match who's actually sitting where, so
 * this is asked directly rather than guessed).
 *
 * No loadout step any more -- character/kart used to be picked here for
 * the whole season, but the Dolphin tracker now reads them itself from
 * the first race and the server locks them in once (see
 * lib/telemetry/finalize.ts), the same "detect once, never changes for
 * the season" rule Battle Mode's Kart Kontrol applies per-round instead.
 * Transmission mode isn't tracked for Immersive at all -- not worth
 * reading out of memory.
 *
 * `onComplete` is called once the season actually exists server-side --
 * the caller (WarModeLanding) does router.refresh(), which naturally
 * swaps this wizard out for the live dashboard once war-mode/page.tsx
 * sees the new active Immersive season.
 */
export function ImmersiveSetupWizard({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<Step>("count");
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>("same-device");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const assign = (adiSlot: 1 | 2) => {
    const renSlot: 1 | 2 = adiSlot === 1 ? 2 : 1;
    setStep("submitting");
    setError(null);
    startTransition(async () => {
      try {
        // startImmersiveSeasonAction never returns an error shape (same as
        // engageBattleAction/startSeasonAction) -- a thrown exception is
        // caught below instead.
        const { season } = await startImmersiveSeasonAction(displayConfig);

        const slotsResult = await setImmersiveSlotsAction(season.id, adiSlot, renSlot);
        if ("error" in slotsResult && slotsResult.error) {
          setError(slotsResult.error);
          setStep("assign");
          return;
        }

        onComplete();
      } catch {
        setError("Couldn't start the Immersive season — try again in a moment.");
        setStep("assign");
      }
    });
  };

  if (step === "count") {
    return (
      <StepShell title="How many players?" subtitle="Immersive mode only supports 2 right now." onCancel={onCancel}>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={(e) => {
              tapPulse(e.currentTarget);
              setStep("display");
            }}
            className="rounded-xl bg-danger px-5 py-6 font-display text-lg tracking-wide text-paper hover:brightness-110 shadow-lg shadow-danger/25 transition-all"
          >
            2 — Adi &amp; Ren
          </button>
          <button
            disabled
            title="Not built yet"
            className="rounded-xl border border-border bg-surface px-5 py-6 font-display text-lg tracking-wide text-text-faint opacity-50 cursor-not-allowed"
          >
            3+
          </button>
        </div>
      </StepShell>
    );
  }

  if (step === "display") {
    return (
      <StepShell
        title="How are you watching?"
        subtitle="Same screen for both players, or a second device spectating the live dashboard too."
        onBack={() => setStep("count")}
        onCancel={onCancel}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={(e) => {
              tapPulse(e.currentTarget);
              setDisplayConfig("same-device");
              setStep("assign");
            }}
            className="flex flex-col items-center gap-2 rounded-xl bg-danger px-5 py-6 font-display text-base tracking-wide text-paper hover:brightness-110 shadow-lg shadow-danger/25 transition-all"
          >
            <Monitor className="h-6 w-6" />
            Same Device
          </button>
          <button
            onClick={(e) => {
              tapPulse(e.currentTarget);
              setDisplayConfig("dual-device");
              setStep("assign");
            }}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-danger/60 bg-transparent px-5 py-6 font-display text-base tracking-wide text-text hover:border-danger hover:text-danger shadow-lg transition-all"
          >
            <Smartphone className="h-6 w-6" />
            Dual Device
          </button>
        </div>
      </StepShell>
    );
  }

  if (step === "assign") {
    return (
      <StepShell
        title="Are you Player 1 or Player 2?"
        subtitle="Whichever on-screen racer slot each of you is actually sitting at — tap the player who's at Player 1."
        onBack={() => setStep("display")}
        onCancel={onCancel}
      >
        <div className="grid grid-cols-2 gap-3 mb-2">
          <PlayerSlotButton accent="adi" label={PLAYERS.adi.name} onClick={(e) => { tapPulse(e.currentTarget); assign(1); }} />
          <PlayerSlotButton accent="ren" label={PLAYERS.ren.name} onClick={(e) => { tapPulse(e.currentTarget); assign(2); }} />
        </div>
        <p className="text-xs text-text-faint">Whoever you tap is Player 1; the other is Player 2.</p>
        {error && <p className="text-sm text-danger mt-4">{error}</p>}
      </StepShell>
    );
  }

  // step === "submitting"
  return (
    <div className="text-center py-16">
      <Loader2 className="h-8 w-8 text-danger mx-auto mb-4 animate-spin" />
      <p className="text-text-dim text-sm">Starting the Immersive season…</p>
    </div>
  );
}

function StepShell({
  title,
  subtitle,
  onBack,
  onCancel,
  children,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center">
      {onBack ? (
        <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text mb-4 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
      ) : (
        <div className="h-5" />
      )}
      <h2 className="font-display text-2xl sm:text-3xl tracking-wide text-text mb-2">{title}</h2>
      <p className="text-text-dim text-sm mb-7">{subtitle}</p>
      {children}
      <button onClick={onCancel} className="mt-6 text-xs text-text-faint hover:text-text underline underline-offset-2">
        Never mind
      </button>
    </div>
  );
}

function PlayerSlotButton({
  accent,
  label,
  onClick,
}: {
  accent: "adi" | "ren";
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-6 font-display text-lg tracking-wide shadow-lg transition-all",
        accent === "adi"
          ? "border-adi/60 bg-adi/10 text-adi hover:border-adi hover:bg-adi/20"
          : "border-ren/60 bg-ren/10 text-ren hover:border-ren hover:bg-ren/20"
      )}
    >
      {label}
      <span className="font-hud text-[10px] font-bold tracking-[0.2em] text-text-faint uppercase">Is Player 1</span>
    </button>
  );
}
