"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * A small, quiet entrance for the dashboard — content fades and lifts in
 * once on load, staggered a beat apart. No loops, no bounce, nothing that
 * keeps moving after it lands. Respects prefers-reduced-motion via
 * Framer Motion's built-in support.
 */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } },
};

export function RevealGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div initial="hidden" animate="show" variants={container} className={className}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
