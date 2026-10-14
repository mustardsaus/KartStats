import type { WeightClass } from "@/lib/types";

/**
 * The Mario Kart Wii playable roster, grouped by the game's actual size/
 * weight class — researched against Super Mario Wiki / StrategyWiki rather
 * than assumed, since weight class is exactly what gates kart availability
 * below (see karts.ts). The real game splits this 8/8/8 across small/
 * medium/large, plus two selectable Mii outfits whose class actually
 * depends on the Mii's configured height on the console — this app treats
 * "Mii" as a single roster entry pinned to medium, a deliberate
 * simplification documented here rather than modeled precisely, since
 * nothing about a real Mii's in-game height is available to this app.
 */
export interface CharacterInfo {
  id: string;
  name: string;
  weightClass: WeightClass;
  /**
   * MKWii's 7 internal character stats -- each value is the character's
   * bonus/malus contribution before adding the chosen vehicle's own base
   * stats (see karts.ts' VehicleInfo). Sourced from Super Mario Wiki's
   * Mario Kart Wii "Internal stats" -> "Characters' bonuses" table
   * (mariowiki.com/Mario_Kart_Wii), cross-checked against the well-known
   * jdaster64 Kart/Character/Item FAQ's description of the same system
   * (character and vehicle stats combine by simple per-stat addition --
   * see buildstats.ts' combineBuildStats). 0 means "no bonus for this
   * stat", not "worst possible."
   */
  speed: number;
  weight: number;
  acceleration: number;
  handling: number;
  drift: number;
  offRoad: number;
  miniTurbo: number;
}

export const CHARACTERS: CharacterInfo[] = [
  // --- Small ---
  { id: "baby-mario", name: "Baby Mario", weightClass: "small", speed: 0, weight: 8, acceleration: 0, handling: 6, drift: 0, offRoad: 0, miniTurbo: 0 },
  { id: "baby-peach", name: "Baby Peach", weightClass: "small", speed: 3, weight: 6, acceleration: 3, handling: 3, drift: 0, offRoad: 0, miniTurbo: 0 },
  { id: "baby-luigi", name: "Baby Luigi", weightClass: "small", speed: 5, weight: 8, acceleration: 0, handling: 0, drift: 0, offRoad: 0, miniTurbo: 0 },
  { id: "baby-daisy", name: "Baby Daisy", weightClass: "small", speed: 5, weight: 6, acceleration: 0, handling: 0, drift: 0, offRoad: 0, miniTurbo: 3 },
  { id: "toad", name: "Toad", weightClass: "small", speed: 0, weight: 0, acceleration: 6, handling: 0, drift: 6, offRoad: 0, miniTurbo: 0 },
  { id: "toadette", name: "Toadette", weightClass: "small", speed: 3, weight: 0, acceleration: 0, handling: 0, drift: 0, offRoad: 6, miniTurbo: 0 },
  { id: "koopa-troopa", name: "Koopa Troopa", weightClass: "small", speed: 0, weight: 0, acceleration: 0, handling: 3, drift: 0, offRoad: 0, miniTurbo: 6 },
  { id: "dry-bones", name: "Dry Bones", weightClass: "small", speed: 0, weight: 0, acceleration: 3, handling: 0, drift: 3, offRoad: 0, miniTurbo: 6 },
  // --- Medium ---
  { id: "mario", name: "Mario", weightClass: "medium", speed: 0, weight: 6, acceleration: 2, handling: 2, drift: 3, offRoad: 0, miniTurbo: 0 },
  { id: "luigi", name: "Luigi", weightClass: "medium", speed: 2, weight: 6, acceleration: 0, handling: 0, drift: 0, offRoad: 0, miniTurbo: 0 },
  { id: "peach", name: "Peach", weightClass: "medium", speed: 2, weight: 0, acceleration: 5, handling: 0, drift: 6, offRoad: 0, miniTurbo: 0 },
  { id: "daisy", name: "Daisy", weightClass: "medium", speed: 4, weight: 0, acceleration: 0, handling: 2, drift: 0, offRoad: 0, miniTurbo: 3 },
  { id: "yoshi", name: "Yoshi", weightClass: "medium", speed: 0, weight: 3, acceleration: 0, handling: 0, drift: 3, offRoad: 5, miniTurbo: 0 },
  { id: "birdo", name: "Birdo", weightClass: "medium", speed: 0, weight: 3, acceleration: 0, handling: 0, drift: 0, offRoad: 3, miniTurbo: 5 },
  { id: "diddy-kong", name: "Diddy Kong", weightClass: "medium", speed: 0, weight: 0, acceleration: 3, handling: 0, drift: 3, offRoad: 0, miniTurbo: 5 },
  { id: "bowser-jr", name: "Bowser Jr.", weightClass: "medium", speed: 0, weight: 0, acceleration: 0, handling: 0, drift: 0, offRoad: 3, miniTurbo: 3 },
  // --- Large ---
  { id: "wario", name: "Wario", weightClass: "large", speed: 0, weight: 3, acceleration: 0, handling: 0, drift: 0, offRoad: 3, miniTurbo: 6 },
  { id: "waluigi", name: "Waluigi", weightClass: "large", speed: 0, weight: 0, acceleration: 6, handling: 0, drift: 5, offRoad: 3, miniTurbo: 0 },
  { id: "donkey-kong", name: "Donkey Kong", weightClass: "large", speed: 0, weight: 3, acceleration: 2, handling: 2, drift: 0, offRoad: 0, miniTurbo: 3 },
  { id: "bowser", name: "Bowser", weightClass: "large", speed: 2, weight: 5, acceleration: 0, handling: 0, drift: 3, offRoad: 0, miniTurbo: 0 },
  { id: "king-boo", name: "King Boo", weightClass: "large", speed: 0, weight: 0, acceleration: 0, handling: 5, drift: 0, offRoad: 3, miniTurbo: 0 },
  { id: "rosalina", name: "Rosalina", weightClass: "large", speed: 3, weight: 0, acceleration: 0, handling: 3, drift: 0, offRoad: 0, miniTurbo: 3 },
  { id: "funky-kong", name: "Funky Kong", weightClass: "large", speed: 4, weight: 0, acceleration: 0, handling: 0, drift: 0, offRoad: 3, miniTurbo: 0 },
  { id: "dry-bowser", name: "Dry Bowser", weightClass: "large", speed: 0, weight: 0, acceleration: 0, handling: 0, drift: 0, offRoad: 6, miniTurbo: 6 },
  // --- Mii (class simplified — see module comment) ---
  { id: "mii", name: "Mii", weightClass: "medium", speed: 3, weight: 3, acceleration: 0, handling: 0, drift: 0, offRoad: 3, miniTurbo: 3 },
];

export const CHARACTERS_BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

/**
 * Portrait art downloaded from MarioWiki (public/characters/<id>.png) --
 * one official artwork per character, resized for the web. "mii" has no
 * single clean portrait on the wiki (its page shows a group photo), so
 * there's no file for it -- CharacterIcon falls back to the colored
 * initial badge when the image 404s, same as it always did before any
 * art existed.
 */
export function characterImageUrl(characterId: string): string {
  return `/characters/${characterId}.png`;
}

export function getCharacterWeightClass(characterId: string): WeightClass | null {
  return CHARACTERS_BY_ID.get(characterId)?.weightClass ?? null;
}
