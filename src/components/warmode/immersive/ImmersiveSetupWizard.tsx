"use client";

import { useState, useTransition } from "react";
import type { DisplayConfig, TransmissionMode } from "@/lib/types";
import {
  startImmersiveSeasonAction,
  setImmersiveSlotsAction,
  setImmersiveLoadoutAction,
} from "@/app/war-mode/immersive-actions";
import { CHARACTERS_BY_ID, getCharacterWeightClass } from "@/lib/data/characters";
import { VEHICLES_BY_ID } from "@/lib/data/karts";
import { PLAYERS } from "@/lib/data/points-mapping";
import { CharacterPicker } from "../battle/CharacterPicker";
import { KartPicker } from "../battle/KartPicker";
import { TransmissionPicker } from "../battle/TransmissionPicker";
import { tapPulse } from "@/lib/animation";
import { cn } from "@/lib/utils";
import { ChevronLeft, Loader2, Monitor, Smartphone } from "lucide-react";

type Step =
  | "count"
  | "display"
  | "assign"
  | "adi-character"
  | "adi-kart"
  | "adi-transmission"
  | "ren-character"
  | "ren-kart"
  | "ren-transmission"
  | "submitting";

interface Loadout {
  character: string | null;
  kart: string | null;
  transmission: TransmissionMode | null;
}

const EMPTY_LOADOUT: Loadout = { character: null, kart: null, transmission: null };

/**
 * The one-time Immersive setup flow, run once by whoever's setting up
 * the race: player count (locked to 2 — see the spec's "for now we only
 * built it for 2 players") → display config (one screen, or a second
 * device spectating too) → player assignment (which raw Dolphin slot is
 * Adi vs Ren, with a one-tap swap — the escape hatch for when the
 * tracker's slot 1/2 doesn't match who's actually sitting where) → each
 * player's season-long character/kart/transmission, reusing the exact
 * same CharacterPicker/KartPicker/TransmissionPicker Kart Kontrol already
 * built (just fixed for the whole season here instead of per-round).
 *
 * `onComplete` is called once the season actually exists server-side —
 * the caller (WarModeLanding) does router.refresh(), which naturally
 * swaps this wizard out for the live dashboard once war-mode/page.tsx
 * sees the new active Immersive season.
 */
