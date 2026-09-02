import type { PlayerId } from "@/lib/types";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { PLAYERS } from "@/lib/data/points-mapping";
import { formatDate } from "@/lib/utils";
import { Trophy, Crown, Flame } from "lucide-react";

const ICONS = { champion: Crown, alltime: Trophy, record: Flame };

const UNROLL_START = 1.9; // s — after the hero watercolor has bloomed in
const UNROLL_STAGGER = 0.28; // s between scrolls

interface TrophyCardProps {
  kind: "champion" | "alltime" | "record";
  label: string;
  playerId: PlayerId | null;
  points: number | null;
  pointsLabel: string;
  subline: string;
  emptyMessage: string;
  /** position in the row — drives the unroll stagger */
  index?: number;
}

/**
 * An ancient scroll: two lacquered rods with carved end caps, a torn sheet
 * of aged paper between them, and a coil of still-wound paper at the bottom
 * rod. On load the sheet unrolls downward — the bottom rod and coil travel
 * with the revealing edge — then the stat inks in. All motion is CSS
 * (see globals.css, .scroll-v*), so this stays a server component.
 */
export function TrophyCard({
  kind,
  label,
  playerId,
  points,
  pointsLabel,
  subline,
  emptyMessage,
  index = 0,
}: TrophyCardProps) {
  const Icon = ICONS[kind];
  const accent =
    playerId === "adi" ? "var(--color-adi)" : playerId === "ren" ? "var(--color-ren)" : "var(--color-gold)";
  const delay = `${UNROLL_START + index * UNROLL_STAGGER}s`;
  const contentDelay = `${UNROLL_START + index * UNROLL_STAGGER + 0.85}s`;

  return (
    // animation-delay on the wrapper: every animated child inherits it
    <div className="scroll-v" style={{ animationDelay: delay, ["--content-delay" as string]: contentDelay }}>
      <span className="scroll-v__shadow" aria-hidden="true" />

      <div className="scroll-v__sheet">
        <span className="scroll-v__paper" aria-hidden="true" />
        <span className="scroll-v__creases" aria-hidden="true" />
        <span className="scroll-v__curl" aria-hidden="true" />

        {playerId ? (
          <div className="scroll-v__body">
            <div className="flex items-center gap-2 mb-[18px]">
              <Icon className="h-4 w-4" style={{ color: accent }} />
              <p
                className="font-hud text-[13px] font-bold tracking-[0.19em] uppercase whitespace-nowrap"
                style={{ color: accent }}
              >
                {label}
              </p>
            </div>

            <PlayerAvatar playerId={playerId} size={88} watercolor />

            <h3 className="font-display text-[27px] tracking-[0.08em] text-text mt-4 mb-0.5">
              {PLAYERS[playerId].name.toUpperCase()}
            </h3>
            <p className="text-sm italic text-text-faint">{PLAYERS[playerId].characterName}</p>

            <p
              className="text-stat text-[52px] leading-none font-bold mt-[22px]"
              style={{ color: accent, textShadow: "0 1px 0 rgba(255,255,255,0.35)" }}
            >
              {points?.toLocaleString()}
            </p>
            <p className="font-hud text-[13px] font-semibold tracking-[0.2em] uppercase text-text-dim mt-2">
              {pointsLabel}
            </p>

            <p className="mt-auto pt-3.5 w-full border-t border-border/55 text-[13px] text-text-faint">{subline}</p>
          </div>
        ) : (
          <div className="scroll-v__body justify-center">
            <Icon className="h-8 w-8 text-text-faint mb-3" />
            <p className="font-hud text-xs font-bold tracking-[0.25em] text-text-faint uppercase mb-2">{label}</p>
            <p className="text-sm text-text-dim max-w-[220px]">{emptyMessage}</p>
          </div>
        )}
      </div>

      <span className="scroll-v__coil" aria-hidden="true" />

      <div className="scroll-v__rod scroll-v__rod--top" aria-hidden="true">
        <span className="scroll-v__rod-face" />
        <span className="scroll-v__cap scroll-v__cap--left" />
        <span className="scroll-v__cap scroll-v__cap--right" />
      </div>

      <div className="scroll-v__rod scroll-v__rod--bottom" aria-hidden="true">
        <span className="scroll-v__rod-face" />
        <span className="scroll-v__cap scroll-v__cap--left" />
        <span className="scroll-v__cap scroll-v__cap--right" />
      </div>
    </div>
  );
}

export function formatChampionSubline(seasonNumber: number, date: string | null) {
  return `Season ${seasonNumber} completed — ${formatDate(date)}`;
}
