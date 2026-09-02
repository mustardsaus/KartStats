import type { Circuit } from "@/lib/types";

/**
 * The full 32-circuit Mario Kart Wii roster (16 Nitro + 16 Retro) — one
 * season, one lap through every track. Image URLs point at real track
 * photography in /public/circuits. Every circuit now has a real photo;
 * CircuitImage still falls back to generated placeholder art automatically
 * if a file ever goes missing, so nothing else needs to change if one is
 * swapped later.
 */
export const CIRCUITS: Circuit[] = [
  // --- Nitro cups ---
  { id: "luigi-circuit", name: "Luigi Circuit", imageUrl: "/circuits/luigi-circuit.jpg", cup: "Mushroom Cup", category: "Nitro" },
  { id: "moo-moo-meadows", name: "Moo Moo Meadows", imageUrl: "/circuits/moo-moo-meadows.jpg", cup: "Mushroom Cup", category: "Nitro" },
  { id: "mushroom-gorge", name: "Mushroom Gorge", imageUrl: "/circuits/mushroom-gorge.jpg", cup: "Mushroom Cup", category: "Nitro" },
  { id: "toads-factory", name: "Toad's Factory", imageUrl: "/circuits/toads-factory.jpg", cup: "Mushroom Cup", category: "Nitro" },
  { id: "mario-circuit", name: "Mario Circuit", imageUrl: "/circuits/mario-circuit.jpg", cup: "Flower Cup", category: "Nitro" },
  { id: "coconut-mall", name: "Coconut Mall", imageUrl: "/circuits/coconut-mall.jpg", cup: "Flower Cup", category: "Nitro" },
  { id: "dk-summit", name: "DK Summit", imageUrl: "/circuits/dk-summit.jpg", cup: "Flower Cup", category: "Nitro" },
  { id: "warios-gold-mine", name: "Wario's Gold Mine", imageUrl: "/circuits/warios-gold-mine.jpg", cup: "Flower Cup", category: "Nitro" },
  { id: "daisy-circuit", name: "Daisy Circuit", imageUrl: "/circuits/daisy-circuit.jpg", cup: "Star Cup", category: "Nitro" },
  { id: "koopa-cape", name: "Koopa Cape", imageUrl: "/circuits/koopa-cape.jpg", cup: "Star Cup", category: "Nitro" },
  { id: "maple-treeway", name: "Maple Treeway", imageUrl: "/circuits/maple-treeway.jpg", cup: "Star Cup", category: "Nitro" },
  { id: "grumble-volcano", name: "Grumble Volcano", imageUrl: "/circuits/grumble-volcano.jpg", cup: "Star Cup", category: "Nitro" },
  { id: "dry-dry-ruins", name: "Dry Dry Ruins", imageUrl: "/circuits/dry-dry-ruins.jpg", cup: "Special Cup", category: "Nitro" },
  { id: "moonview-highway", name: "Moonview Highway", imageUrl: "/circuits/moonview-highway.jpg", cup: "Special Cup", category: "Nitro" },
  { id: "bowsers-castle", name: "Bowser's Castle", imageUrl: "/circuits/bowsers-castle.jpg", cup: "Special Cup", category: "Nitro" },
  { id: "rainbow-road", name: "Rainbow Road", imageUrl: "/circuits/rainbow-road.jpg", cup: "Special Cup", category: "Nitro" },
  // --- Retro cups ---
  { id: "gcn-peach-beach", name: "GCN Peach Beach", imageUrl: "/circuits/gcn-peach-beach.jpg", cup: "Shell Cup", category: "Retro" },
  { id: "ds-yoshi-falls", name: "DS Yoshi Falls", imageUrl: "/circuits/ds-yoshi-falls.jpg", cup: "Shell Cup", category: "Retro" },
  { id: "snes-ghost-valley-2", name: "SNES Ghost Valley 2", imageUrl: "/circuits/snes-ghost-valley-2.jpg", cup: "Shell Cup", category: "Retro" },
  { id: "n64-mario-raceway", name: "N64 Mario Raceway", imageUrl: "/circuits/n64-mario-raceway.jpg", cup: "Shell Cup", category: "Retro" },
  { id: "n64-sherbet-land", name: "N64 Sherbet Land", imageUrl: "/circuits/n64-sherbet-land.jpg", cup: "Banana Cup", category: "Retro" },
  { id: "gba-shy-guy-beach", name: "GBA Shy Guy Beach", imageUrl: "/circuits/gba-shy-guy-beach.jpg", cup: "Banana Cup", category: "Retro" },
  { id: "ds-delfino-square", name: "DS Delfino Square", imageUrl: "/circuits/ds-delfino-square.jpg", cup: "Banana Cup", category: "Retro" },
  { id: "gcn-waluigi-stadium", name: "GCN Waluigi Stadium", imageUrl: "/circuits/gcn-waluigi-stadium.jpg", cup: "Banana Cup", category: "Retro" },
  { id: "ds-desert-hills", name: "DS Desert Hills", imageUrl: "/circuits/ds-desert-hills.jpg", cup: "Leaf Cup", category: "Retro" },
  { id: "gba-bowser-castle-3", name: "GBA Bowser Castle 3", imageUrl: "/circuits/gba-bowser-castle-3.jpg", cup: "Leaf Cup", category: "Retro" },
  { id: "n64-dks-jungle-parkway", name: "N64 DK's Jungle Parkway", imageUrl: "/circuits/n64-dks-jungle-parkway.jpg", cup: "Leaf Cup", category: "Retro" },
  { id: "gcn-mario-circuit", name: "GCN Mario Circuit", imageUrl: "/circuits/gcn-mario-circuit.jpg", cup: "Leaf Cup", category: "Retro" },
  { id: "snes-mario-circuit-3", name: "SNES Mario Circuit 3", imageUrl: "/circuits/snes-mario-circuit-3.jpg", cup: "Lightning Cup", category: "Retro" },
  { id: "ds-peach-gardens", name: "DS Peach Gardens", imageUrl: "/circuits/ds-peach-gardens.jpg", cup: "Lightning Cup", category: "Retro" },
  { id: "gcn-dk-mountain", name: "GCN DK Mountain", imageUrl: "/circuits/gcn-dk-mountain.jpg", cup: "Lightning Cup", category: "Retro" },
  { id: "n64-bowsers-castle", name: "N64 Bowser's Castle", imageUrl: "/circuits/n64-bowsers-castle.jpg", cup: "Lightning Cup", category: "Retro" },
];

export const CIRCUITS_BY_ID = new Map(CIRCUITS.map((c) => [c.id, c]));
