"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { WatercolorRevealOptions } from "@/lib/vendor/watercolor-reveal";

// House defaults: a pure wash (no ink linework) at a modest saturation
// boost — see the effect's own README for what each knob does. Callers
// can still override either via `options`.
const DEFAULT_EFFECT_OPTIONS: Partial<WatercolorRevealOptions> = {
  inkStrength: 0,
  saturation: 1.25,
};

/**
 * Renders a photo as a watercolor painting that paints itself on, using the
 * vendored watercolor-reveal.js effect (organic wash blots blooming
 * outward from a focal point, over generated paper texture) — reused
 * exactly as shipped, per its own docs. This REPLACES the earlier
 * two-step approach (an offline PIL pre-bake + a CSS mask-grow reveal on
 * top of it): the stylization and the reveal are now the same live canvas
 * animation, painted straight from the source photo, no separate baked
 * asset needed.
 *
 * The unpainted paper the effect draws under/around the image (visible
 * while it's still filling in, and at the feathered edges once done)
 * defaults to the page's own `--color-bg`, not the effect's built-in
 * off-white, so it reads as part of the page rather than a mismatched
 * white box — see the `--color-bg` read below and the matching patch in
 * the vendored file's `buildFrame()`, which otherwise hardcodes that
 * edge-feather colour regardless of the `paper` option.
 *
 * The effect's own internal working resolution (`o.width`/`o.height`) is
 * matched to the SOURCE image's natural aspect ratio so it isn't stretched
 * — the canvas element's actual backing-store size can differ (used here
 * for a sharper DPR-aware buffer) and is cropped to the container via
 * `object-cover`, the same way the plain <img> this replaces behaved.
 *
 * Lazy by default (an IntersectionObserver defers `create()` — the
 * per-image one-time cost the library's own docs quote at ~200ms — until
 * the element is actually about to scroll into view), and collapses to a
 * single instantly-drawn final frame under reduced motion or whenever the
 * caller marks it `instant`. `raw` skips the effect entirely — Dark Mode's
 * "no watercolour at all" call — and renders the plain photo instead, with
 * a light clarity boost since a crisp, high-contrast photo is the whole
 * point there.
 */
export function WatercolorImage({
  src,
  alt,
  className,
  focal = [0.5, 0.5],
  durationMs = 3200,
  workingLongEdge = 1400,
  eager = false,
  instant = false,
  raw = false,
  maxProgress = 1,
  objectPosition = "center",
  options,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  focal?: [number, number];
  durationMs?: number;
  /** Longest edge, in px, of the effect's internal working resolution. */
  workingLongEdge?: number;
  /** Skip the lazy IntersectionObserver gate and start immediately. */
  eager?: boolean;
  /** Draw straight to the finished frame, no animated reveal. */
  instant?: boolean;
  /** Skip the effect entirely — plain photo, lightly enhanced, no canvas. */
  raw?: boolean;
  /**
   * Cap the animated progress below 1 — e.g. 0.15 stays inside the ink
   * contour window (ink defaults to [0.05, 0.45]) and short of where wash
   * blots start (blots defaults to [0.2, 0.92]), so with `options.inkStrength`
   * turned up this reads as a sketch that stops at the linework, never
   * getting far enough to paint. 1 (the default) plays the whole effect.
   */
  maxProgress?: number;
  objectPosition?: string;
  options?: Partial<WatercolorRevealOptions>;
  onError?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Compared against `src` below rather than reset with a separate
  // setState call on src change — deriving "ready" this way means it
  // naturally goes false again the instant src changes, no extra effect
  // needed just to flip it back off.
  const [readyForSrc, setReadyForSrc] = useState<string | null>(null);
  const ready = readyForSrc === src;

  useEffect(() => {
    if (raw) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let cancelled = false;
    let raf = 0;
    let started = false;

    const run = async () => {
      if (started) return;
      started = true;

      const img = new Image();
      const loaded = await new Promise<HTMLImageElement | null>((resolve) => {
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
      if (cancelled) return;
      if (!loaded) {
        setReadyForSrc(src); // stop shimmering — the caller's onError fallback takes over
        onError?.();
        return;
      }

      const aspect = loaded.naturalWidth / loaded.naturalHeight || 1;
      const workW = aspect >= 1 ? workingLongEdge : Math.round(workingLongEdge * aspect);
      const workH = aspect >= 1 ? Math.round(workingLongEdge / aspect) : workingLongEdge;

      const pageBg = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim() || undefined;

      const { default: WatercolorReveal } = await import("@/lib/vendor/watercolor-reveal");
      if (cancelled) return;
      const fx = await WatercolorReveal.create({
        image: loaded,
        width: workW,
        height: workH,
        focal,
        paper: pageBg,
        ...DEFAULT_EFFECT_OPTIONS,
        ...options,
      });
      if (cancelled || !canvasRef.current) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasRef.current.width = Math.round(workW * dpr);
      canvasRef.current.height = Math.round(workH * dpr);

      // The canvas is about to start painting (its own blank-paper first
      // frame, then the bloom-in) — that's the cue to fade the skeleton
      // out, not waiting for the multi-second reveal to finish.
      setReadyForSrc(src);

      const reduceMotion =
        instant || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduceMotion) {
        fx.draw(canvasRef.current, maxProgress);
        return;
      }

      const start = performance.now();
      const tick = (t: number) => {
        if (cancelled || !canvasRef.current) return;
        const p = Math.min(maxProgress, (t - start) / durationMs);
        fx.draw(canvasRef.current, p);
        if (p < maxProgress) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    if (eager) {
      run();
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(container);
    return () => {
      cancelled = true;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, raw]);

  if (raw) {
    return (
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        <div className={cn("skeleton-shimmer absolute inset-0 transition-opacity duration-300", ready ? "opacity-0" : "opacity-100")} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          style={{ objectPosition, filter: "contrast(1.08) saturate(1.18) brightness(1.01)" }}
          loading={eager ? "eager" : "lazy"}
          onLoad={() => setReadyForSrc(src)}
          onError={() => {
            setReadyForSrc(src);
            onError?.();
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative h-full w-full overflow-hidden", className)}>
      <div className={cn("skeleton-shimmer absolute inset-0 transition-opacity duration-300", ready ? "opacity-0" : "opacity-100")} />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        className="block h-full w-full"
        style={{ objectFit: "cover", objectPosition }}
      />
    </div>
  );
}
