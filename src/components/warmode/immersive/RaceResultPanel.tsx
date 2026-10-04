"use client";

import { useEffect, useState } from "react";
import type { PlayerId, RaceItemEvent, RacePositionSample, RawRace } from "@/lib/types";
import { getRaceTelemetryDetailAction } from "@/app/war-mode/immersive-actions";
import { PLAYERS } from "@/lib/data/points-mapping";
import { RacePositionGraph } from "./RacePositionGraph";
import { RaceItemFeed } from "./RaceItemFeed";
import { Flag, Loader2 } from "lucide-react";
import { cn, formatRaceTimeMs as formatTime } from "@/lib/utils";

/**
 * Shown the instant an Immersive race finalizes, and kept showing until
 * the tracker's first event for the next race lands (see
 * ImmersiveModeClient's `justFinishedRace` derivation) — loaded once,
 * never live-updated, per the simplified spec: no incremental graph
 * drawing mid-race, just a static result the moment the race is over.
 */
export function RaceResultPanel({ race, circuitName }: { race: RawRace; circuitName: string }) {
  const [detail, setDetail] = useState<{ positionSamples: RacePositionSample[]; itemEvents: RaceItemEvent[] } | null>(null);

  // No reset-on-change here -- the parent mounts this with key={race.id}
  // (see ImmersiveModeClient), so a new race is a fresh mount with fresh
  // state, same "key remount instead of an effect that resets state"
  // convention LoadoutSetup/Cockpit already use elsewhere in War Mode.
  useEffect(() => {
    let cancelled = false;
    getRaceTelemetryDetailAction(race.id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [race.id]);

  const winner: PlayerId = race.adiFinishingPosition < race.renFinishingPosition ? "adi" : "ren";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase">Race {race.raceNumber} Results</p>
          <h3 className="font-display text-xl text-text">{circuitName}</h3>
        </div>
        <Flag className="h-6 w-6 text-gold" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <ResultCard
          playerId="adi"
          position={race.adiFinishingPosition}
          finalMs={race.adiFinalTimeMs}
          laps={[race.adiLap1TimeMs, race.adiLap2TimeMs, race.adiLap3TimeMs]}
          winner={winner === "adi"}
        />
        <ResultCard
          playerId="ren"
          position={race.renFinishingPosition}
          finalMs={race.renFinalTimeMs}
          laps={[race.renLap1TimeMs, race.renLap2TimeMs, race.renLap3TimeMs]}
          winner={winner === "ren"}
        />
      </div>

      {!detail ? (
        <div className="text-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-text-faint mx-auto" />
        </div>
      ) : (
        <>
          <RacePositionGraph samples={detail.positionSamples} />
          <div className="mt-4">
            <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-2">Items</p>
            <RaceItemFeed events={detail.itemEvents} />
          </div>
        </>
      )}
    </div>
  );
}

function ResultCard({
  playerId,
  position,
  finalMs,
  laps,
  winner,
}: {
  playerId: PlayerId;
  position: number;
  finalMs: number | null | undefined;
  laps: Array<number | null | undefined>;
  winner: boolean;
}) {
  const accent = playerId === "adi" ? "var(--color-adi)" : "var(--color-ren)";
  // No final time = never crossed the line: the race ends for everyone once
  // the rest of the field finishes, so last place doesn't get to finish
  // its lap -- that lap's split is simply absent, not a slow time.
  const didNotFinish = finalMs == null;
  return (
    <div className={cn("rounded-xl border px-4 py-3", winner ? "border-gold/50 bg-gold/10" : "border-border bg-surface")}>
      <p className="font-hud text-xs font-bold tracking-wide" style={{ color: accent }}>
        {PLAYERS[playerId].name.toUpperCase()}
      </p>
      <p className="text-stat text-2xl font-bold text-text">P{position}</p>
      <p className="text-xs text-text-faint">{didNotFinish ? "Race ended before finishing" : formatTime(finalMs)}</p>
      <div className="mt-2 space-y-0.5">
        {laps.map((ms, i) => (
          <p key={i} className="flex justify-between text-xs text-text-faint">
            <span>Lap {i + 1}</span>
            <span className="text-stat text-text-dim">{ms != null ? formatTime(ms) : "\u2014"}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
