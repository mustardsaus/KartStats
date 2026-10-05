"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CHARACTERS_BY_ID, characterImageUrl } from "@/lib/data/characters";

/**
 * A small "face" for a picked character. Real portrait art is bundled
 * under public/characters/ (see characterImageUrl) for every roster
 * entry except "mii" (no single clean portrait exists on the wiki) --
 * this falls back to the original colored initial-letter badge whenever
 * the image 404s, so a missing/unrecognized id never shows a broken
 * image.
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
  const [imageFailed, setImageFailed] = useState(false);
  const name = CHARACTERS_BY_ID.get(characterId)?.name ?? characterId;
  const dimension = size === "sm" ? "h-6 w-6" : "h-10 w-10";

  if (!imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small decorative icon, not worth next/image's config here
      <img
        src={characterImageUrl(characterId)}
        alt={name}
        title={name}
        onError={() => setImageFailed(true)}
        className={cn("inline-block shrink-0 rounded-full object-cover object-top", dimension, className)}
      />
    );
  }

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
