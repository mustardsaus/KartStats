import { getStore } from "@/lib/db";
import { isBattleModeAvailable } from "@/lib/supabase/client";
import { WarModeClient } from "@/components/warmode/WarModeClient";
import { WarModeLanding } from "@/components/warmode/WarModeLanding";
import { BattleModeClient } from "@/components/warmode/battle/BattleModeClient";

export default async function WarModePage() {
  const store = getStore();
  const [seasons, racesBySeasonId, circuits, pointsMapping] = await Promise.all([
    store.getSeasons(),
    store.getRacesBySeasonId(),
    store.getCircuits(),
    store.getPointsMapping(),
  ]);

  const activeSeason = seasons.find((s) => !s.isComplete) ?? null;
  const historicalSeasons = seasons.filter((s) => s.isComplete);
  const historicalRacesBySeasonId = new Map(
    historicalSeasons.map((s) => [s.id, racesBySeasonId.get(s.id) ?? []])
  );
  const nextSeasonNumber = historicalSeasons.reduce((max, s) => Math.max(max, s.seasonNumber), 0) + 1;

  // No season running at all — offer solo mode (existing) and, when
  // configured, battle mode.
  if (!activeSeason) {
    // Whichever season most recently finished (solo or battle — both funnel
    // through this same "no active season" branch once complete) gets its
    // result recapped on the landing page itself. This is deliberately
    // server-derived rather than client state: Next automatically re-fetches
    // this route the moment the finalizing server action revalidates
    // "/war-mode", which swaps straight from WarModeClient/BattleModeClient
    // to this landing page before either client component's own "just
    // completed" state would ever be seen — so the recap has to live here
    // to reliably show up at all.
    const justCompletedSeason = historicalSeasons.reduce<typeof historicalSeasons[number] | null>(
      (latest, s) => (!latest || s.seasonNumber > latest.seasonNumber ? s : latest),
      null
    );
    return (
      <WarModeLanding
        seasonNumber={nextSeasonNumber}
        battleModeAvailable={isBattleModeAvailable()}
        justCompletedSeason={justCompletedSeason}
      />
    );
  }

  // A battle-mode season is active exactly when it has a battle code —
  // any device landing here sees the same live join/cockpit flow.
  if (activeSeason.battleCode) {
    return (
      <BattleModeClient
        initialSeason={activeSeason}
        circuits={circuits}
        pointsMapping={pointsMapping}
        initialRaces={racesBySeasonId.get(activeSeason.id) ?? []}
        historicalSeasons={historicalSeasons}
        historicalRacesBySeasonId={historicalRacesBySeasonId}
      />
    );
  }

  // Ordinary solo-mode season — unchanged.
  return (
    <WarModeClient
      activeSeasonId={activeSeason.id}
      circuits={circuits}
      pointsMapping={pointsMapping}
      historicalSeasons={historicalSeasons}
      historicalRacesBySeasonId={historicalRacesBySeasonId}
      activeSeasonRaces={racesBySeasonId.get(activeSeason.id) ?? []}
    />
  );
}
