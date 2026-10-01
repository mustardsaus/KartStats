"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHARACTERS } from "@/lib/data/characters";
import { cn } from "@/lib/utils";
import { staggerIn, tapPulse } from "@/lib/animation";
import { Search } from "lucide-react";

/**
 * Step 1 of the per-round Kart Kontrol loadout: pick a character. No real
 * artwork is bundled for the roster (licensing — see the module comment in
 * lib/data/characters.ts), so each entry gets a plain initial-letter badge
 * instead of a broken image, same spirit as CircuitPicker's plain-name
 * list. Grouped by weight class since that's the whole reason Step 2 (the
 * kart picker) narrows the way it does.
 */
const GROUP_LABEL: Record<string, string> = { small: "Small", medium: "Medium", large: "Large" };
const GROUP_ORDER = ["small", "medium", "large"];

export function CharacterPicker({
  accent,
  onSelect,
}: {
  accent: "adi" | "ren";
  onSelect: (characterId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? CHARACTERS.filter((c) => c.name.toLowerCase().includes(q)) : CHARACTERS;
    return GROUP_ORDER.map((weightClass) => ({
      weightClass,
      characters: filtered.filter((c) => c.weightClass === weightClass),
    })).filter((g) => g.characters.length > 0);
  }, [query]);

  useEffect(() => {
    staggerIn(listRef.current);
  }, [grouped]);

  return (
    <div className="w-full max-w-sm text-center mx-auto">
      <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase mb-2">Step 1 of 3</p>
      <h3 className="font-display text-3xl sm:text-4xl text-paper tracking-wide mb-6 drop-shadow-lg">Pick your character</h3>

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-paper/45" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search characters…"
          className="w-full rounded-lg border border-paper/20 bg-void/50 backdrop-blur-sm pl-10 pr-3 py-2.5 text-sm text-paper placeholder:text-paper/45 focus:outline-none focus:ring-2 focus:ring-danger/50"
        />
      </div>

      <div ref={listRef} className="max-h-80 overflow-y-auto rounded-lg border border-paper/15 bg-void/40 backdrop-blur-sm">
        {grouped.map((g) => (
          <div key={g.weightClass}>
            <p className="sticky top-0 bg-void/80 backdrop-blur-sm px-4 py-1.5 text-left font-hud text-[11px] font-bold tracking-[0.2em] text-paper/50 uppercase">
              {GROUP_LABEL[g.weightClass]}
            </p>
            <div className="divide-y divide-paper/10">
              {g.characters.map((c) => (
                <button
                  key={c.id}
                  data-stagger-item
                  onClick={(e) => {
                    tapPulse(e.currentTarget);
                    onSelect(c.id);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-paper/90 hover:bg-void/15 hover:text-paper transition-colors"
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-hud text-xs font-bold",
                      accent === "adi" ? "bg-adi/25 text-adi" : "bg-ren/25 text-ren"
                    )}
                  >
                    {c.name.charAt(0)}
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && <p className="px-4 py-6 text-sm text-paper/45">No characters match &ldquo;{query}&rdquo;.</p>}
      </div>
    </div>
  );
}
