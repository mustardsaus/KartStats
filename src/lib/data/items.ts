import type { ItemId } from "@/lib/types";

export interface Item {
  id: ItemId;
  name: string;
}

/** The full Mario Kart Wii item roster, in roughly the order they appear on the in-game item list. */
export const ITEMS: Item[] = [
  { id: "mushroom", name: "Mushroom" },
  { id: "triple-mushrooms", name: "Triple Mushrooms" },
  { id: "golden-mushroom", name: "Golden Mushroom" },
  { id: "mega-mushroom", name: "Mega Mushroom" },
  { id: "green-shell", name: "Green Shell" },
  { id: "triple-green-shells", name: "Triple Green Shells" },
  { id: "red-shell", name: "Red Shell" },
  { id: "triple-red-shells", name: "Triple Red Shells" },
  { id: "blue-shell", name: "Spiny Blue Shell" },
  { id: "banana", name: "Banana" },
  { id: "triple-bananas", name: "Triple Bananas" },
  { id: "bob-omb", name: "Bob-omb" },
  { id: "fake-item-box", name: "Fake Item Box" },
  { id: "bullet-bill", name: "Bullet Bill" },
  { id: "star", name: "Star" },
  { id: "blooper", name: "Blooper" },
  { id: "pow-block", name: "POW Block" },
  { id: "thunder-cloud", name: "Thunder Cloud" },
  { id: "lightning", name: "Lightning" },
];

export const ITEMS_BY_ID: Record<ItemId, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<
  ItemId,
  Item
>;
