"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

/**
 * Keeps a Battle Mode season fresh across every device that has it open.
 * Deliberately does NOT try to merge the Realtime payloads client-side —
 * a `races` insert (the actual leaderboard-changing event) isn't even in
 * the `seasons`/`battle_rounds` change feed, since finalizing a round
 * writes to a third table. Instead, ANY change to either watched table
 * for this season just calls `onChange` once, and the caller re-fetches
 * full state in one shot (see getBattleStateAction) — simpler than
 * reconciling partial payloads, and still feels instant given how small
 * that payload is.
 *
 * Also refetches on regained tab visibility / network, since phone
 * browsers commonly drop the websocket when the screen locks between
 * races — without this, a phone that was asleep while the admin picked
 * the next track would keep showing stale state indefinitely.
 */
export function useBattleRealtime(seasonId: string | null, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!seasonId) return;

    let cancelled = false;
    const fire = () => {
      if (!cancelled) onChangeRef.current();
    };

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`battle:${seasonId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seasons", filter: `id=eq.${seasonId}` },
        fire
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_rounds", filter: `season_id=eq.${seasonId}` },
        fire
      )
      .subscribe((status) => {
        // Catches anything that changed between the initial server render
        // and the subscription actually going live.
        if (status === "SUBSCRIBED") fire();
      });

    const refetchOnResume = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", refetchOnResume);
    window.addEventListener("online", refetchOnResume);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refetchOnResume);
      window.removeEventListener("online", refetchOnResume);
      supabase.removeChannel(channel);
    };
  }, [seasonId]);
}
