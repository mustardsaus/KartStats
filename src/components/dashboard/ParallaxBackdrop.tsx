"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { WatercolorImage } from "@/components/media/WatercolorImage";
import { useIsDarkTheme } from "@/lib/hooks/useIsDarkTheme";

/**
 * Dashboard hero backdrop: the photo paints itself on live via the canvas
 * watercolor effect (see WatercolorImage) at 60% opacity — present enough
 * to read as an illustration, still calm enough that the headline stays
 * legible on top. The scrim fades to page colour rather than to void.
 * Parallax is stronger (0.4 of scroll) so the paper foreground reads as a
 * separate plane from the wall behind it.
 *
 * Sized with inset-0 rather than a fixed viewport height — the parent
 * (the hero-through-trophy-scrolls wrapper in page.tsx) is a plain
 * relatively-positioned block whose height is just its content's height,
 * so inset-0 makes the backdrop track that exactly and stop right where
 * the scrolls end, instead of over- or under-shooting a hardcoded vh.
 */
export function ParallaxBackdrop() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 700], [0, 280]);
  const ref = useRef<HTMLDivElement>(null);
  const isDark = useIsDarkTheme();

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 right-1/2 -mx-[50vw] w-screen inset-y-0 -z-10 overflow-hidden"
    >
      <motion.div style={{ y }} className="absolute inset-x-0 -top-20 -bottom-20">
        <WatercolorImage
          src="/dashboard-bg.jpg"
          alt=""
          className="h-full w-full opacity-60 animate-slow-drift"
          focal={[0.62, 0.6]}
          durationMs={4200}
          raw={isDark}
          eager
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-b from-bg/45 via-bg/62 to-bg" />
      <div className="absolute inset-0 opacity-45 bg-gradient-to-r from-bg via-transparent to-bg" />
    </div>
  );
}
