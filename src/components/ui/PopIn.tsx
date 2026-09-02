"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { popIn } from "@/lib/animation";

/**
 * Wraps children in a span that pops into place (anime.js) the moment it
 * mounts — used for count badges and stepper numbers. Give the wrapper a
 * `key` that changes with whatever value should "bump" (a count, a
 * selection) so React remounts it and the pop replays.
 */
export function PopIn({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    popIn(ref.current);
  }, []);

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}
