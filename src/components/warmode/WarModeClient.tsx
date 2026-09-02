"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Circuit, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { buildRaceStats, calculateSeasonTotals, determineSeasonWinner, calculateCircuitStats } from "@/lib/stats";
import { abandonSeasonAction, addRaceAction } from "@/app/war-mode/actions";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { CircuitPicker } from "./CircuitPicker";
import { CircuitPreviewPanel } from "./CircuitPreviewPanel";
import { RaceEntryForm } from "./RaceEntryForm";
import { SeasonCompletionScreen } from "./SeasonCompletionScreen";
import { RaceTable } from "@/components/season/RaceTable";
import { CircuitImage } from "@/components/circuits/CircuitImage";
import { WatercolorImage } from "@/components/media/WatercolorImage";
import { useIsDarkTheme } from "@/lib/hooks/useIsDarkTheme";
import { Swords } from "lucide-react";

type Step = "select" | "preview" | "entry";

interface WarModeClientProps {
  activeSeasonId: string | null;
  circuits: Circuit[];
  pointsMapping: PointsMapping;
  historicalSeasons: RawSeason[];
  historicalRacesBySeasonId: Map<string, RawRace[]>;
  activeSeasonRaces: RawRace[];
}

export function WarModeClient({
  activeSeasonId: initialSeasonId,
  circuits,
  pointsMapping,
  historicalSeasons,
  historicalRacesBySeasonId,
  activeSeasonRaces,
}: WarModeClientProps) {
  const router = useRouter();
  // activeSeasonId is only ever null in the type signature for symmetry
  // with Battle Mode's props — the parent page (war-mode/page.tsx) never
  // actually renders WarModeClient without an active solo-mode season, so
  // this is treated as always-present below.
  const seasonId = initialSeasonId as string;
  const [races, setRaces] = useState<RawRace[]>(activeSeasonRaces);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [selectedCircuitId, setSelectedCircuitId] = useState<string | null>(null);
  const isDark = useIsDarkTheme();

  const circuitsById = useMemo(() => new Map(circuits.map((c) => [c.id, c])), [circuits]);
  const raceStats = useMemo(() => buildRaceStats(races, circuitsById, pointsMapping), [races, circuitsById, pointsMapping]);
  const { adiTotal, renTotal } = useMemo(() => calculateSeasonTotals(raceStats), [raceStats]);

  const seasonNumber = useMemo(() => {
    return historicalSeasons.reduce((max, s) => Math.max(max, s.seasonNumber), 0) + 1;
  }, [historicalSeasons]);

  const allSeasonsForStats = useMemo(() => {
    const historical = historicalSeasons.map((s) => ({ season: s, races: historicalRacesBySeasonId.get(s.id) ?? [] }));
    const live = {
      season: { id: seasonId ?? "live", seasonNumber, startDate: "", completionDate: null, isComplete: false, winnerId: null, adiFinalPoints: null, renFinalPoints: null, createdAt: "" },
      races,
    };
    return [...historical, live];
  }, [historicalSeasons, historicalRacesBySeasonId, races, seasonId, seasonNumber]);

  const selectedCircuit = selectedCircuitId ? circuitsById.get(selectedCircuitId) ?? null : null;
  const selectedCircuitStat = useMemo(() => {
    if (!selectedCircuit) return null;
    const seasonStats = allSeasonsForStats.map(({ season, races: r }) => {
      const stats = buildRaceStats(r, circuitsById, pointsMapping);
      const totals = calculateSeasonTotals(stats);
      return {
        season,
        races: stats,
        adiFinalPoints: totals.adiTotal,
        renFinalPoints: totals.renTotal,
        winner: null,
        winningMargin: 0,
        isComplete: season.isComplete,
        racesPlayed: stats.length,
      };
    });
    return calculateCircuitStats(seasonStats, selectedCircuit);
  }, [selectedCircuit, allSeasonsForStats, circuitsById, pointsMapping]);

  const handleAbandon = () => {
    setAbandonError(null);
    startTransition(async () => {
      const result = await abandonSeasonAction(seasonId);
      if ("error" in result && result.error) {
        setAbandonError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleSubmitRace = (input: { adiFinishingPosition: number; renFinishingPosition: number }) => {
    if (!selectedCircuitId) return;
    setError(null);
    startTransition(async () => {
      const result = await addRaceAction(seasonId, { circuitId: selectedCircuitId, ...input });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("race" in result && result.race) {
        const nextRaces = [...races, result.race];
        setRaces(nextRaces);
        setSelectedCircuitId(null);
        setStep("select");
      }
    });
  };

  const nextRaceNumber = Math.min(races.length + 1, RACES_PER_SEASON);
  const seasonComplete = races.length >= RACES_PER_SEASON;
  const completionInfo = seasonComplete
    ? { winner: determineSeasonWinner(adiTotal, renTotal), adi: adiTotal, ren: renTotal, seasonNumber }
    : null;

  return (
    <div>
      {completionInfo && (
        <div className="mx-auto max-w-2xl px-4 pt-8">
          <SeasonCompletionScreen
            seasonNumber={completionInfo.seasonNumber}
            winner={completionInfo.winner}
            adiPoints={completionInfo.adi}
            renPoints={completionInfo.ren}
          />
        </div>
      )}

      {!seasonComplete && (
        // Full-bleed backdrop: breaks out of the page's centered max-width
        // container so the selected track reads as a real backdrop, not a
        // card. A slow, subtle "ken burns" drift keeps it from feeling static.
        <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen min-h-[78vh] sm:min-h-[82vh] flex flex-col overflow-hidden">
          <div className="absolute inset-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedCircuit?.id ?? "none"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0"
              >
                {selectedCircuit ? (
                  <div className="absolute inset-0 animate-slow-drift">
                    {/* instant: this backdrop swaps on every one of a season's
                        32 track picks — live gameplay, not a moment to spend a
                        few seconds of animated watercolor reveal on. */}
                    <CircuitImage circuit={selectedCircuit} className="absolute inset-0" instant />
                  </div>
                ) : (
                  <div className="absolute inset-0 animate-slow-drift">
                    <WatercolorImage
                      src="/war-mode-bg.jpg"
                      alt=""
                      className="absolute inset-0 h-full w-full"
                      durationMs={4200}
                      raw={isDark}
                      eager
                      instant
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="absolute inset-0 bg-void/60" />
            <div className="absolute inset-0 bg-gradient-to-t from-void/70 via-transparent to-void/35" />
          </div>

          <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-8 pt-6">
            <div>
              <p className="font-hud text-[13px] font-bold tracking-[0.25em] text-danger uppercase flex items-center gap-2">
                <Swords className="h-3 w-3 animate-pulse" /> Live &middot; Season {seasonNumber}
              </p>
              <p className="text-stat text-sm text-paper/75 mt-0.5">Race {nextRaceNumber} of {RACES_PER_SEASON}</p>
            </div>
            <LiveLeaderboard adiPoints={adiTotal} renPoints={renTotal} />
            <div />
          </div>

          <div className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
            <AnimatePresence mode="wait">
              {step === "select" && (
                <motion.div key="select" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                  <CircuitPicker
                    circuits={circuits}
                    raceNumber={nextRaceNumber}
                    onSelect={(id) => {
                      setSelectedCircuitId(id);
                      setStep("preview");
                    }}
                  />
                  {races.length === 0 && (
                    <div className="text-center mt-6">
                      <button
                        onClick={handleAbandon}
                        disabled={pending}
                        className="text-xs text-paper/40 hover:text-danger underline underline-offset-2 disabled:opacity-60 transition-colors"
                      >
                        {pending ? "Cancelling…" : "Started this by mistake? Cancel season"}
                      </button>
                      {abandonError && <p className="text-xs text-danger mt-2">{abandonError}</p>}
                    </div>
                  )}
                </motion.div>
              )}
              {step === "preview" && selectedCircuit && (
                <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                  <CircuitPreviewPanel
                    circuit={selectedCircuit}
                    stat={selectedCircuitStat}
                    raceNumber={nextRaceNumber}
                    onBack={() => {
                      setSelectedCircuitId(null);
                      setStep("select");
                    }}
                    onRecordResults={() => setStep("entry")}
                  />
                </motion.div>
              )}
              {step === "entry" && selectedCircuit && (
                <motion.div key="entry" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                  <RaceEntryForm
                    circuit={selectedCircuit}
                    raceNumber={nextRaceNumber}
                    onSubmit={handleSubmitRace}
                    onBack={() => setStep("preview")}
                    submitting={pending}
                    error={error}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        <div className="w-full h-1.5 rounded-full bg-surface-raised overflow-hidden mb-8">
          <div
            className="h-full bg-gradient-to-r from-adi via-gold to-ren transition-all duration-500"
            style={{ width: `${(races.length / RACES_PER_SEASON) * 100}%` }}
          />
        </div>

        <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">
          Season {seasonNumber} — Race Log
        </p>
        {raceStats.length === 0 ? (
          <p className="text-sm text-text-faint">No races recorded yet — pick a circuit above to log the first one.</p>
        ) : (
          <RaceTable races={[...raceStats].reverse()} />
        )}
      </div>
    </div>
  );
}
