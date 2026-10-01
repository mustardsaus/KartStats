"use client";

import { useMemo, useState, useTransition } from "react";
import type { PlayerId, RawRace, TransmissionMode } from "@/lib/types";
import { CHARACTERS_BY_ID, getCharacterWeightClass } from "@/lib/data/characters";
import { VEHICLES_BY_ID } from "@/lib/data/karts";
import { setLoadoutAction } from "@/app/war-mode/battle-actions";
import { CharacterPicker } from "./CharacterPicker";
import { KartPicker } from "./KartPicker";
import { TransmissionPicker } from "./TransmissionPicker";
import { tapPulse } from "@/lib/animation";
import { Loader2 } from "lucide-react";

type Step = "previous" | "character" | "kart" | "transmission" | "submitting";

/**
 * The full Kart Kontrol pre-race gate for ONE player's own device: before
 * they can reach the normal cockpit (track preview, blue shells, "race
 * concluded?"), they set their own character, kart, and transmission for
 * this round — never the opponent's, mirroring how BattlePositionForm only
 * ever lets a device edit its own player's result. Cockpit decides WHEN to
 * mount this (only while this round still has this player's loadout
 * unset); once setLoadoutAction succeeds, onDone hands back to Cockpit,
 * which re-renders from the next realtime refresh with this player's three
 * fields filled in.
 *
 * "Use previous setup" looks at this player's own most recent race (by
 * raceNumber) that actually has a character recorded — i.e. the last time
 * they went through this picker — and offers it as a one-tap shortcut
 * instead of re-clicking through all three steps every single race.
 */
export function LoadoutSetup({
  seasonId,
  roundId,
  myPlayerId,
  races,
  onDone,
}: {
  seasonId: string;
  roundId: string;
  myPlayerId: PlayerId;
  races: RawRace[];
  onDone: () => void;
}) {
  const previous = useMemo(() => {
    const mine = [...races]
      .sort((a, b) => b.raceNumber - a.raceNumber)
      .find((r) => (myPlayerId === "adi" ? r.adiCharacter : r.renCharacter));
    if (!mine) return null;
    const character = myPlayerId === "adi" ? mine.adiCharacter : mine.renCharacter;
    const kart = myPlayerId === "adi" ? mine.adiKart : mine.renKart;
    const transmission = myPlayerId === "adi" ? mine.adiTransmission : mine.renTransmission;
    if (!character || !kart || !transmission) return null;
    return { character, kart, transmission };
  }, [races, myPlayerId]);

  const [step, setStep] = useState<Step>(previous ? "previous" : "character");
  const [character, setCharacter] = useState<string | null>(null);
  const [kart, setKart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const accent: "adi" | "ren" = myPlayerId === "adi" ? "adi" : "ren";

  const submit = (loadout: { character: string; kart: string; transmission: TransmissionMode }) => {
    setStep("submitting");
    setError(null);
    startTransition(async () => {
      const result = await setLoadoutAction(seasonId, roundId, myPlayerId, loadout);
      if ("error" in result && result.error) {
        setError(result.error);
        setStep("character");
        return;
      }
      onDone();
    });
  };

  if (step === "previous" && previous) {
    const characterName = CHARACTERS_BY_ID.get(previous.character)?.name ?? previous.character;
    const kartName = VEHICLES_BY_ID.get(previous.kart)?.name ?? previous.kart;
    return (
      <div className="w-full max-w-sm text-center mx-auto">
        <h3 className="font-display text-3xl sm:text-4xl text-paper tracking-wide mb-2 drop-shadow-lg">Your loadout</h3>
        <p className="text-sm text-paper/60 mb-7">Keep what you used last race, or set up something new.</p>

        <button
          onClick={(e) => {
            tapPulse(e.currentTarget);
            submit(previous);
          }}
          className="w-full rounded-xl border border-paper/20 bg-paper/10 px-5 py-4 text-left hover:border-danger/50 hover:bg-danger/10 transition-colors mb-3"
        >
          <p className="font-hud text-[11px] font-bold tracking-[0.2em] text-paper/50 uppercase mb-1">Use previous setup</p>
          <p className="font-display text-lg text-paper">
            {characterName} &middot; {kartName}
          </p>
          <p className="text-xs text-paper/50 mt-0.5 capitalize">{previous.transmission}</p>
        </button>

        <button
          onClick={() => setStep("character")}
          className="text-sm text-paper/60 hover:text-paper underline underline-offset-2"
        >
          Set up a new loadout
        </button>
        {error && <p className="text-sm text-danger mt-4">{error}</p>}
      </div>
    );
  }

  if (step === "character") {
    return (
      <div>
        <CharacterPicker
          accent={accent}
          onSelect={(id) => {
            setCharacter(id);
            setStep("kart");
          }}
        />
        {error && <p className="text-sm text-danger mt-4 text-center">{error}</p>}
      </div>
    );
  }

  if (step === "kart" && character) {
    const weightClass = getCharacterWeightClass(character);
    const characterName = CHARACTERS_BY_ID.get(character)?.name ?? character;
    if (!weightClass) {
      // Defensive — every CHARACTERS entry has a weightClass, so this
      // should be unreachable, but falling back to the character step
      // beats a dead end if the roster data is ever edited inconsistently.
      setStep("character");
      return null;
    }
    return (
      <KartPicker
        characterName={characterName}
        weightClass={weightClass}
        onBack={() => setStep("character")}
        onSelect={(id) => {
          setKart(id);
          setStep("transmission");
        }}
      />
    );
  }

  if (step === "transmission" && kart) {
    const kartName = VEHICLES_BY_ID.get(kart)?.name ?? kart;
    return (
      <TransmissionPicker
        kartName={kartName}
        onBack={() => setStep("kart")}
        onSelect={(transmission) => {
          if (!character) return;
          submit({ character, kart, transmission });
        }}
      />
    );
  }

  // step === "submitting"
  return (
    <div className="text-center py-16">
      <Loader2 className="h-8 w-8 text-danger mx-auto mb-4 animate-spin" />
      <p className="text-paper/70 text-sm">Locking in your loadout…</p>
    </div>
  );
}
