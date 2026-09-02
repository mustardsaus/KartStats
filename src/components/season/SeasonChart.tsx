"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { RaceStat } from "@/lib/stats";

export function SeasonChart({ races }: { races: RaceStat[] }) {
  const data = races.map((r) => ({
    raceNumber: r.raceNumber,
    circuitName: r.circuit.name,
    adi: r.adiCumulativePoints,
    ren: r.renCumulativePoints,
    adiPos: r.adiFinishingPosition,
    renPos: r.renFinishingPosition,
  }));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="raceNumber"
          stroke="var(--color-text-faint)"
          tick={{ fill: "var(--color-text-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
          label={{ value: "RACE #", position: "insideBottom", offset: -2, fill: "var(--color-text-faint)", fontSize: 11 }}
        />
        <YAxis stroke="var(--color-text-faint)" tick={{ fill: "var(--color-text-faint)", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const p = payload[0].payload as (typeof data)[number];
            return (
              <div className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2.5 shadow-xl text-xs min-w-[170px]">
                <p className="font-hud font-bold text-text mb-1">
                  Race {p.raceNumber} &middot; {p.circuitName}
                </p>
                <div className="flex items-center justify-between gap-4 text-adi">
                  <span>Adi (P{p.adiPos})</span>
                  <span className="text-stat font-bold">{p.adi}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-ren">
                  <span>Ren (P{p.renPos})</span>
                  <span className="text-stat font-bold">{p.ren}</span>
                </div>
              </div>
            );
          }}
        />
        <Line type="monotone" dataKey="adi" name="Adi" stroke="var(--color-adi)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="ren" name="Ren" stroke="var(--color-ren)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
