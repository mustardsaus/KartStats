"use client";

import { useEffect, useRef } from "react";
import { countUp } from "@/lib/animation";
import { PLAYERS } from "@/lib/data/points-mapping";

/**
 * Small, unobtrusive live score tracker — deliberately not a big animated
 * chart. War Mode's actual focus is the track and the race in front of you;
 * this is just a glance-able "what's the score" readout.
 *
 * `guestPoints` is only shown when `guestEnabled` — a 3-driver battle adds
 * a third, neutrally-styled readout for Prawns. This is a live glance
 * display only; it never feeds into who the season's official winner is
 * (that stays Adi-vs-Ren everywhere else in the app).
 */
export function LiveLeaderboard({
  adiPoints,
  renPoints,
  guestEnabled = false,
  guestPoints = 0,
}: {
  adiPoints: number;
  renPoints: number;
  guestEnabled?: boolean;
  guestPoints?: number;
}) {
  const scores = guestEnabled ? [adiPoints, renPoints, guestPoints] : [adiPoints, renPoints];
  const topScore = Math.max(...scores);
  const tied = scores.filter((s) => s === topScore).length > 1;
  const leader = tied ? null : adiPoints === topScore ? "adi" : renPoints === topScore ? "ren" : "guest";

  return (
    <div className="inline-flex items-center gap-4 rounded-full border border-border bg-surface/90 backdrop-blur-sm px-6 py-3 shadow-lg shadow-void/30">
      <ScoreReadout playerId="adi" points={adiPoints} leading={leader === "adi"} />
      <span className="text-text-faint text-xs font-hud">vs</span>
      <ScoreReadout playerId="ren" points={renPoints} leading={leader === "ren"} align={guestEnabled ? "left" : "right"} />
      {guestEnabled && (
        <>
          <span className="text-text-faint text-xs font-hud">vs</span>
          <ScoreReadout playerId="guest" points={guestPoints} leading={leader === "guest"} align="right" />
        </>
      )}
    </div>
  );
}

function ScoreReadout({
  playerId,
  points,
  leading,
  align = "left",
}: {
  playerId: "adi" | "ren" | "guest";
  points: number;
  leading: boolean;
  align?: "left" | "right";
}) {
  const accent = playerId === "adi" ? "var(--color-adi)" : playerId === "ren" ? "var(--color-ren)" : "var(--color-text-faint)";
  const label = playerId === "guest" ? "PRAWNS" : PLAYERS[playerId].name.toUpperCase();
  const valueRef = useRef<HTMLSpanElement>(null);
  // Tracks what's actually painted right now, not just the last prop —
  // countUp animates FROM this, so a burst of updates while a prior tick
  // is still mid-flight keeps ticking from wherever it visually is.
  const displayedRef = useRef(points);

  useEffect(() => {
    countUp(valueRef.current, displayedRef.current, points);
    displayedRef.current = points;
  }, [points]);

  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <span className="font-hud text-xs font-bold tracking-wide text-text-dim">{label}</span>
      <span ref={valueRef} className="text-stat text-xl sm:text-2xl font-bold" style={{ color: accent }}>
        {points}
      </span>
      {leading && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-gold)" }} />}
    </div>
  );
}
