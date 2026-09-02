"use client";

import { tapPulse } from "@/lib/animation";
import { cn } from "@/lib/utils";

const POSITIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];

/**
 * A 1st-12th finishing-position grid for one player: two rows of six big
 * buttons (1st-6th, then 7th-12th), sized up from the original cramped
 * tiny-square grid to cut down on mis-taps, but kept compact and
 * horizontal rather than one long scrolling column — this lives on its
 * own dedicated results screen (see BattlePositionForm / RaceEntryForm),
 * with each player's grid stacked vertically below the other's.
 * Unselected buttons use a light paper-tinted fill (not a dark void
 * tint) so they read as buttons rather than dim cutouts against the
 * photo backdrop, and the ordinal labels use the site's Mario Kart
 * display face (the OTHER font file shipped in /fonts, "Mario Kart F2",
 * turned out to have a corrupted letter set — see the note in
 * globals.css — so this deliberately uses --font-display, not that
 * one). A tap plays a quick anime.js press pulse straight off the click
 * event's own element.
 */
export function PositionPicker({
  label,
  value,
  onChange,
  accent,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  accent: "adi" | "ren";
  disabled?: boolean;
}) {
  return (
    <div>
      <span className="block text-sm font-hud font-semibold text-paper/70 mb-3 uppercase tracking-wide text-center">
        {label}
      </span>
      <div className="grid grid-cols-6 gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={(e) => {
              tapPulse(e.currentTarget);
              onChange(p);
            }}
            className={cn(
              "h-14 sm:h-16 rounded-lg border font-display text-base sm:text-lg tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              value === p
                ? accent === "adi"
                  ? "border-transparent bg-adi text-bg shadow-lg shadow-adi/30"
                  : "border-transparent bg-ren text-void shadow-lg shadow-ren/30"
                : "border-paper/25 bg-paper/12 text-paper/80 hover:border-paper/40 hover:bg-paper/22 hover:text-paper"
            )}
          >
            {ORDINALS[p - 1]}
          </button>
        ))}
      </div>
    </div>
  );
}
