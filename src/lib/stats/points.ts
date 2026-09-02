import type { PointsMapping } from "@/lib/types";

/**
 * Looks up points awarded for a finishing position, using the configured
 * (imported) points mapping — never a hardcoded scoring table.
 *
 * Handles invalid/missing positions gracefully: returns 0 rather than
 * throwing, so a single bad row never crashes a whole season view. Callers
 * that need to *validate* input (e.g. the Excel importer, War Mode's form)
 * should check `isValidFinishingPosition` / `hasPointsMappingFor` first and
 * surface a real error to the user instead of silently accepting 0.
 */
export function calculatePointsFromPosition(
  position: number,
  pointsMapping: PointsMapping
): number {
  if (!Number.isFinite(position) || position <= 0) return 0;
  const entry = pointsMapping.find((e) => e.finishingPosition === position);
  return entry ? entry.points : 0;
}

export function hasPointsMappingFor(position: number, pointsMapping: PointsMapping): boolean {
  return pointsMapping.some((e) => e.finishingPosition === position);
}

export function isValidFinishingPosition(position: unknown): position is number {
  return (
    typeof position === "number" &&
    Number.isInteger(position) &&
    position >= 1 &&
    position <= 12
  );
}

export function maxFinishingPosition(pointsMapping: PointsMapping): number {
  return pointsMapping.reduce((max, e) => Math.max(max, e.finishingPosition), 0);
}
