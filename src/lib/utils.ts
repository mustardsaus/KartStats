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
