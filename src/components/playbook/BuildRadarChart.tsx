"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { BUILD_STAT_KEYS, normalizeBuildStats, type BuildStats } from "@/lib/stats/build-stats";

/**
 * The combined build's 7 stats as a radar chart -- the first use of
 * Recharts' radar in this codebase (TrendlineChart.tsx is the house
 * style this still follows: CSS-variable colors, recessive grid, themed
 * tooltip). Single series, so no legend box (the "Build" label on the
 * one shape is enough) -- the per-player accent color (adi/ren) is what
 * ties this chart back to whichever player's build it is, same as every
 * other per-player chart in the app, rather than an arbitrary hue.
 *
 * Plotted values are normalizeBuildStats' 0-100 scores (scaled against
 * every legal character+kart combo in the game), not the raw combined
 * numbers -- so every axis uses the same scale and two different builds'
 * charts stay visually comparable. The tooltip shows the raw combined
 * number too, since "62/100 Speed" alone doesn't tell you much on its own.
 */

const STAT_LABELS: Record<(typeof BUILD_STAT_KEYS)[number], string> = {
  speed: "Speed",
  weight: "Weight",
  acceleration: "Accel.",
  handling: "Handling",
  drift: "Drift",
  offRoad: "Off-Road",
  miniTurbo: "Mini-Turbo",
};

export function BuildRadarChart({ build, accent }: { build: BuildStats; accent: "adi" | "ren" }) {
  const normalized = normalizeBuildStats(build);
  const data = BUILD_STAT_KEYS.map((key) => ({
    stat: STAT_LABELS[key],
    value: normalized[key],
    raw: build[key],
  }));
  const color = accent === "adi" ? "var(--color-adi)" : "var(--color-ren)";

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis dataKey="stat" tick={{ fill: "var(--color-text-dim)", fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Build"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.28}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            isAnimationActive
          />
          <Tooltip content={<BuildRadarTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BuildRadarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { stat: string; value: number; raw: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 shadow-xl text-xs min-w-[140px]">
      <p className="font-hud font-bold tracking-wide text-text mb-1">{p.stat}</p>
      <div className="flex items-center justify-between gap-4 text-text-dim">
        <span>Combined</span>
        <span className="text-stat font-bold text-text">{p.raw}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-text-dim">
        <span>Scaled</span>
        <span className="text-stat font-bold text-text">{p.value}/100</span>
      </div>
    </div>
  );
}