export function ImmersiveSetupWizard({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [step, setStep] = useState<Step>("count");
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>("same-device");
  const [adiSlot, setAdiSlot] = useState<1 | 2>(1);
  const [adiLoadout, setAdiLoadout] = useState<Loadout>(EMPTY_LOADOUT);
  const [renLoadout, setRenLoadout] = useState<Loadout>(EMPTY_LOADOUT);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const renSlot: 1 | 2 = adiSlot === 1 ? 2 : 1;

  const finish = (finalRenLoadout: Loadout) => {
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
          setStep("ren-transmission");
          return;
        }

        const loadoutResult = await setImmersiveLoadoutAction(season.id, {
          adiCharacter: adiLoadout.character!,
          adiKart: adiLoadout.kart!,
          adiTransmission: adiLoadout.transmission!,
          renCharacter: finalRenLoadout.character!,
          renKart: finalRenLoadout.kart!,
          renTransmission: finalRenLoadout.transmission!,
        });
        if ("error" in loadoutResult && loadoutResult.error) {
          setError(loadoutResult.error);
          setStep("ren-transmission");
          return;
        }

        onComplete();
      } catch {
        setError("Couldn't start the Immersive season — try again in a moment.");
        setStep("ren-transmission");
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
        title="Player Assignment"
        subtitle="Which on-screen racer is which player? Swap if the tracker has them backwards."
        onBack={() => setStep("display")}
        onCancel={onCancel}
      >
        <div className="space-y-2.5 mb-5">
          <SlotRow label={PLAYERS.adi.name} accent="adi" slot={adiSlot} />
          <SlotRow label={PLAYERS.ren.name} accent="ren" slot={renSlot} />
        </div>
        <button
          onClick={(e) => {
            tapPulse(e.currentTarget);
            setAdiSlot(adiSlot === 1 ? 2 : 1);
          }}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-hud font-bold tracking-wide text-text-dim hover:text-text hover:border-border-strong transition-colors mb-5"
        >
          SWAP PLAYERS
        </button>
        <button
          onClick={(e) => {
            tapPulse(e.currentTarget);
            setStep("adi-character");
          }}
          className="w-full rounded-xl bg-danger px-6 py-3.5 font-display text-base tracking-widest text-paper hover:brightness-110 shadow-lg shadow-danger/30 transition-all"
        >
          CONTINUE
        </button>
      </StepShell>
    );
  }

  // --- loadout steps: Adi first, then Ren, reusing the Kart Kontrol pickers directly ---

  if (step === "adi-character") {
    return (
      <LoadoutIntro accent="adi" playerName={PLAYERS.adi.name}>
        <CharacterPicker accent="adi" onSelect={(id) => { setAdiLoadout({ ...adiLoadout, character: id }); setStep("adi-kart"); }} />
      </LoadoutIntro>
    );
  }
  if (step === "adi-kart" && adiLoadout.character) {
    const weightClass = getCharacterWeightClass(adiLoadout.character);
    if (!weightClass) {
      setStep("adi-character");
      return null;
    }
    return (
      <LoadoutIntro accent="adi" playerName={PLAYERS.adi.name}>
        <KartPicker
          characterId={adiLoadout.character}
          characterName={CHARACTERS_BY_ID.get(adiLoadout.character)?.name ?? adiLoadout.character}
          weightClass={weightClass}
          accent="adi"
          onBack={() => setStep("adi-character")}
          onSelect={(id) => { setAdiLoadout({ ...adiLoadout, kart: id }); setStep("adi-transmission"); }}
        />
      </LoadoutIntro>
    );
  }
  if (step === "adi-transmission" && adiLoadout.kart) {
    return (
      <LoadoutIntro accent="adi" playerName={PLAYERS.adi.name}>
        <TransmissionPicker
          kartName={VEHICLES_BY_ID.get(adiLoadout.kart)?.name ?? adiLoadout.kart}
          onBack={() => setStep("adi-kart")}
          onSelect={(transmission) => { setAdiLoadout({ ...adiLoadout, transmission }); setStep("ren-character"); }}
        />
      </LoadoutIntro>
    );
  }

  if (step === "ren-character") {
    return (
      <LoadoutIntro accent="ren" playerName={PLAYERS.ren.name}>
        <CharacterPicker accent="ren" onSelect={(id) => { setRenLoadout({ ...renLoadout, character: id }); setStep("ren-kart"); }} />
      </LoadoutIntro>
    );
  }
  if (step === "ren-kart" && renLoadout.character) {
    const weightClass = getCharacterWeightClass(renLoadout.character);
    if (!weightClass) {
      setStep("ren-character");
      return null;
    }
    return (
      <LoadoutIntro accent="ren" playerName={PLAYERS.ren.name}>
        <KartPicker
          characterId={renLoadout.character}
          characterName={CHARACTERS_BY_ID.get(renLoadout.character)?.name ?? renLoadout.character}
          weightClass={weightClass}
          accent="ren"
          onBack={() => setStep("ren-character")}
          onSelect={(id) => { setRenLoadout({ ...renLoadout, kart: id }); setStep("ren-transmission"); }}
        />
      </LoadoutIntro>
    );
  }
  if (step === "ren-transmission" && renLoadout.kart) {
    return (
      <LoadoutIntro accent="ren" playerName={PLAYERS.ren.name}>
        <TransmissionPicker
          kartName={VEHICLES_BY_ID.get(renLoadout.kart)?.name ?? renLoadout.kart}
          onBack={() => setStep("ren-kart")}
          onSelect={(transmission) => finish({ ...renLoadout, transmission })}
        />
        {error && <p className="text-sm text-danger mt-4">{error}</p>}
      </LoadoutIntro>
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

function SlotRow({ label, accent, slot }: { label: string; accent: "adi" | "ren"; slot: 1 | 2 }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm",
        accent === "adi" ? "border-adi/40 bg-adi/10" : "border-ren/40 bg-ren/10"
      )}
    >
      <span className={cn("font-medium", accent === "adi" ? "text-adi" : "text-ren")}>{label}</span>
      <span className="font-hud text-xs font-bold tracking-wide text-text-faint">TRACKED PLAYER {slot}</span>
    </div>
  );
}

/** The Kart Kontrol pickers render on a dark backdrop (see Cockpit/BattleScreen) — this gives the wizard's loadout steps the same dark surface instead of the light StepShell above. */
function LoadoutIntro({ accent, playerName, children }: { accent: "adi" | "ren"; playerName: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-void px-4 sm:px-8 py-10">
      <p className={cn("font-hud text-xs font-bold tracking-[0.25em] uppercase mb-4", accent === "adi" ? "text-adi" : "text-ren")}>
        {playerName}&rsquo;s loadout
      </p>
      {children}
    </div>
  );
}
