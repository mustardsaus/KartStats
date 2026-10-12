"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { RaceSpeedSample } from "@/lib/types";

/**
 * The permanent per-race speed-vs-time graph, same convention as
 * RacePositionGraph: renders once, straight from the already-finalized
 * race's race_speed_samples, right as the Dolphin tracker shifts to the
 * next race. Reused as-is by Season Rewind's RaceTelemetryModal.
 *
 * Values are km/h, confirmed and converted on the Python side before
 * they're ever sent (see the module doc in lib/telemetry/events.ts and
 * kartstats_bridge.py's _vehicle_speed_to_kph) -- the axis and tooltip
 * both label the unit now that it's real.
 */
export function RaceSpeedGraph({ samples }: { samples: RaceSpeedSample[] }) {
  if (samples.length === 0) {
    return <p className="text-sm text-text-faint text-center py-8">No speed data recorded for this race.</p>;
  }

  const maxSpeed = samples.reduce((max, s) => Math.max(max, s.speed), 0);

  // Same "wide" merge RacePositionGraph uses -- one row per distinct
  // tsMs, both players' speeds on it.
  const byTs = new Map<number, { tsMs: number; adiSpeed?: number; renSpeed?: number }>();
  for (const s of samples) {
    const row = byTs.get(s.tsMs) ?? { tsMs: s.tsMs };
    if (s.playerId === "adi") row.adiSpeed = s.speed;
    else row.renSpeed = s.speed;
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
          domain={[0, Math.ceil((maxSpeed + 5) / 10) * 10]}
          stroke="var(--color-text-faint)"
          tick={{ fill: "var(--color-text-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}`}
          label={{ value: "km/h", angle: -90, position: "insideLeft", fill: "var(--color-text-faint)", fontSize: 10 }}
        />
        <Tooltip content={<SpeedTooltip />} />
        <Line type="monotone" dataKey="adiSpeed" name="Adi" stroke="var(--color-adi)" strokeWidth={2.5} dot={false} connectNulls />
        <Line type="monotone" dataKey="renSpeed" name="Ren" stroke="var(--color-ren)" strokeWidth={2.5} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SpeedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: { adiSpeed?: number; renSpeed?: number } }[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 shadow-xl text-xs min-w-[120px]">
      <p className="font-hud font-bold tracking-wide text-text mb-1">{Math.round((label ?? 0) / 1000)}s</p>
      {p.adiSpeed !== undefined && (
        <div className="flex items-center justify-between gap-4 text-adi">
          <span>Adi</span>
          <span className="text-stat font-bold">{p.adiSpeed.toFixed(1)} km/h</span>
        </div>
      )}
      {p.renSpeed !== undefined && (
        <div className="flex items-center justify-between gap-4 text-ren">
          <span>Ren</span>
          <span className="text-stat font-bold">{p.renSpeed.toFixed(1)} km/h</span>
        </div>
      )}
    </div>
  );
}
