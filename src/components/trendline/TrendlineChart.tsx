"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { TrendlinePoint, SeasonBoundary } from "@/lib/stats";
import { tapPulse } from "@/lib/animation";
import { cn } from "@/lib/utils";

type PlayerFilter = "both" | "adi" | "ren";

export function TrendlineChart({
  points,
  boundaries,
}: {
  points: TrendlinePoint[];
  boundaries: SeasonBoundary[];
}) {
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("both");
  const [highlightSeason, setHighlightSeason] = useState<number | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {(["both", "adi", "ren"] as PlayerFilter[]).map((f) => (
            <button
              key={f}
              onClick={(e) => {
                tapPulse(e.currentTarget);
                setPlayerFilter(f);
              }}
              className={cn(
                "px-3 py-1.5 rounded-md font-hud text-xs font-bold tracking-wide uppercase transition-colors",
                playerFilter === f
                  ? f === "adi"
                    ? "bg-adi text-bg"
                    : f === "ren"
                      ? "bg-ren text-void"
                      : "bg-surface-raised text-text"
                  : "text-text-dim hover:text-text"
              )}
            >
              {f === "both" ? "Both" : f === "adi" ? "Adi" : "Ren"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-8">
        <ResponsiveContainer width="100%" height={440}>
          <LineChart data={points} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="globalRaceIndex"
              stroke="var(--color-text-faint)"
              tick={{ fill: "var(--color-text-faint)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              label={{ value: "RACE #", position: "insideBottom", offset: -2, fill: "var(--color-text-faint)", fontSize: 11 }}
            />
            <YAxis
              stroke="var(--color-text-faint)"
              tick={{ fill: "var(--color-text-faint)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip content={<TrendlineTooltip />} />

            {boundaries.map((b) => (
              <ReferenceLine
                key={b.seasonNumber}
                x={b.endIndex}
                stroke={highlightSeason === b.seasonNumber ? "var(--color-gold)" : "var(--color-border-strong)"}
                strokeDasharray="4 4"
                label={{
                  value: `S${b.seasonNumber}`,
                  position: "top",
                  fill: "var(--color-text-faint)",
                  fontSize: 10,
                }}
              />
            ))}

            {(playerFilter === "both" || playerFilter === "adi") && (
              <Line
                type="monotone"
                dataKey="adiCumulativePoints"
                name="Adi"
                stroke="var(--color-adi)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive
              />
            )}
            {(playerFilter === "both" || playerFilter === "ren") && (
              <Line
                type="monotone"
                dataKey="renCumulativePoints"
                name="Ren"
                stroke="var(--color-ren)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        {boundaries.map((b) => (
          <button
            key={b.seasonNumber}
            onMouseEnter={() => setHighlightSeason(b.seasonNumber)}
            onMouseLeave={() => setHighlightSeason(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[13px] font-hud font-semibold tracking-wide transition-colors",
              highlightSeason === b.seasonNumber
                ? "border-gold bg-gold/15 text-gold"
                : "border-border text-text-faint hover:border-border-strong hover:text-text-dim"
            )}
          >
            S{b.seasonNumber}{" "}
            {b.winner === "adi" ? (
              <span className="inline-block h-2 w-2 rounded-full bg-adi align-middle" />
            ) : b.winner === "ren" ? (
              <span className="inline-block h-2 w-2 rounded-full bg-ren align-middle" />
            ) : (
              "—"
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function TrendlineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TrendlinePoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 shadow-xl text-xs min-w-[180px]">
      <p className="font-hud font-bold tracking-wide text-text mb-1">
        S{p.seasonNumber} &middot; Race {p.raceNumber} &middot; {p.circuitName}
      </p>
      <div className="flex items-center justify-between gap-4 text-adi">
        <span>Adi (P{p.adiFinishingPosition})</span>
        <span className="text-stat font-bold">{p.adiCumulativePoints}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-ren">
        <span>Ren (P{p.renFinishingPosition})</span>
        <span className="text-stat font-bold">{p.renCumulativePoints}</span>
      </div>
    </div>
  );
}
