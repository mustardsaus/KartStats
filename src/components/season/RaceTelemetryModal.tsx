"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import type { RaceItemEvent, RacePositionSample, RaceSpeedSample } from "@/lib/types";
import { getRaceTelemetryDetailAction } from "@/app/war-mode/immersive-actions";
import { RacePositionGraph } from "@/components/warmode/immersive/RacePositionGraph";
import { RaceSpeedGraph } from "@/components/warmode/immersive/RaceSpeedGraph";
import { RaceItemFeed } from "@/components/warmode/immersive/RaceItemFeed";

/**
 * Season Rewind's "View Graph" affordance for a single already-finalized
 * race — reuses the exact same permanent telemetry rows and the exact
 * same RacePositionGraph/RaceItemFeed components the live dashboard's
 * RaceResultPanel uses, just fetched on demand instead of mid-season.
 * Only ever opened by RaceTable for a race gated on having lap-time data,
 * so an empty result here means the fetch came back empty, not that the
 * race was never Immersive.
 */
export function RaceTelemetryModal({
  raceId,
  raceLabel,
  onClose,
}: {
  raceId: string;
  raceLabel: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<{ positionSamples: RacePositionSample[]; itemEvents: RaceItemEvent[]; speedSamples: RaceSpeedSample[] } | null>(null);

  // No reset-on-change effect needed here -- the parent mounts this with
  // key={raceId} (see RaceTable), the same convention RaceResultPanel uses.
  useEffect(() => {
    let cancelled = false;
    getRaceTelemetryDetailAction(raceId).then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl border border-border-strong bg-surface p-6 sm:p-7 my-8"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-text-faint hover:text-text transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-4">{raceLabel}</p>

        {detail ? (
          <div className="space-y-5">
            <RacePositionGraph samples={detail.positionSamples} />
            <RaceSpeedGraph samples={detail.speedSamples} />
            <RaceItemFeed events={detail.itemEvents} />
          </div>
        ) : (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-text-faint animate-spin" />
          </div>
        )}
      </motion.div>
    </div>
  );
}
