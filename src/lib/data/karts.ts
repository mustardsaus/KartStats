import type { WeightClass } from "@/lib/types";

/**
 * The Mario Kart Wii vehicle roster — 36 vehicles total, 18 karts + 18
 * bikes, split evenly 6+6 per weight class. Researched against Super Mario
 * Wiki / StrategyWiki (cross-checked across several passes — some of the
 * game's own reference pages disagree with each other on a handful of
 * kart/bike tags, so this list was reconciled against the game's well-
 * documented 6-kart + 6-bike-per-class structure rather than taken from
 * any single source verbatim) rather than assumed. A character can only
 * use vehicles matching their own weightClass (see characters.ts) — that
 * restriction is enforced by getVehiclesForWeightClass below, never by
 * showing every vehicle for every character.
 */
export type VehicleType = "kart" | "bike";

export interface VehicleInfo {
  id: string;
  name: string;
  type: VehicleType;
  weightClass: WeightClass;
}

export const VEHICLES: VehicleInfo[] = [
  // --- Small ---
  { id: "standard-kart-s", name: "Standard Kart S", type: "kart", weightClass: "small" },
  { id: "booster-seat", name: "Booster Seat", type: "kart", weightClass: "small" },
  { id: "mini-beast", name: "Mini Beast", type: "kart", weightClass: "small" },
  { id: "cheep-charger", name: "Cheep Charger", type: "kart", weightClass: "small" },
  { id: "tiny-titan", name: "Tiny Titan", type: "kart", weightClass: "small" },
  { id: "blue-falcon", name: "Blue Falcon", type: "kart", weightClass: "small" },
  { id: "standard-bike-s", name: "Standard Bike S", type: "bike", weightClass: "small" },
  { id: "bullet-bike", name: "Bullet Bike", type: "bike", weightClass: "small" },
  { id: "bit-bike", name: "Bit Bike", type: "bike", weightClass: "small" },
  { id: "quacker", name: "Quacker", type: "bike", weightClass: "small" },
  { id: "magikruiser", name: "Magikruiser", type: "bike", weightClass: "small" },
  { id: "jet-bubble", name: "Jet Bubble", type: "bike", weightClass: "small" },
  // --- Medium ---
  { id: "standard-kart-m", name: "Standard Kart M", type: "kart", weightClass: "medium" },
  { id: "classic-dragster", name: "Classic Dragster", type: "kart", weightClass: "medium" },
  { id: "wild-wing", name: "Wild Wing", type: "kart", weightClass: "medium" },
  { id: "super-blooper", name: "Super Blooper", type: "kart", weightClass: "medium" },
  { id: "zip-zip", name: "Zip Zip", type: "kart", weightClass: "medium" },
  { id: "daytripper", name: "Daytripper", type: "kart", weightClass: "medium" },
  { id: "standard-bike-m", name: "Standard Bike M", type: "bike", weightClass: "medium" },
  { id: "mach-bike", name: "Mach Bike", type: "bike", weightClass: "medium" },
  { id: "sugarscoot", name: "Sugarscoot", type: "bike", weightClass: "medium" },
  { id: "sprinter", name: "Sprinter", type: "bike", weightClass: "medium" },
  { id: "sneakster", name: "Sneakster", type: "bike", weightClass: "medium" },
  { id: "dolphin-dasher", name: "Dolphin Dasher", type: "bike", weightClass: "medium" },
  // --- Large ---
  { id: "standard-kart-l", name: "Standard Kart L", type: "kart", weightClass: "large" },
  { id: "offroader", name: "Offroader", type: "kart", weightClass: "large" },
  { id: "flame-flyer", name: "Flame Flyer", type: "kart", weightClass: "large" },
  { id: "piranha-prowler", name: "Piranha Prowler", type: "kart", weightClass: "large" },
  { id: "jetsetter", name: "Jetsetter", type: "kart", weightClass: "large" },
  { id: "honeycoupe", name: "Honeycoupe", type: "kart", weightClass: "large" },
  { id: "standard-bike-l", name: "Standard Bike L", type: "bike", weightClass: "large" },
  { id: "flame-runner", name: "Flame Runner", type: "bike", weightClass: "large" },
  { id: "wario-bike", name: "Wario Bike", type: "bike", weightClass: "large" },
  { id: "shooting-star", name: "Shooting Star", type: "bike", weightClass: "large" },
  { id: "spear", name: "Spear", type: "bike", weightClass: "large" },
  { id: "phantom", name: "Phantom", type: "bike", weightClass: "large" },
];

export const VEHICLES_BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

/** Every kart/bike a character of this weight class is actually allowed to drive. */
export function getVehiclesForWeightClass(weightClass: WeightClass): VehicleInfo[] {
  return VEHICLES.filter((v) => v.weightClass === weightClass);
}

export function isVehicleAvailableToWeightClass(vehicleId: string, weightClass: WeightClass): boolean {
  return VEHICLES_BY_ID.get(vehicleId)?.weightClass === weightClass;
}
