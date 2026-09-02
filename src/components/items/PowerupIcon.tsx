import type { ItemId } from "@/lib/types";

/**
 * Original, hand-drawn icons for the 19 Mario Kart Wii items — simple
 * filled silhouettes, not reproductions of the game's actual sprites
 * (copyright). Family shapes (mushroom, shell, banana...) stay
 * consistent across variants; a "triple" item gets a small ×3 badge
 * rather than tripling the geometry, and golden/mega/red/blue variants
 * get one small accent mark — reads clearly at the small size these show
 * up at in a grid of buttons, which fully-detailed variants wouldn't.
 * All shapes use currentColor, so they pick up whatever text color the
 * caller sets, same convention as the lucide icons used elsewhere.
 */
export function PowerupIcon({ itemId, className }: { itemId: ItemId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {renderIcon(itemId)}
    </svg>
  );
}

function TripleBadge() {
  return (
    <g>
      <circle cx="19" cy="19" r="4.5" fill="currentColor" />
      <text x="19" y="21.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--color-bg, #1c130a)">
        3
      </text>
    </g>
  );
}

function Sparkle({ x, y, r = 2.2 }: { x: number; y: number; r?: number }) {
  return (
    <path
      d={`M${x} ${y - r} L${x + r * 0.35} ${y - r * 0.35} L${x + r} ${y} L${x + r * 0.35} ${y + r * 0.35} L${x} ${y + r} L${x - r * 0.35} ${y + r * 0.35} L${x - r} ${y} L${x - r * 0.35} ${y - r * 0.35} Z`}
      fill="currentColor"
    />
  );
}

function Mushroom({ bold = false }: { bold?: boolean }) {
  const capR = bold ? 9.5 : 8.5;
  return (
    <g>
      <path d={`M${12 - capR} 12 Q${12 - capR} 3.5 12 3.5 Q${12 + capR} 3.5 ${12 + capR} 12 Z`} fill="currentColor" />
      <rect x="8.5" y="12" width="7" height="8" rx="2.5" fill="currentColor" opacity="0.55" />
      <circle cx="9.5" cy="8.5" r="1.3" fill="var(--color-bg, #1c130a)" opacity="0.5" />
      <circle cx="14.5" cy="7.2" r="1" fill="var(--color-bg, #1c130a)" opacity="0.5" />
    </g>
  );
}

function Shell({ spiky = false, homing = false }: { spiky?: boolean; homing?: boolean }) {
  return (
    <g>
      <path d="M4 14 Q4 5 12 5 Q20 5 20 14 Z" fill="currentColor" />
      <rect x="3" y="14" width="18" height="4.5" rx="2.25" fill="currentColor" opacity="0.6" />
      {spiky && (
        <g fill="currentColor">
          <path d="M6 8 L4.5 5.5 L7.2 6.8 Z" />
          <path d="M12 4.5 L11 1.8 L13.4 3.3 Z" />
          <path d="M18 8 L19.5 5.5 L16.8 6.8 Z" />
        </g>
      )}
      {homing && <path d="M9 9 L12 6.2 L15 9" stroke="var(--color-bg, #1c130a)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.55" />}
    </g>
  );
}

function Banana() {
  return (
    <path
      d="M6 18.5 C4.5 15 5.5 9 10 5.5 C11 4.7 12.3 4.3 13 5 C13.7 5.7 13.2 6.8 12.3 7.5 C9 10 8 14.5 9.2 17.5 C9.6 18.6 8.8 19.3 7.8 19.1 C7.1 19 6.4 18.9 6 18.5 Z"
      fill="currentColor"
    />
  );
}

