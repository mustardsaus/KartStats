"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import type { WeightClass } from "@/lib/types";
import { getVehiclesForWeightClass } from "@/lib/data/karts";
import { cn } from "@/lib/utils";
import { tapPulse } from "@/lib/animation";
import { CharacterIcon } from "./CharacterIcon";
import { ChevronLeft, ChevronRight, Bike as BikeIcon, CarFront } from "lucide-react";

const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 400;

/**
 * Step 2: a side-swipe kart/bike selector — one vehicle on screen at a
 * time, cycle with a swipe or the arrow buttons, confirm with "Select" —
 * closer to a classic console character-select screen than the old
 * search-a-flat-list picker. Still only ever shows vehicles actually
 * available to the character picked in Step 1 (see lib/data/karts.ts).
 *
 * No licensed vehicle art is bundled (same reason as CharacterIcon), so
 * the "image" is a clean placeholder: a big tinted card with a bike/kart
 * glyph standing in for the real thing, not a broken <img>.
 */
export function KartPicker({
  characterId,
  characterName,
  weightClass,
  accent,
  onSelect,
  onBack,
}: {
  characterId: string;
  characterName: string;
  weightClass: WeightClass;
  accent: "adi" | "ren";
  onSelect: (kartId: string) => void;
  onBack: () => void;
}) {
  // LoadoutSetup only ever renders KartPicker while its own step === "kart",
  // so a character change (back to Step 1, pick a different one, forward
  // again) unmounts and remounts this component fresh rather than handing
  // it a new weightClass in place — plain useState(0) below is enough,
  // no effect needed to reset it.
  const vehicles = useMemo(() => getVehiclesForWeightClass(weightClass), [weightClass]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const vehicle = vehicles[index];

  const go = (delta: 1 | -1) => {
    setDirection(delta);
    setIndex((i) => (i + delta + vehicles.length) % vehicles.length);
  };

  // Arrow-key support for desktop testing/play — scoped to this
  // component's lifetime only.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) go(1);
    else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) go(-1);
  };

  if (!vehicle) return null;

  const Icon = vehicle.type === "bike" ? BikeIcon : CarFront;

  return (
    <div className="w-full max-w-sm text-center mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-paper/60 hover:text-paper/85 mb-4 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>
      <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase mb-2">Step 2 of 3</p>
      <h3 className="font-display text-3xl sm:text-4xl text-paper tracking-wide mb-1 drop-shadow-lg">Pick a kart</h3>
      <p className="flex items-center justify-center gap-1.5 text-xs text-paper/50 mb-6">
        <CharacterIcon characterId={characterId} accent={accent} />
        Available to {characterName} &middot; {weightClass} class
      </p>

      <div className="flex items-center justify-center gap-2 sm:gap-4">
        <button
          onClick={(e) => {
            tapPulse(e.currentTarget);
            go(-1);
          }}
          aria-label="Previous vehicle"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-paper/20 bg-void/40 text-paper/70 hover:border-danger/50 hover:text-paper transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="relative h-56 w-48 overflow-hidden">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={vehicle.id}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={handleDragEnd}
              initial={{ x: direction > 0 ? 70 : -70, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction > 0 ? -70 : 70, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border cursor-grab active:cursor-grabbing",
                accent === "adi" ? "border-adi/30 bg-gradient-to-b from-adi/20 to-void/60" : "border-ren/30 bg-gradient-to-b from-ren/20 to-void/60"
              )}
            >
              <Icon className={cn("h-16 w-16", accent === "adi" ? "text-adi" : "text-ren")} strokeWidth={1.5} />
              <div className="text-center px-3">
                <p className="font-display text-base text-paper leading-tight">{vehicle.name}</p>
                <p className="text-[10px] font-hud font-bold tracking-[0.2em] text-paper/45 uppercase mt-1">
                  {vehicle.type === "bike" ? "Bike" : "Kart"}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          onClick={(e) => {
            tapPulse(e.currentTarget);
            go(1);
          }}
          aria-label="Next vehicle"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-paper/20 bg-void/40 text-paper/70 hover:border-danger/50 hover:text-paper transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <p className="text-xs text-paper/40 mt-4 mb-6 tabular-nums">
        {index + 1} / {vehicles.length}
      </p>

      <button
        onClick={(e) => {
          tapPulse(e.currentTarget);
          onSelect(vehicle.id);
        }}
        className="w-full rounded-xl bg-danger py-3.5 font-hud text-sm font-bold tracking-wide text-bg hover:bg-danger/90 transition-colors"
      >
        Select {vehicle.name}
      </button>
    </div>
  );
}
