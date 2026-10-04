"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { RacePositionSample } from "@/lib/types";

/**
 * The permanent per-race position-vs-time graph (spec sections 7 & 8).
 * Deliberately NOT live-streamed mid-race: it renders once, straight from
 * the already-finalized race's race_position_samples, the moment that
 * race is over — right as the Dolphin tracker shifts to the next one.
 * Same Recharts house style as TrendlineChart (dashed grid, themed
 * tooltip, CSS-variable player colors). Reused as-is by Season Rewind.
 */
export function RacePositionGraph({ samples }: { samples: RacePositionSample[] }) {
  if (samples.length === 0) {
    return <p className="text-sm text-text-faint text-center py-8">No position data recorded for this race.</p>;
  }

  const maxPosition = samples.reduce((max, s) => Math.max(max, s.position), 2);

  // One row per distinct tsMs, both players' positions merged onto it —
  // same "wide" shape TrendlineChart uses for adi/renCumulativePoints.
  const byTs = new Map<number, { tsMs: number; adiPosition?: number; renPosition?: number }>();
  for (const s of samples) {
    const row = byTs.get(s.tsMs) ?? { tsMs: s.tsMs };
    if (s.playerId === "adi") row.adiPosition = s.position;
    else row.renPosition = s.position;
    byTs.set(s.tsMs, row);
  }
  const data = [...byTs.values()].sort((a, b) => a.tsMs - b.tsMs);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="tsMs"
          tickFormatter={(ms: number) => `${Math.round(ms / 1000)}s`}
          stroke="var(--color-text-faint)"
          tick={{ fill: "var(--color-text-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
        />
        <YAxis
          domain={[1, maxPosition]}
          reversed
          allowDecimals={false}
          stroke="var(--color-text-faint)"
          tick={{ fill: "var(--color-text-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Tooltip content={<PositionTooltip />} />
        <Line type="stepAfter" dataKey="adiPosition" name="Adi" stroke="var(--color-adi)" strokeWidth={2.5} dot={false} connectNulls />
        <Line type="stepAfter" dataKey="renPosition" name="Ren" stroke="var(--color-ren)" strokeWidth={2.5} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PositionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { adiPosition?: number; renPosition?: number } }[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 shadow-xl text-xs min-w-[120px]">
      <p className="font-hud font-bold tracking-wide text-text mb-1">{Math.round((label ?? 0) / 1000)}s</p>
      {p.adiPosition !== undefined && (
        <div className="flex items-center justify-between gap-4 text-adi">
          <span>Adi</span>
          <span className="text-stat font-bold">P{p.adiPosition}</span>
        </div>
      )}
      {p.renPosition !== undefined && (
        <div className="flex items-center justify-between gap-4 text-ren">
          <span>Ren</span>
          <span className="text-stat font-bold">P{p.renPosition}</span>
        </div>
      )}
    </div>
  );
}
