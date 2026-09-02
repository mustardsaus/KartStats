"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { PLAYERS } from "@/lib/data/points-mapping";
import type { PlayerId } from "@/lib/types";
import { Trophy } from "lucide-react";

export function SeasonCompletionScreen({
  seasonNumber,
  winner,
  adiPoints,
  renPoints,
}: {
  seasonNumber: number;
  winner: PlayerId | "tie";
  adiPoints: number;
  renPoints: number;
}) {
  const margin = Math.abs(adiPoints - renPoints);
  const accent = winner === "adi" ? "var(--color-adi)" : winner === "ren" ? "var(--color-ren)" : "var(--color-gold)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/95 backdrop-blur-sm p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
        className="relative w-full max-w-lg rounded-2xl border speed-lines p-8 sm:p-10 text-center my-8"
        style={{ borderColor: `${accent}55`, background: `linear-gradient(160deg, ${accent}18, var(--color-surface) 60%)`, boxShadow: `0 0 80px -10px ${accent}55` }}
      >
        <motion.div
          animate={{ rotate: [0, -8, 8, -8, 0] }}
          transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.5 }}
          className="inline-flex mb-4"
        >
          <Trophy className="h-14 w-14" style={{ color: accent }} />
        </motion.div>

        <p className="font-hud text-xs font-bold tracking-[0.3em] text-text-faint uppercase mb-1">
          Season {seasonNumber} Complete
        </p>

        {winner !== "tie" ? (
          <>
            <PlayerAvatar playerId={winner as PlayerId} size={90} className="mx-auto my-4" />
            <h2 className="font-display text-3xl sm:text-4xl tracking-wide mb-1" style={{ color: accent }}>
              {PLAYERS[winner as PlayerId].name.toUpperCase()} WINS THE SEASON
            </h2>
          </>
        ) : (
          <h2 className="font-display text-3xl sm:text-4xl tracking-wide mb-1 text-gold">SEASON TIED</h2>
        )}

        <div className="text-stat text-4xl sm:text-6xl font-bold my-5 flex items-center justify-center gap-3">
          <span className={winner === "adi" ? "text-adi" : "text-text"}>{adiPoints}</span>
          <span className="text-text-faint text-2xl">—</span>
          <span className={winner === "ren" ? "text-ren" : "text-text"}>{renPoints}</span>
        </div>

        {winner !== "tie" && (
          <p className="text-text-dim text-sm mb-8">
            {PLAYERS[winner as PlayerId].name} wins by <span className="text-text font-semibold">{margin}</span> points
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="rounded-xl border border-border-strong bg-surface-raised px-5 py-3 font-hud text-sm font-bold tracking-wide text-text hover:bg-surface transition-colors"
          >
            Return to Dashboard
          </Link>
          <Link
            href={`/season-rewind/${seasonNumber}`}
            className="rounded-xl border border-border-strong bg-surface-raised px-5 py-3 font-hud text-sm font-bold tracking-wide text-text hover:bg-surface transition-colors"
          >
            Review Season
          </Link>
          <Link
            href="/war-mode"
            className="rounded-xl bg-danger px-5 py-3 font-hud text-sm font-bold tracking-wide text-bg hover:brightness-110 transition-all"
          >
            Play Again
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
