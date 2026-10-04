"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

/**
 * Keeps an Immersive War Mode season fresh on every device watching it —
 * same "any change just triggers one full refetch" convention as
 * useBattleRealtime, for the same reason (simpler than reconciling
 * partial payloads, still feels instant given how small the payload is).
 *
 * Unlike Battle Mode, where a finalized race is only implied by a
 * battle_rounds change (the real `races` insert happens in a third
 * table), Immersive races are written straight to `races` with no
 * round-table proxy — so this watches `races` directly, alongside the
 * ephemeral `live_telemetry_events` holding area (in-progress ticks) and
 * the season row itself (slot/loadout/mode changes during setup).
 */
export function useImmersiveRealtime(seasonId: string | null, onChange: () => void) {
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
      .channel(`immersive:${seasonId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "seasons", filter: `id=eq.${seasonId}` }, fire)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_telemetry_events", filter: `season_id=eq.${seasonId}` },
        fire
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "races", filter: `season_id=eq.${seasonId}` }, fire)
      .subscribe((status) => {
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
