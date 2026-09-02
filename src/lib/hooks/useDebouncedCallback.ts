"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a stable function that delays calling `fn` until `delayMs` has
 * passed with no further calls — each call resets the timer (trailing
 * debounce, last call wins). Used to coalesce a burst of rapid taps (the
 * blue-shell button, a power-up stepper) into a single background
 * refetch instead of one per tap: the mutation itself still fires
 * immediately on every tap for correctness, but the expensive "go
 * re-fetch the whole battle state and recompute stats" step only needs
 * to happen once the burst settles, not after every single tap.
 */
export function useDebouncedCallback(fn: () => void, delayMs: number): () => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs are only written here (an effect), never during render — keeps
  // this compliant with the "no ref writes during render" lint rule while
  // still always calling the latest `fn` from the timeout below.
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fnRef.current();
    }, delayMs);
  }, [delayMs]);
}
