"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Circuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { staggerIn, tapPulse } from "@/lib/animation";
import { Search, Flag } from "lucide-react";

/**
 * Step 1 of the War Mode per-race flow: pick the circuit BEFORE the race
 * happens. Deliberately plain — a name, nothing else — so this reads as a
 * quick "what track" prompt rather than a screen of its own.
 */
export function CircuitPicker({
  circuits,
  raceNumber,
  onSelect,
}: {
  circuits: Circuit[];
  raceNumber: number;
  onSelect: (circuitId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const sorted = [...circuits].sort((a, b) => a.name.localeCompare(b.name));
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [circuits, query]);

  // Re-plays every time the filtered set changes — typing a search re-
  // stagger-pops the narrowed-down results in, instead of them just
  // instantly reflowing.
  useEffect(() => {
    staggerIn(listRef.current);
  }, [filtered]);

  return (
    <div className="w-full max-w-sm text-center">
      <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase flex items-center justify-center gap-2 mb-2">
        <Flag className="h-4 w-4" /> Race {raceNumber} of 32
      </p>
      <h3 className="font-display text-3xl sm:text-4xl text-paper tracking-wide mb-6 drop-shadow-lg">
        Which circuit?
      </h3>

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-paper/45" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search circuits…"
          className="w-full rounded-lg border border-paper/20 bg-void/50 backdrop-blur-sm pl-10 pr-3 py-2.5 text-sm text-paper placeholder:text-paper/45 focus:outline-none focus:ring-2 focus:ring-danger/50"
        />
      </div>

      <div ref={listRef} className="max-h-72 overflow-y-auto rounded-lg border border-paper/15 bg-void/40 backdrop-blur-sm divide-y divide-paper/10">
        {filtered.map((c) => (
          <button
            key={c.id}
            data-stagger-item
            onClick={(e) => {
              tapPulse(e.currentTarget);
              onSelect(c.id);
            }}
            className={cn(
              "block w-full px-4 py-2.5 text-left text-sm text-paper/90 hover:bg-void/15 hover:text-paper transition-colors"
            )}
          >
            {c.name}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-sm text-paper/45">No circuits match &ldquo;{query}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}
