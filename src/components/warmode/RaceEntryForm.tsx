"use client";

import { useState } from "react";
import type { Circuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Flag, ChevronLeft } from "lucide-react";
import { PositionPicker } from "./PositionPicker";

/**
 * Second half of the War Mode per-race flow: the circuit is already fixed
 * (chosen and confirmed in CircuitPreviewPanel) — this only records what
 * actually happened once the race is over.
 */
export function RaceEntryForm({
  circuit,
  raceNumber,
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  circuit: Circuit;
  raceNumber: number;
  onSubmit: (input: { adiFinishingPosition: number; renFinishingPosition: number }) => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [adiPos, setAdiPos] = useState<number | null>(null);
  const [renPos, setRenPos] = useState<number | null>(null);

  const canSubmit = adiPos !== null && renPos !== null && !submitting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || adiPos === null || renPos === null) return;
    onSubmit({ adiFinishingPosition: adiPos, renFinishingPosition: renPos });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md text-center">
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="inline-flex items-center gap-1 text-xs text-paper/60 hover:text-paper/85 mb-5 disabled:opacity-40 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase flex items-center justify-center gap-2 mb-2">
        <Flag className="h-4 w-4" /> Race {raceNumber} of 32
      </p>
      <h3 className="font-display text-4xl sm:text-5xl text-paper tracking-wide mb-8 drop-shadow-lg">
        {circuit.name}
      </h3>

      <div className="space-y-10 mb-7">
        <PositionPicker label="Adi Finish" value={adiPos} onChange={setAdiPos} accent="adi" />
        <PositionPicker label="Ren Finish" value={renPos} onChange={setRenPos} accent="ren" />
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          "w-full max-w-xs mx-auto block rounded-xl py-4 font-display text-lg tracking-widest transition-all",
          canSubmit
            ? "bg-danger text-bg hover:brightness-110 active:scale-[0.99] shadow-lg shadow-danger/40"
            : "bg-void/15 text-paper/45 cursor-not-allowed"
        )}
      >
        {submitting ? "SUBMITTING…" : "SUBMIT RESULTS"}
      </button>
    </form>
  );
}
