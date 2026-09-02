/**
 * Type surface for the vendored watercolor-reveal.js — kept hand-written
 * and minimal (only what this app calls) rather than generated, since the
 * effect itself is "reuse exactly as-is, don't rewrite" per its own docs.
 */

export interface WatercolorRevealOptions {
  src?: string;
  image?: HTMLImageElement;
  width?: number;
  height?: number;
  seed?: number;
  focal?: [number, number];
  saturation?: number;
  lift?: number;
  posterize?: number;
  inkStrength?: number;
  inkThreshold?: number;
  blotCount?: number;
  spatter?: number;
  spatterLight?: number;
  paper?: string;
  feather?: boolean;
  ink?: [number, number];
  blots?: [number, number];
  blotFade?: number;
  crossOrigin?: string;
  /** Clip every drawn layer to the source image's own alpha channel as
   *  the last step of each frame — for transparent-PNG subjects, so the
   *  paper sheet doesn't extend past the subject's own silhouette. */
  clipToSourceAlpha?: boolean;
}

export interface WatercolorRevealInstance {
  options: Required<WatercolorRevealOptions>;
  draw(canvas: HTMLCanvasElement, p: number): void;
  drawAt(canvas: HTMLCanvasElement, seconds: number, duration: number): void;
}

export interface WatercolorRevealApi {
  create(opts: WatercolorRevealOptions): Promise<WatercolorRevealInstance>;
  DEFAULTS: Required<WatercolorRevealOptions>;
}

declare const WatercolorReveal: WatercolorRevealApi;
export default WatercolorReveal;
