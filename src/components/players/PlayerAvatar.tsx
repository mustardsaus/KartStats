"use client";

import { useState } from "react";
import type { PlayerId } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { WatercolorImage } from "@/components/media/WatercolorImage";
import { useIsDarkTheme } from "@/lib/hooks/useIsDarkTheme";
import { cn } from "@/lib/utils";

const CONFIG: Record<PlayerId, { initial: string; from: string; to: string; ring: string }> = {
  adi: { initial: "A", from: "#8a2f1c", to: "#b0512f", ring: "#c96a3f" },
  ren: { initial: "R", from: "#21415f", to: "#416f93", ring: "#5487ab" },
};

/**
 * Player portrait: renders the real character art (Toad / Dry Bones)
 * supplied for the app, circle-cropped and ringed in the player's color.
 * Falls back to a generated initial badge if the image is ever missing —
 * same "real asset with a graceful placeholder" pattern as CircuitImage.
 *
 * `watercolor` paints the live canvas effect (see WatercolorImage) instead
 * of the crisp source photo, for the spots (trophy cards) that want the
 * illustrated look — drawn once at its finished frame, no animated
 * reveal, since these are compact badges rather than a narrative moment.
 * Plain nav/list badges stay the crisp real photo.
 */
export function PlayerAvatar({
  playerId,
  size = 96,
  className,
  watercolor = false,
}: {
  playerId: PlayerId;
  size?: number;
  className?: string;
  watercolor?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const isDark = useIsDarkTheme();
  const cfg = CONFIG[playerId];
  const imageUrl = PLAYERS[playerId].profileImageUrl;
  const ringColor = playerId === "adi" ? "var(--color-adi)" : "var(--color-ren)";
  const label = `${PLAYERS[playerId].name} — ${cfg.initial === "A" ? "Toad" : "Dry Bones"} portrait`;

  if (errored || !imageUrl) {
    return <PlayerAvatarPlaceholder playerId={playerId} size={size} className={className} />;
  }

  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full bg-surface-raised", className)}
      style={{ width: size, height: size, boxShadow: `0 0 0 2.5px ${ringColor}80` }}
    >
      {watercolor ? (
        <WatercolorImage
          src={imageUrl}
          alt={label}
          className="h-full w-full"
          objectPosition="top"
          focal={[0.5, 0.32]}
          instant
          raw={isDark}
          workingLongEdge={800}
          onError={() => setErrored(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={label}
          className="h-full w-full object-cover object-top"
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
}

function PlayerAvatarPlaceholder({
  playerId,
  size,
  className,
}: {
  playerId: PlayerId;
  size: number;
  className?: string;
}) {
  const cfg = CONFIG[playerId];
  const gradientId = `player-grad-${playerId}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={`${playerId === "adi" ? "Adi" : "Ren"} portrait`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={cfg.from} />
          <stop offset="100%" stopColor={cfg.to} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#${gradientId})`} />
      <circle cx="50" cy="50" r="47" fill="none" stroke={cfg.ring} strokeWidth="2.5" opacity="0.8" />
      <path d="M18 55 Q50 30 82 55 L82 62 Q50 42 18 62 Z" fill="rgba(28,19,10,0.3)" />
      <text
        x="50"
        y="60"
        textAnchor="middle"
        fontFamily="'Mayro Kart Retro', 'Cinzel', serif"
        fontWeight="700"
        fontSize="36"
        fill="#ecdfbd"
        opacity="0.95"
      >
        {cfg.initial}
      </text>
    </svg>
  );
}
