import { cn } from "@/lib/utils";
import { CHARACTERS_BY_ID } from "@/lib/data/characters";

/**
 * A small "face" for a picked character. No licensed artwork is bundled
 * for the roster (see the module comment in lib/data/characters.ts), so
 * this is a clean colored initial-letter badge rather than a broken
 * image — the same placeholder CharacterPicker's own list already used
 * per-row, pulled out here so every place that shows an ALREADY-PICKED
 * character (the kart step's header, the "use previous setup" summary)
 * can show the same small icon next to the name instead of bare text.
 */
export function CharacterIcon({
  characterId,
  accent,
  size = "sm",
  className,
}: {
  characterId: string;
  accent: "adi" | "ren";
  size?: "sm" | "md";
  className?: string;
}) {
  const name = CHARACTERS_BY_ID.get(characterId)?.name ?? characterId;
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-hud font-bold",
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-10 w-10 text-sm",
        accent === "adi" ? "bg-adi/25 text-adi" : "bg-ren/25 text-ren",
        className
      )}
    >
      {name.charAt(0)}
    </span>
  );
}
