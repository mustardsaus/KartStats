"use client";

import { useEffect, useState } from "react";
import type { PlayerId, RaceItemEvent, RacePositionSample, RawRace } from "@/lib/types";
import { getRaceTelemetryDetailAction } from "@/app/war-mode/immersive-actions";
import { PLAYERS } from "@/lib/data/points-mapping";
import { RacePositionGraph } from "./RacePositionGraph";
import { RaceItemFeed } from "./RaceItemFeed";
import { CharacterIcon } from "../battle/CharacterIcon";
import { VehicleIcon } from "../battle/VehicleIcon";
import { CHARACTERS_BY_ID } from "@/lib/data/characters";
import { VEHICLES_BY_ID } from "@/lib/data/karts";
import { Flag, Loader2, Trophy } from "lucide-react";
import { cn, formatRaceTimeMs as formatTime } from "@/lib/utils";
import type { CircuitRecord } from "@/lib/stats/circuit-records";

/**
 * Shown the instant an Immersive race finalizes, and kept showing until
 * the tracker's first event for the next race lands (see
 * ImmersiveModeClient's `justFinishedRace` derivation) — loaded once,
 * never live-updated, per the simplified spec: no incremental graph
 * drawing mid-race, just a static result the moment the race is over.
 */
export function RaceResultPanel({
  race,
  circuitName,
  circuitRecord,
}: {
  race: RawRace;
  circuitName: string;
  circuitRecord: CircuitRecord | null;
}) {
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
          raceNumber={race.raceNumber}
          seasonId={race.seasonId}
          position={race.adiFinishingPosition}
          finalMs={race.adiFinalTimeMs}
          laps={[race.adiLap1TimeMs, race.adiLap2TimeMs, race.adiLap3TimeMs]}
          characterId={race.adiCharacter}
          kartId={race.adiKart}
          winner={winner === "adi"}
          circuitRecord={circuitRecord}
        />
        <ResultCard
          playerId="ren"
          raceNumber={race.raceNumber}
          seasonId={race.seasonId}
          position={race.renFinishingPosition}
          finalMs={race.renFinalTimeMs}
          laps={[race.renLap1TimeMs, race.renLap2TimeMs, race.renLap3TimeMs]}
          characterId={race.renCharacter}
          kartId={race.renKart}
          winner={winner === "ren"}
          circuitRecord={circuitRecord}
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
  raceNumber,
  seasonId,
  position,
  finalMs,
  laps,
  characterId,
  kartId,
  winner,
  circuitRecord,
}: {
  playerId: PlayerId;
  raceNumber: number;
  seasonId: string;
  position: number;
  finalMs: number | null | undefined;
  laps: Array<number | null | undefined>;
  characterId: string | null | undefined;
  kartId: string | null | undefined;
  winner: boolean;
  circuitRecord: CircuitRecord | null;
}) {
  const accent = playerId === "adi" ? "var(--color-adi)" : "var(--color-ren)";
  // No final time = never crossed the line: the race ends for everyone once
  // the rest of the field finishes, so last place doesn't get to finish
  // its lap -- that lap's split is simply absent, not a slow time.
  const didNotFinish = finalMs == null;
  // Total Race Time, derived the same way the user asked for it: summed
  // from the three lap splits rather than trusted as a separately-tracked
  // number. In practice this equals finalMs exactly -- both come from the
  // same race_start wall-clock read, just decomposed differently -- but
  // deriving it keeps this consistent with the rest of the codebase's
  // "never store what's derivable" rule, and null (not a stale number)
  // whenever a lap split is missing, same as a DNF.
  const totalRaceTimeMs = laps.every((ms) => ms != null) ? laps.reduce((sum, ms) => sum + (ms as number), 0) : null;
  // "This race/player is the one the record currently points to" -- works
  // whether circuitRecord was built with or without this race folded in,
  // since buildCircuitRecords breaks ties in favor of whichever race it
  // saw first, so an exact tie with an EARLIER race never falsely flags
  // here. Matched by raceNumber+seasonId+playerId, not just a time
  // comparison, so a merely-equal (not better) time never lights this up.
  const isNewLapRecord =
    circuitRecord?.fastestLap != null &&
    circuitRecord.fastestLap.playerId === playerId &&
    circuitRecord.fastestLap.raceNumber === raceNumber &&
    circuitRecord.fastestLap.seasonId === seasonId;
  const isNewRaceRecord =
    circuitRecord?.raceRecord != null &&
    circuitRecord.raceRecord.playerId === playerId &&
    circuitRecord.raceRecord.raceNumber === raceNumber &&
    circuitRecord.raceRecord.seasonId === seasonId;
  return (
    <div className={cn("rounded-xl border px-4 py-3", winner ? "border-gold/50 bg-gold/10" : "border-border bg-surface")}>
      <div className="flex items-center justify-between">
        <p className="font-hud text-xs font-bold tracking-wide flex items-center gap-1.5" style={{ color: accent }}>
          {PLAYERS[playerId].name.toUpperCase()}
          {(isNewLapRecord || isNewRaceRecord) && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-gold normal-case"
              title={[isNewLapRecord && "New fastest lap for this circuit", isNewRaceRecord && "New fastest race for this circuit"].filter(Boolean).join(" — ")}
            >
              <Trophy className="h-2.5 w-2.5" />
              {isNewLapRecord && isNewRaceRecord ? "New Lap + Race Record" : isNewLapRecord ? "New Lap Record" : "New Race Record"}
            </span>
          )}
        </p>
        {characterId && kartId && (
          <div className="flex items-center -space-x-1.5">
            <CharacterIcon characterId={characterId} accent={playerId} size="sm" className="ring-2 ring-surface" />
            <VehicleIcon vehicleId={kartId} accent={playerId} size="sm" className="ring-2 ring-surface" />
          </div>
        )}
      </div>
      <p className="text-stat text-2xl font-bold text-text">P{position}</p>
      <p className="text-xs text-text-faint">
        {totalRaceTimeMs != null ? (
          <>
            <span className="text-text-dim font-medium">Total Race Time:</span> {formatTime(totalRaceTimeMs)}
          </>
        ) : didNotFinish ? (
          "Race ended before finishing"
        ) : (
          formatTime(finalMs)
        )}
      </p>
      {characterId && kartId && (
        <p className="text-xs text-text-dim font-medium mt-0.5">
          {CHARACTERS_BY_ID.get(characterId)?.name ?? characterId} &middot; {VEHICLES_BY_ID.get(kartId)?.name ?? kartId}
        </p>
      )}
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
