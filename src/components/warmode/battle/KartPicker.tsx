"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WeightClass } from "@/lib/types";
import { getVehiclesForWeightClass } from "@/lib/data/karts";
import { cn } from "@/lib/utils";
import { staggerIn, tapPulse } from "@/lib/animation";
import { ChevronLeft } from "lucide-react";

/**
 * Step 2: pick a kart — but only from the vehicles actually available to
 * the character picked in Step 1 (see lib/data/karts.ts). Never shows the
 * full 36-vehicle roster; this is the whole point of a two-step picker
 * instead of one flat list.
 */
export function KartPicker({
  characterName,
  weightClass,
  onSelect,
  onBack,
}: {
  characterName: string;
  weightClass: WeightClass;
  onSelect: (kartId: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const vehicles = useMemo(() => getVehiclesForWeightClass(weightClass), [weightClass]);
  const karts = useMemo(() => vehicles.filter((v) => v.type === "kart"), [vehicles]);
  const bikes = useMemo(() => vehicles.filter((v) => v.type === "bike"), [vehicles]);

  const matches = (name: string) => !query.trim() || name.toLowerCase().includes(query.trim().toLowerCase());

  useEffect(() => {
    staggerIn(listRef.current);
  }, [query]);

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
      <p className="text-xs text-paper/50 mb-6">
        Available to {characterName} &middot; {weightClass} class
      </p>

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search karts & bikes…"
        className="w-full rounded-lg border border-paper/20 bg-void/50 backdrop-blur-sm px-3.5 py-2.5 text-sm text-paper placeholder:text-paper/45 focus:outline-none focus:ring-2 focus:ring-danger/50 mb-4"
      />

      <div ref={listRef} className="max-h-80 overflow-y-auto rounded-lg border border-paper/15 bg-void/40 backdrop-blur-sm">
        <VehicleGroup label="Karts" items={karts} matches={matches} onSelect={onSelect} />
        <VehicleGroup label="Bikes" items={bikes} matches={matches} onSelect={onSelect} />
      </div>
    </div>
  );
}

function VehicleGroup({
  label,
  items,
  matches,
  onSelect,
}: {
  label: string;
  items: { id: string; name: string }[];
  matches: (name: string) => boolean;
  onSelect: (id: string) => void;
}) {
  const visible = items.filter((v) => matches(v.name));
  if (visible.length === 0) return null;
  return (
    <div>
      <p className="sticky top-0 bg-void/80 backdrop-blur-sm px-4 py-1.5 text-left font-hud text-[11px] font-bold tracking-[0.2em] text-paper/50 uppercase">
        {label}
      </p>
      <div className="divide-y divide-paper/10">
        {visible.map((v) => (
          <button
            key={v.id}
            data-stagger-item
            onClick={(e) => {
              tapPulse(e.currentTarget);
              onSelect(v.id);
            }}
            className={cn(
              "block w-full px-4 py-2.5 text-left text-sm text-paper/90 hover:bg-void/15 hover:text-paper transition-colors"
            )}
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
