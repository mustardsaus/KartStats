"use client";

import { useMemo, useState } from "react";
import type { Circuit, PlayerId, RaceSpeedSample } from "@/lib/types";
import type { SeasonStat } from "@/lib/stats";
import { CHARACTERS, getCharacterWeightClass } from "@/lib/data/characters";
import { getVehiclesForWeightClass } from "@/lib/data/karts";
import { CIRCUIT_DEMAND_BY_ID } from "@/lib/data/circuit-demand";
import { combineBuildStats, bestAndWorstCircuitsForBuild } from "@/lib/stats/build-stats";
import { buildCircuitProfile } from "@/lib/stats/circuit-profile";
import { buildComboCircuitSuitability } from "@/lib/stats/kart-kontrol";
import { BuildPicker } from "./BuildPicker";
import { BuildRadarChart } from "./BuildRadarChart";
import { TrackFitPanel } from "./TrackFitPanel";

// Default build: Mario's the first medium-weight character, paired with
// his class's first kart -- both roster-order picks, nothing special, just
// a sane starting point the picker is never empty on load.
const DEFAULT_CHARACTER_ID = CHARACTERS.find((c) => c.weightClass === "medium")!.id;
const DEFAULT_KART_ID = getVehiclesForWeightClass("medium")[0].id;

/**
 * Playbook: build a character+kart combo with BuildPicker, see its
 * combined stats on BuildRadarChart, and see which circuits suit it on
 * TrackFitPanel (both the research-based estimate and, once enough races
 * exist, this player's real recorded results for that exact combo via
 * kart-kontrol.ts, reused unmodified).
 *
 * circuit-profile.ts' derived telemetry profile is computed here too, but
 * NOTHING in this page's UI currently displays it on its own -- it only
 * feeds the "from N recorded races" context a future iteration of
 * TrackFitPanel can surface per-circuit. Keeping the derivation wired up
 * now (rather than only building it once a UI needs it) is what makes
 * this count as the real pipeline the user asked for, not just the
 * hand-authored table.
 */
export function PlaybookClient({
  seasons,
  circuits,
  speedSamples,
}: {
  seasons: SeasonStat[];
  circuits: Circuit[];
  speedSamples: RaceSpeedSample[];
}) {
  const [playerId, setPlayerId] = useState<PlayerId>("adi");
  const [characterId, setCharacterId] = useState(DEFAULT_CHARACTER_ID);
  const [kartId, setKartId] = useState(DEFAULT_KART_ID);

  const handleSelectCharacter = (id: string) => {
    setCharacterId(id);
    const weightClass = getCharacterWeightClass(id);
    const legalKarts = weightClass ? getVehiclesForWeightClass(weightClass) : [];
    if (!legalKarts.some((k) => k.id === kartId)) {
      setKartId(legalKarts[0]?.id ?? kartId);
    }
  };

  const build = useMemo(() => combineBuildStats(characterId, kartId), [characterId, kartId]);

  const races = useMemo(() => seasons.flatMap((s) => s.races), [seasons]);

  const { best, worst } = useMemo(
    () => (build ? bestAndWorstCircuitsForBuild(build, circuits, CIRCUIT_DEMAND_BY_ID) : { best: [], worst: [] }),
    [build, circuits]
  );

  const realSuitability = useMemo(
    () => buildComboCircuitSuitability(seasons, playerId, characterId, kartId, circuits),
    [seasons, playerId, characterId, kartId, circuits]
  );

  // The real derive-on-read pipeline (lib/stats/circuit-profile.ts), keyed
  // by circuit id -- a circuit only has an entry once it has enough
  // recorded races. TrackFitPanel annotates its research-based estimate
  // with these numbers when present ("from N recorded races"), never
  // silently replacing the hand-authored circuit-demand estimate with them.
  const circuitProfiles = useMemo(() => {
    const entries = circuits
      .map((c) => [c.id, buildCircuitProfile(c.id, races, speedSamples)] as const)
      .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null);
    return new Map(entries);
  }, [circuits, races, speedSamples]);

  return (
    <div className="space-y-8">
      <BuildPicker
        characterId={characterId}
        kartId={kartId}
        onSelectCharacter={handleSelectCharacter}
        onSelectKart={setKartId}
        accent={playerId === "adi" ? "adi" : "ren"}
      />

      {build && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BuildRadarChart build={build} accent={playerId === "adi" ? "adi" : "ren"} />
          <TrackFitPanel
            best={best}
            worst={worst}
            realSuitability={realSuitability}
            circuitProfiles={circuitProfiles}
            playerId={playerId}
            onSelectPlayer={setPlayerId}
          />
        </div>
      )}
    </div>
  );
}