function renderIcon(itemId: ItemId) {
  switch (itemId) {
    case "mushroom":
      return <Mushroom />;
    case "triple-mushrooms":
      return (
        <>
          <Mushroom />
          <TripleBadge />
        </>
      );
    case "golden-mushroom":
      return (
        <>
          <Mushroom />
          <Sparkle x={18} y={5} r={2.4} />
        </>
      );
    case "mega-mushroom":
      return (
        <>
          <Mushroom bold />
          <path
            d="M1.5 12 L4.5 12 M2.5 9 L5 10.8 M2.5 15 L5 13.2 M22.5 12 L19.5 12 M21.5 9 L19 10.8 M21.5 15 L19 13.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      );
    case "green-shell":
      return <Shell />;
    case "triple-green-shells":
      return (
        <>
          <Shell />
          <TripleBadge />
        </>
      );
    case "red-shell":
      return <Shell homing />;
    case "triple-red-shells":
      return (
        <>
          <Shell homing />
          <TripleBadge />
        </>
      );
    case "blue-shell":
      return (
        <g>
          <Shell spiky />
          <path d="M3 12 Q0.5 10.5 1.5 8 Q3.5 9.5 4.5 12 Z" fill="currentColor" opacity="0.75" />
          <path d="M21 12 Q23.5 10.5 22.5 8 Q20.5 9.5 19.5 12 Z" fill="currentColor" opacity="0.75" />
        </g>
      );
    case "banana":
      return <Banana />;
    case "triple-bananas":
      return (
        <>
          <Banana />
          <TripleBadge />
        </>
      );
    case "bob-omb":
      return (
        <g>
          <path d="M12 8.5 Q10.5 6.5 11.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <circle cx="12" cy="4" r="1.4" fill="currentColor" />
          <circle cx="12" cy="14" r="8" fill="currentColor" />
          <circle cx="9.5" cy="11.5" r="1.6" fill="var(--color-bg, #1c130a)" opacity="0.55" />
        </g>
      );
    case "fake-item-box":
      return (
        <g>
          <rect x="4" y="4" width="16" height="16" rx="3" transform="rotate(45 12 12)" fill="currentColor" opacity="0.85" />
          <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-bg, #1c130a)">
            ?
          </text>
          <path d="M4 16 L9 11" stroke="var(--color-bg, #1c130a)" strokeWidth="1" opacity="0.6" />
        </g>
      );
    case "bullet-bill":
      return (
        <g>
          <path d="M4 9 L14 9 Q20 9 20 13.5 Q20 18 14 18 L4 18 Z" fill="currentColor" />
          <circle cx="7.5" cy="12.2" r="1" fill="var(--color-bg, #1c130a)" opacity="0.6" />
          <circle cx="7.5" cy="15.2" r="1" fill="var(--color-bg, #1c130a)" opacity="0.6" />
          <path d="M2 12 L4.5 13.5 L2 15 Z" fill="currentColor" opacity="0.6" />
        </g>
      );
    case "star":
      return (
        <path
          d="M12 2.5 L14.7 9.2 L21.8 9.6 L16.2 14 L18.2 21 L12 16.9 L5.8 21 L7.8 14 L2.2 9.6 L9.3 9.2 Z"
          fill="currentColor"
        />
      );
    case "blooper":
      return (
        <g>
          <path d="M6 6 Q6 2.5 12 2.5 Q18 2.5 18 6 Q18 11 12 11 Q6 11 6 6 Z" fill="currentColor" />
          <circle cx="9.5" cy="6.2" r="1.5" fill="var(--color-bg, #1c130a)" opacity="0.6" />
          <circle cx="14.5" cy="6.2" r="1.5" fill="var(--color-bg, #1c130a)" opacity="0.6" />
          <path
            d="M7 11 Q7 15 5.5 18.5 M10 11 Q10.5 16 9 21 M14 11 Q13.5 16 15 21 M17 11 Q17 15 18.5 18.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case "pow-block":
      return (
        <g>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="currentColor" />
          <path
            d="M12 1 L12 4 M23 12 L20 12 M12 23 L12 20 M1 12 L4 12 M20 4 L17.8 6.2 M20 20 L17.8 17.8 M4 20 L6.2 17.8 M4 4 L6.2 6.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.7"
          />
          <text x="12" y="16" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--color-bg, #1c130a)">
            POW
          </text>
        </g>
      );
    case "thunder-cloud":
      return (
        <g>
          <path
            d="M6.5 13 A4 4 0 0 1 7 5.2 A5 5 0 0 1 16.8 4.5 A4.2 4.2 0 0 1 17 13 Z"
            fill="currentColor"
          />
          <path d="M11 14 L8.5 19 L11 19 L9.5 23 L15 17 L12 17 L14 14 Z" fill="currentColor" />
        </g>
      );
    case "lightning":
      return <path d="M13.5 1.5 L5 13.5 L11 13.5 L9.5 22.5 L19.5 9.5 L13 9.5 Z" fill="currentColor" />;
    default:
      return null;
  }
}
