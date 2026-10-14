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
  /**
   * MKWii's 7 internal vehicle stats, on the game's own raw scale (not a
   * normalized 1-5/1-80 display rating) -- added to the chosen character's
   * bonus stats (see characters.ts' CharacterInfo) to get a build's final
   * combined stats (buildstats.ts' combineBuildStats). Sourced from Super
   * Mario Wiki's Mario Kart Wii "Internal stats" -> "Vehicles' stats"
   * table and individual vehicle pages (mariowiki.com), cross-checked
   * across several page fetches the same way the type/weight-class
   * research above already was -- some vehicle pages display these same
   * raw numbers as an "x/80" bar rather than a bare number, which is just
   * that page's display convention, not a different scale.
   */
  speed: number;
  weight: number;
  acceleration: number;
  handling: number;
  drift: number;
  offRoad: number;
  miniTurbo: number;
}

export const VEHICLES: VehicleInfo[] = [
  // --- Small ---
  { id: "standard-kart-s", name: "Standard Kart S", type: "kart", weightClass: "small", speed: 41, weight: 29, acceleration: 48, handling: 48, drift: 51, offRoad: 40, miniTurbo: 45 },
  { id: "booster-seat", name: "Booster Seat", type: "kart", weightClass: "small", speed: 27, weight: 27, acceleration: 56, handling: 64, drift: 37, offRoad: 54, miniTurbo: 59 },
  { id: "mini-beast", name: "Mini Beast", type: "kart", weightClass: "small", speed: 55, weight: 32, acceleration: 29, handling: 32, drift: 64, offRoad: 27, miniTurbo: 64 },
  { id: "cheep-charger", name: "Cheep Charger", type: "kart", weightClass: "small", speed: 34, weight: 24, acceleration: 64, handling: 56, drift: 59, offRoad: 45, miniTurbo: 54 },
  { id: "tiny-titan", name: "Tiny Titan", type: "kart", weightClass: "small", speed: 46, weight: 35, acceleration: 43, handling: 43, drift: 29, offRoad: 64, miniTurbo: 40 },
  { id: "blue-falcon", name: "Blue Falcon", type: "kart", weightClass: "small", speed: 60, weight: 29, acceleration: 35, handling: 29, drift: 43, offRoad: 24, miniTurbo: 29 },
  { id: "standard-bike-s", name: "Standard Bike S", type: "bike", weightClass: "small", speed: 39, weight: 21, acceleration: 51, handling: 51, drift: 54, offRoad: 43, miniTurbo: 48 },
  { id: "bullet-bike", name: "Bullet Bike", type: "bike", weightClass: "small", speed: 53, weight: 24, acceleration: 32, handling: 35, drift: 67, offRoad: 29, miniTurbo: 67 },
  { id: "bit-bike", name: "Bit Bike", type: "bike", weightClass: "small", speed: 25, weight: 18, acceleration: 59, handling: 67, drift: 40, offRoad: 56, miniTurbo: 62 },
  { id: "quacker", name: "Quacker", type: "bike", weightClass: "small", speed: 32, weight: 17, acceleration: 67, handling: 60, drift: 62, offRoad: 48, miniTurbo: 57 },
  { id: "magikruiser", name: "Magikruiser", type: "bike", weightClass: "small", speed: 43, weight: 24, acceleration: 45, handling: 45, drift: 32, offRoad: 67, miniTurbo: 43 },
  { id: "jet-bubble", name: "Jet Bubble", type: "bike", weightClass: "small", speed: 48, weight: 27, acceleration: 40, handling: 40, drift: 45, offRoad: 35, miniTurbo: 37 },
  // --- Medium ---
  { id: "standard-kart-m", name: "Standard Kart M", type: "kart", weightClass: "medium", speed: 46, weight: 45, acceleration: 40, handling: 43, drift: 45, offRoad: 35, miniTurbo: 40 },
  { id: "classic-dragster", name: "Classic Dragster", type: "kart", weightClass: "medium", speed: 37, weight: 43, acceleration: 59, handling: 54, drift: 54, offRoad: 40, miniTurbo: 51 },
  { id: "wild-wing", name: "Wild Wing", type: "kart", weightClass: "medium", speed: 57, weight: 51, acceleration: 21, handling: 29, drift: 59, offRoad: 24, miniTurbo: 59 },
  { id: "super-blooper", name: "Super Blooper", type: "kart", weightClass: "medium", speed: 50, weight: 40, acceleration: 35, handling: 37, drift: 21, offRoad: 54, miniTurbo: 35 },
  { id: "zip-zip", name: "Zip Zip", type: "kart", weightClass: "medium", speed: 41, weight: 35, acceleration: 45, handling: 51, drift: 29, offRoad: 62, miniTurbo: 45 },
  { id: "daytripper", name: "Daytripper", type: "kart", weightClass: "medium", speed: 34, weight: 45, acceleration: 51, handling: 59, drift: 32, offRoad: 48, miniTurbo: 54 },
  { id: "standard-bike-m", name: "Standard Bike M", type: "bike", weightClass: "medium", speed: 43, weight: 37, acceleration: 43, handling: 45, drift: 48, offRoad: 37, miniTurbo: 43 },
  { id: "mach-bike", name: "Mach Bike", type: "bike", weightClass: "medium", speed: 55, weight: 37, acceleration: 24, handling: 32, drift: 62, offRoad: 27, miniTurbo: 62 },
  { id: "sugarscoot", name: "Sugarscoot", type: "bike", weightClass: "medium", speed: 32, weight: 32, acceleration: 54, handling: 62, drift: 35, offRoad: 51, miniTurbo: 56 },
  { id: "sprinter", name: "Sprinter", type: "bike", weightClass: "medium", speed: 64, weight: 48, acceleration: 27, handling: 24, drift: 37, offRoad: 21, miniTurbo: 24 },
  { id: "sneakster", name: "Sneakster", type: "bike", weightClass: "medium", speed: 62, weight: 40, acceleration: 29, handling: 27, drift: 40, offRoad: 24, miniTurbo: 27 },
  { id: "dolphin-dasher", name: "Dolphin Dasher", type: "bike", weightClass: "medium", speed: 48, weight: 43, acceleration: 37, handling: 40, drift: 24, offRoad: 56, miniTurbo: 37 },
  // --- Large ---
  { id: "standard-kart-l", name: "Standard Kart L", type: "kart", weightClass: "large", speed: 48, weight: 59, acceleration: 37, handling: 40, drift: 40, offRoad: 35, miniTurbo: 35 },
  { id: "offroader", name: "Offroader", type: "kart", weightClass: "large", speed: 39, weight: 64, acceleration: 48, handling: 54, drift: 18, offRoad: 43, miniTurbo: 45 },
  { id: "flame-flyer", name: "Flame Flyer", type: "kart", weightClass: "large", speed: 62, weight: 59, acceleration: 16, handling: 21, drift: 48, offRoad: 18, miniTurbo: 48 },
  { id: "piranha-prowler", name: "Piranha Prowler", type: "kart", weightClass: "large", speed: 55, weight: 67, acceleration: 29, handling: 35, drift: 35, offRoad: 29, miniTurbo: 27 },
  { id: "jetsetter", name: "Jetsetter", type: "kart", weightClass: "large", speed: 69, weight: 56, acceleration: 21, handling: 17, drift: 27, offRoad: 16, miniTurbo: 16 },
  { id: "honeycoupe", name: "Honeycoupe", type: "kart", weightClass: "large", speed: 53, weight: 62, acceleration: 27, handling: 29, drift: 56, offRoad: 24, miniTurbo: 56 },
  { id: "standard-bike-l", name: "Standard Bike L", type: "bike", weightClass: "large", speed: 46, weight: 54, acceleration: 40, handling: 43, drift: 43, offRoad: 37, miniTurbo: 37 },
  { id: "flame-runner", name: "Flame Runner", type: "bike", weightClass: "large", speed: 60, weight: 54, acceleration: 18, handling: 24, drift: 51, offRoad: 21, miniTurbo: 51 },
  { id: "wario-bike", name: "Wario Bike", type: "bike", weightClass: "large", speed: 37, weight: 59, acceleration: 51, handling: 56, drift: 21, offRoad: 45, miniTurbo: 48 },
  { id: "shooting-star", name: "Shooting Star", type: "bike", weightClass: "large", speed: 50, weight: 48, acceleration: 29, handling: 32, drift: 59, offRoad: 27, miniTurbo: 59 },
  { id: "spear", name: "Spear", type: "bike", weightClass: "large", speed: 67, weight: 56, acceleration: 24, handling: 18, drift: 29, offRoad: 18, miniTurbo: 18 },
  { id: "phantom", name: "Phantom", type: "bike", weightClass: "large", speed: 43, weight: 51, acceleration: 43, handling: 48, drift: 17, offRoad: 56, miniTurbo: 40 },
];

export const VEHICLES_BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

/** Icon art downloaded from MarioWiki's vehicle gallery (public/vehicles/<id>.png). */
export function vehicleImageUrl(vehicleId: string): string {
  return `/vehicles/${vehicleId}.png`;
}

/** Every kart/bike a character of this weight class is actually allowed to drive. */
export function getVehiclesForWeightClass(weightClass: WeightClass): VehicleInfo[] {
  return VEHICLES.filter((v) => v.weightClass === weightClass);
}

export function isVehicleAvailableToWeightClass(vehicleId: string, weightClass: WeightClass): boolean {
  return VEHICLES_BY_ID.get(vehicleId)?.weightClass === weightClass;
}
