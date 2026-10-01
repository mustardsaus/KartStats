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
}

export const CHARACTERS: CharacterInfo[] = [
  // --- Small ---
  { id: "baby-mario", name: "Baby Mario", weightClass: "small" },
  { id: "baby-peach", name: "Baby Peach", weightClass: "small" },
  { id: "baby-luigi", name: "Baby Luigi", weightClass: "small" },
  { id: "baby-daisy", name: "Baby Daisy", weightClass: "small" },
  { id: "toad", name: "Toad", weightClass: "small" },
  { id: "toadette", name: "Toadette", weightClass: "small" },
  { id: "koopa-troopa", name: "Koopa Troopa", weightClass: "small" },
  { id: "dry-bones", name: "Dry Bones", weightClass: "small" },
  // --- Medium ---
  { id: "mario", name: "Mario", weightClass: "medium" },
  { id: "luigi", name: "Luigi", weightClass: "medium" },
  { id: "peach", name: "Peach", weightClass: "medium" },
  { id: "daisy", name: "Daisy", weightClass: "medium" },
  { id: "yoshi", name: "Yoshi", weightClass: "medium" },
  { id: "birdo", name: "Birdo", weightClass: "medium" },
  { id: "diddy-kong", name: "Diddy Kong", weightClass: "medium" },
  { id: "bowser-jr", name: "Bowser Jr.", weightClass: "medium" },
  // --- Large ---
  { id: "wario", name: "Wario", weightClass: "large" },
  { id: "waluigi", name: "Waluigi", weightClass: "large" },
  { id: "donkey-kong", name: "Donkey Kong", weightClass: "large" },
  { id: "bowser", name: "Bowser", weightClass: "large" },
  { id: "king-boo", name: "King Boo", weightClass: "large" },
  { id: "rosalina", name: "Rosalina", weightClass: "large" },
  { id: "funky-kong", name: "Funky Kong", weightClass: "large" },
  { id: "dry-bowser", name: "Dry Bowser", weightClass: "large" },
  // --- Mii (class simplified — see module comment) ---
  { id: "mii", name: "Mii", weightClass: "medium" },
];

export const CHARACTERS_BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacterWeightClass(characterId: string): WeightClass | null {
  return CHARACTERS_BY_ID.get(characterId)?.weightClass ?? null;
}
