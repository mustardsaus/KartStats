import type { PointsMapping } from "@/lib/types";

/**
 * Default points mapping — Mario Kart Wii's actual 12-racer scoring system,
 * as supplied by the user (1st through 12th): 15, 12, 10, 8, 7, 6, 5, 4, 3,
 * 2, 1, 0. This is only a starting default — the real mapping is imported
 * from the user's Excel file (see lib/excel/parse.ts) and can be replaced
 * without touching any calculation code, per spec section 3.
 */
export const DEFAULT_POINTS_MAPPING: PointsMapping = [
  { finishingPosition: 1, points: 15 },
  { finishingPosition: 2, points: 12 },
  { finishingPosition: 3, points: 10 },
  { finishingPosition: 4, points: 8 },
  { finishingPosition: 5, points: 7 },
  { finishingPosition: 6, points: 6 },
  { finishingPosition: 7, points: 5 },
  { finishingPosition: 8, points: 4 },
  { finishingPosition: 9, points: 3 },
  { finishingPosition: 10, points: 2 },
  { finishingPosition: 11, points: 1 },
  { finishingPosition: 12, points: 0 },
];

export const PLAYERS = {
  adi: {
    id: "adi" as const,
    name: "Adi",
    characterName: "Toad",
    profileImageUrl: "/players/toad.webp",
  },
  ren: {
    id: "ren" as const,
    name: "Ren",
    characterName: "Dry Bones",
    profileImageUrl: "/players/dry-bones.webp",
  },
};
