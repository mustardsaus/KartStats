import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    day: "numeric",
  });
}

export function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Formats a lap/race time in milliseconds the way Mario Kart itself
 * does: "M:SS.mmm" once a minute is crossed, otherwise "SS.mmms". Shared
 * by RaceResultPanel and CircuitPreviewPanel's Circuit Records block so
 * both read the same format.
 */
export function formatRaceTimeMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, "0");
  return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}s`;
}

export const PLAYER_ACCENT = {
  adi: {
    text: "text-adi",
    bg: "bg-adi",
    border: "border-adi",
    glow: "card-glow-adi",
    dim: "text-adi-dim",
    gradient: "from-adi to-adi-glow",
  },
  ren: {
    text: "text-ren",
    bg: "bg-ren",
    border: "border-ren",
    glow: "card-glow-ren",
    dim: "text-ren-dim",
    gradient: "from-ren to-ren-glow",
  },
} as const;
