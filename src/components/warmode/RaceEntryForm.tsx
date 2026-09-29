"use client";

import { useState } from "react";
import type { Circuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Flag, ChevronLeft, Check } from "lucide-react";
import { PositionPicker, ORDINALS } from "./PositionPicker";

type Phase = "pick" | "confirm";

/**
 * Second half of the War Mode per-race flow: the circuit is already fixed
 * (chosen and confirmed in CircuitPreviewPanel) — this only records what
 * actually happened once the race is over.
 *
 * Picking a position and hitting submit used to write straight to the
 * season — a single mis-tap on the 1-12 grid silently became the
 * permanent result for that race, with no way to notice until someone
 * went back through 32 races later to spot it. This now inserts a review
 * step between picking and writing: "REVIEW RESULTS" just moves to a
 * confirm screen restating both picks in plain text; only "CONFIRM
 * RESULTS" on that screen actually calls onSubmit. "Edit" goes back to
 * the picker with both selections still intact.
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
  const [phase, setPhase] = useState<Phase>("pick");

  const canReview = adiPos !== null && renPos !== null;

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canReview) return;
    setPhase("confirm");
  };

  const handleConfirm = () => {
    if (adiPos === null || renPos === null || submitting) return;
    onSubmit({ adiFinishingPosition: adiPos, renFinishingPosition: renPos });
  };

  if (phase === "confirm" && adiPos !== null && renPos !== null) {
    return (
      <div className="w-full max-w-md text-center">
        <button
          type="button"
          onClick={() => setPhase("pick")}
          disabled={submitting}
          className="inline-flex items-center gap-1 text-xs text-paper/60 hover:text-paper/85 mb-5 disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Edit
        </button>

        <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase flex items-center justify-center gap-2 mb-2">
          <Flag className="h-4 w-4" /> Race {raceNumber} of 32
        </p>
        <h3 className="font-display text-4xl sm:text-5xl text-paper tracking-wide mb-2 drop-shadow-lg">
          {circuit.name}
        </h3>
        <p className="text-sm text-paper/60 mb-8">Double-check before this locks in — it writes straight to the season.</p>

        <div className="space-y-4 mb-9">
          <div className="flex items-center justify-between rounded-xl border border-adi/40 bg-adi/10 px-5 py-4">
            <span className="font-hud text-sm font-semibold text-paper/80 uppercase tracking-wide">Adi Finish</span>
            <span className="font-display text-3xl text-adi tracking-wide">{ORDINALS[adiPos - 1]}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-ren/40 bg-ren/10 px-5 py-4">
            <span className="font-hud text-sm font-semibold text-paper/80 uppercase tracking-wide">Ren Finish</span>
            <span className="font-display text-3xl text-ren tracking-wide">{ORDINALS[renPos - 1]}</span>
          </div>
        </div>

        {error && <p className="text-sm text-danger mb-4">{error}</p>}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={cn(
            "w-full max-w-xs mx-auto flex items-center justify-center gap-2 rounded-xl py-4 font-display text-lg tracking-widest transition-all",
            !submitting
              ? "bg-danger text-bg hover:brightness-110 active:scale-[0.99] shadow-lg shadow-danger/40"
              : "bg-void/15 text-paper/45 cursor-not-allowed"
          )}
        >
          <Check className="h-5 w-5" />
          {submitting ? "SUBMITTING…" : "CONFIRM RESULTS"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleReview} className="w-full max-w-md text-center">
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

      <button
        type="submit"
        disabled={!canReview}
        className={cn(
          "w-full max-w-xs mx-auto block rounded-xl py-4 font-display text-lg tracking-widest transition-all",
          canReview
            ? "bg-danger text-bg hover:brightness-110 active:scale-[0.99] shadow-lg shadow-danger/40"
            : "bg-void/15 text-paper/45 cursor-not-allowed"
        )}
      >
        REVIEW RESULTS
      </button>
    </form>
  );
}
