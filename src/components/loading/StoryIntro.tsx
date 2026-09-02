"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PLAYERS } from "@/lib/data/points-mapping";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";

// How long the whole overlay takes to dissolve into the dashboard
// underneath once "Proceed" is clicked.
const EXIT_MS = 900;

// The staggered fade/rise-in for the heading, the two portraits, and the
// button — each element starts a beat after the last, in this order.
const STAGGER_MS = 160;
const ENTER_MS = 700;

/**
 * The session's one-time intro: a basic splash screen. "RIVALRY ARCHIVE"
 * fades in, both racers' portraits appear together beneath it, and a
 * "Proceed" button dismisses the overlay into the dashboard underneath
 * (already server-rendered — this is a pure client overlay). No timed
 * sequence to sit through: everything is visible within a second or two of
 * mount, and the viewer moves on whenever they're ready.
 */
export function StoryIntro({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const [exiting, setExiting] = useState(false);

  const handleProceed = () => setExiting(true);

  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(onDone, reduceMotion ? 150 : EXIT_MS);
    return () => clearTimeout(t);
  }, [exiting, onDone, reduceMotion]);

  const rise = (index: number) =>
    reduceMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: ENTER_MS / 1000, delay: (index * STAGGER_MS) / 1000, ease: "easeOut" as const },
        };

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-bg"
      animate={exiting ? { opacity: 0 } : { opacity: 1 }}
      transition={{ duration: (reduceMotion ? 150 : EXIT_MS) / 1000 }}
      style={{ pointerEvents: exiting ? "none" : "auto" }}
    >
      <IntroBackdrop />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-8 sm:gap-10 px-6 text-center">
        <motion.div {...rise(0)} className="flex flex-col items-center">
          <h1 className="font-display font-bold text-4xl sm:text-6xl md:text-7xl tracking-wide text-text">
            RIVALRY ARCHIVE
          </h1>
          <p className="mt-3 font-hud text-sm sm:text-base tracking-[0.35em] uppercase text-text-dim">
            Adi vs Ren
          </p>
        </motion.div>

        <motion.div {...rise(1)} className="flex items-center gap-8 sm:gap-14">
          <RacerBadge playerId="adi" accent="var(--color-adi)" />
          <RacerBadge playerId="ren" accent="var(--color-ren)" />
        </motion.div>

        <motion.button
          {...rise(2)}
          type="button"
          onClick={handleProceed}
          className="mt-2 rounded-full border border-gold/60 px-9 py-3 font-hud text-sm tracking-[0.32em] uppercase text-gold transition-colors hover:border-gold hover:bg-gold/10"
        >
          Proceed
        </motion.button>
      </div>
    </motion.div>
  );
}

function RacerBadge({ playerId, accent }: { playerId: "adi" | "ren"; accent: string }) {
  const player = PLAYERS[playerId];
  return (
    <div className="flex flex-col items-center">
      <span
        className="block"
        style={{ filter: `drop-shadow(0 0 18px color-mix(in srgb, ${accent} 35%, transparent))` }}
      >
        <PlayerAvatar playerId={playerId} size={96} />
      </span>
      <p className="mt-3 font-display text-lg sm:text-xl tracking-wide" style={{ color: accent }}>
        {player.name.toUpperCase()}
      </p>
    </div>
  );
}

function IntroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 20% 20%, rgba(138,47,28,0.14), transparent 60%), radial-gradient(ellipse 70% 55% at 82% 78%, rgba(33,65,95,0.14), transparent 60%), radial-gradient(ellipse 90% 70% at 50% 50%, rgba(161,122,37,0.08), transparent 65%)",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-3 checker-strip" />
      <div className="absolute bottom-0 left-0 right-0 h-3 checker-strip" />
      <style>{`
        .checker-strip {
          background-image: repeating-linear-gradient(90deg, var(--color-border) 0 14px, var(--color-void) 14px 28px);
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
