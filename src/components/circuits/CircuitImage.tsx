"use client";

import { useState } from "react";
import type { Circuit } from "@/lib/types";
import { CircuitArt } from "./CircuitArt";
import { WatercolorImage } from "@/components/media/WatercolorImage";
import { useIsDarkTheme } from "@/lib/hooks/useIsDarkTheme";
import { cn } from "@/lib/utils";

const PLACEHOLDER_MARKERS = ["/circuits/placeholder", ""];

/**
 * Renders a circuit's real image when one is configured and loads
 * successfully; falls back to generated placeholder art otherwise. This
 * is the flexible "local image / remote URL / placeholder" system from
 * the spec — drop a real file at the circuit's imageUrl path (or point it
 * at a remote URL) and it's picked up automatically, no code changes.
 *
 * `workingLongEdge` is forwarded to WatercolorImage's internal working
 * resolution (see there — the effect allocates several full working-size
 * canvases per instance, on top of the visible DPR-scaled one). It
 * defaults to WatercolorImage's own 1400px default, sized for a large
 * hero image (the circuit detail page banner, War Mode's full-bleed
 * backdrop). Callers rendering this at thumbnail size — the circuit grid,
 * players page's track cards — MUST pass a much smaller value: at 1400px
 * a screen with many cards in view (e.g. the /circuits grid, ~32 cards)
 * was allocating ~30 full 1400px-working canvases at once, which is fine
 * on desktop but has been reported to crash the tab on mobile Safari
 * (limited per-tab memory) — the tab errors out and reloading it
 * immediately re-triggers the same crash, reading as a repeating error.
 */
export function CircuitImage({
  circuit,
  className,
  workingLongEdge,
  instant,
}: {
  circuit: Circuit;
  className?: string;
  workingLongEdge?: number;
  /**
   * Skip the multi-second animated watercolor reveal and draw straight to
   * the finished frame. Pass this wherever the image is swapped
   * repeatedly during time-sensitive, active use rather than browsed at a
   * relaxed pace — War Mode's live per-race backdrop, above all, where
   * every one of a season's 32 track changes was otherwise paying the
   * reveal's few seconds of continuous canvas redraw for no benefit
   * (nobody's pausing to watch a wash bloom in mid-race). Leave unset
   * everywhere else — the circuits gallery, players page, season pages —
   * so the reveal still plays where it's actually a nice touch.
   */
  instant?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const isDark = useIsDarkTheme();
  const hasRealImage = circuit.imageUrl && !PLACEHOLDER_MARKERS.includes(circuit.imageUrl);

  if (!hasRealImage || errored) {
    return <CircuitArt circuit={circuit} className={cn("h-full w-full", className)} />;
  }

  return (
    <WatercolorImage
      src={circuit.imageUrl}
      alt={circuit.name}
      className={className}
      raw={isDark}
      durationMs={2600}
      workingLongEdge={workingLongEdge}
      instant={instant}
      onError={() => setErrored(true)}
    />
  );
}
