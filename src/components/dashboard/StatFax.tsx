"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Feather } from "lucide-react";

const TYPE_MS = 26;
const ERASE_MS = 12;
const HOLD_MS = 3800;
const GAP_MS = 350;

/**
 * A small ticker that types out one computed "interesting fact" about the
 * rivalry at a time, holds it, erases it, and moves to the next — looping
 * forever. Facts are computed server-side (see lib/stats/facts.ts) and
 * handed in as plain strings; this component only owns the typing motion.
 * Reduced-motion users get the same facts on the same cadence, just
 * without the character-by-character animation.
 */
export function StatFax({ facts }: { facts: string[] }) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (facts.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const full = facts[index % facts.length];

    if (reducedMotion) {
      timer = setTimeout(() => {
        if (cancelled) return;
        setDisplay(full);
        timer = setTimeout(() => {
          if (!cancelled) setIndex((i) => i + 1);
        }, HOLD_MS);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    let pos = 0;
    const typeStep = () => {
      if (cancelled) return;
      pos += 1;
      setDisplay(full.slice(0, pos));
      timer = setTimeout(pos < full.length ? typeStep : holdThenErase, TYPE_MS);
    };
    const holdThenErase = () => {
      if (cancelled) return;
      timer = setTimeout(() => eraseStep(full.length), HOLD_MS);
    };
    const eraseStep = (pos: number) => {
      if (cancelled) return;
      const next = pos - 1;
      setDisplay(full.slice(0, Math.max(next, 0)));
      if (next > 0) {
        timer = setTimeout(() => eraseStep(next), ERASE_MS);
      } else {
        timer = setTimeout(() => {
          if (!cancelled) setIndex((i) => i + 1);
        }, GAP_MS);
      }
    };

    timer = setTimeout(typeStep, TYPE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, facts.length, reducedMotion]);

  if (facts.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface/80 backdrop-blur-sm px-5 py-4 sm:px-6 sm:py-5">
      <p className="font-hud text-[13px] font-bold tracking-[0.25em] text-gold uppercase mb-2 flex items-center gap-1.5">
        <Feather className="h-3 w-3" /> Stat Fax
      </p>
      <p className="text-sm sm:text-base text-text-dim leading-relaxed min-h-[2.5em]">
        {display}
        <span className="inline-block w-[2px] h-[1em] -mb-[0.15em] ml-0.5 bg-gold/70 animate-pulse" aria-hidden="true" />
      </p>
    </div>
  );
}
