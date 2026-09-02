import { PLAYERS } from "@/lib/data/points-mapping";

/**
 * Split racing-bar visualization of swing probability: how much of the
 * points scored at a circuit (or in general) belong to each player.
 * Used on Circuit Detail and War Mode's live circuit head-to-head.
 */
export function SwingBar({
  adiPct,
  renPct,
  size = "md",
}: {
  adiPct: number | null;
  renPct: number | null;
  size?: "sm" | "md";
}) {
  if (adiPct === null || renPct === null) {
    return <p className="text-xs text-text-faint">No head-to-head data at this circuit yet.</p>;
  }

  const height = size === "sm" ? "h-2.5" : "h-4";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 font-hud text-xs font-bold tracking-wide">
        <span className="text-adi">{PLAYERS.adi.name.toUpperCase()} {adiPct.toFixed(0)}%</span>
        <span className="text-ren">{PLAYERS.ren.name.toUpperCase()} {renPct.toFixed(0)}%</span>
      </div>
      <div className={`flex w-full overflow-hidden rounded-full bg-surface-raised ${height}`}>
        <div
          className="h-full bg-gradient-to-r from-adi to-adi-glow transition-all duration-700"
          style={{ width: `${adiPct}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-ren-glow to-ren transition-all duration-700"
          style={{ width: `${renPct}%` }}
        />
      </div>
    </div>
  );
}
