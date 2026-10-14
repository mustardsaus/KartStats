"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CHARACTERS, getCharacterWeightClass } from "@/lib/data/characters";
import { getVehiclesForWeightClass } from "@/lib/data/karts";
import { CharacterIcon } from "@/components/warmode/battle/CharacterIcon";
import { VehicleIcon } from "@/components/warmode/battle/VehicleIcon";
import { cn } from "@/lib/utils";

/**
 * The Playbook "counter" — two independently scrollable strips (character,
 * then kart) you roll through to assemble a build, rather than a dropdown.
 * No carousel library is installed anywhere in this codebase, so this is
 * plain CSS scroll-snap (snap-x/snap-center) plus prev/next buttons that
 * scroll by one card width — same dependency-free approach as every other
 * horizontal-scroll list already in the app (overflow-x-auto tables).
 *
 * The kart row is ALWAYS re-filtered to the selected character's weight
 * class via getVehiclesForWeightClass (the same gate Battle Mode's
 * LoadoutSetup uses) — an illegal character+kart pairing is never
 * reachable through this picker, so callers never need to validate it.
 */

function ScrollRow<T extends { id: string; name: string }>({
  items,
  selectedId,
  onSelect,
  renderIcon,
  accent,
}: {
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderIcon: (id: string) => React.ReactNode;
  accent: "adi" | "ren";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedId]);

  const scrollByOne = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-build-card]");
    const step = (card?.offsetWidth ?? 96) + 12;
    track.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Previous"
        onClick={() => scrollByOne(-1)}
        className="shrink-0 rounded-full border border-border bg-surface p-1.5 text-text-dim hover:text-text hover:bg-surface-raised transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div
        ref={trackRef}
        className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              data-build-card
              ref={selected ? selectedRef : undefined}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-24 shrink-0 snap-center flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors",
                selected
                  ? accent === "adi"
                    ? "border-adi bg-adi/10"
                    : "border-ren bg-ren/10"
                  : "border-border bg-surface hover:bg-surface-raised"
              )}
            >
              {renderIcon(item.id)}
              <span className={cn("text-xs leading-tight", selected ? "font-semibold text-text" : "text-text-dim")}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
      <button
        aria-label="Next"
        onClick={() => scrollByOne(1)}
        className="shrink-0 rounded-full border border-border bg-surface p-1.5 text-text-dim hover:text-text hover:bg-surface-raised transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function BuildPicker({
  characterId,
  kartId,
  onSelectCharacter,
  onSelectKart,
  accent,
}: {
  characterId: string;
  kartId: string;
  onSelectCharacter: (id: string) => void;
  onSelectKart: (id: string) => void;
  accent: "adi" | "ren";
}) {
  const weightClass = getCharacterWeightClass(characterId);
  const legalKarts = weightClass ? getVehiclesForWeightClass(weightClass) : [];

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase">Character</p>
        <ScrollRow
          items={CHARACTERS}
          selectedId={characterId}
          onSelect={onSelectCharacter}
          accent={accent}
          renderIcon={(id) => <CharacterIcon characterId={id} accent={accent} size="md" />}
        />
      </div>
      <div>
        <p className="mb-2 font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase">Kart</p>
        <ScrollRow
          items={legalKarts}
          selectedId={kartId}
          onSelect={onSelectKart}
          accent={accent}
          renderIcon={(id) => <VehicleIcon vehicleId={id} accent={accent} size="md" />}
        />
      </div>
    </div>
  );
}
