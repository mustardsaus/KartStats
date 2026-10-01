"use client";

import type { TransmissionMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { tapPulse } from "@/lib/animation";
import { ChevronLeft } from "lucide-react";

/** Step 3 of the loadout picker: Automatic or Manual. */
export function TransmissionPicker({
  kartName,
  onSelect,
  onBack,
}: {
  kartName: string;
  onSelect: (mode: TransmissionMode) => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-sm text-center mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-paper/60 hover:text-paper/85 mb-4 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>
      <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase mb-2">Step 3 of 3</p>
      <h3 className="font-display text-3xl sm:text-4xl text-paper tracking-wide mb-1 drop-shadow-lg">Transmission</h3>
      <p className="text-xs text-paper/50 mb-7">Driving the {kartName}</p>

      <div className="grid grid-cols-2 gap-3">
        {(["automatic", "manual"] as const).map((mode) => (
          <button
            key={mode}
            onClick={(e) => {
              tapPulse(e.currentTarget);
              onSelect(mode);
            }}
            className={cn(
              "rounded-xl border border-paper/20 bg-paper/10 py-8 font-display text-lg tracking-wide text-paper/85 hover:border-danger/50 hover:bg-danger/10 hover:text-paper transition-colors"
            )}
          >
            {mode === "automatic" ? "Automatic" : "Manual"}
          </button>
        ))}
      </div>
    </div>
  );
}
