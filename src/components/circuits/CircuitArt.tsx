import type { Circuit } from "@/lib/types";

// Deterministic hash so each circuit gets a stable, distinct-looking gradient.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const NITRO_PALETTE = [
  ["#8a2f1c", "#3d150c"],
  ["#a1701f", "#4d3610"],
  ["#a17a25", "#43350f"],
];
const RETRO_PALETTE = [
  ["#21415f", "#0f202f"],
  ["#4b3f6b", "#211c33"],
  ["#43593a", "#1c2618"],
];

/**
 * Procedurally generated placeholder art for a circuit, used whenever a
 * real image (local file or remote URL) isn't available. Deterministic
 * per circuit so it reads as a distinct "track identity" rather than a
 * generic broken-image box — swap in real photography any time by
 * setting circuit.imageUrl and it takes over automatically (see
 * CircuitImage.tsx).
 */
export function CircuitArt({ circuit, className }: { circuit: Circuit; className?: string }) {
  const palette = circuit.category === "Retro" ? RETRO_PALETTE : NITRO_PALETTE;
  const [c1, c2] = palette[hashString(circuit.id) % palette.length];
  const gradientId = `grad-${circuit.id}`;

  return (
    <svg viewBox="0 0 400 240" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} stopOpacity="0.9" />
          <stop offset="100%" stopColor={c2} stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${gradientId})`} />
      {/* parchment grain lines */}
      <g opacity="0.18" stroke="#ecdfbd" strokeWidth="2">
        <path d="M-20 60 L 180 20" />
        <path d="M-20 110 L 220 60" />
        <path d="M-20 170 L 260 110" />
        <path d="M-20 220 L 200 170" />
      </g>
      {/* winding track loop icon, drawn like an inked map route */}
      <g opacity="0.85" transform="translate(255,90)">
        <path
          d="M0 40 C 0 10, 40 -10, 70 10 C 95 27, 90 55, 65 60 C 45 64, 40 45, 55 40 C 68 36, 75 15, 50 8 C 20 0, -5 20, 5 45 C 15 70, 55 78, 80 55"
          fill="none"
          stroke="#ecdfbd"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>
      <rect width="400" height="240" fill="#1c130a" opacity="0.16" />
    </svg>
  );
}
