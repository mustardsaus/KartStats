/**
 * SVG filter primitives used by the scroll cards and the watercolor hero.
 * Render ONCE per page (it is inert, zero-size markup) — the CSS in
 * globals.css references these by id.
 */
export function ScrollFilters() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      {/* roughs up glyph edges so text reads as pigment sunk into paper */}
      <filter id="wetpaper" x="-15%" y="-30%" width="130%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.014 0.038" numOctaves={3} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      {/* gentler version for body copy and small caps */}
      <filter id="wetpaper-soft" x="-15%" y="-40%" width="130%" height="180%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves={2} seed={19} result="n2" />
        <feDisplacementMap in="SourceGraphic" in2="n2" scale={2.5} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      {/* tears the left/right edges of each paper sheet */}
      <filter id="tornedge" x="-8%" y="-6%" width="116%" height="112%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.09" numOctaves={5} seed={12} result="tn" />
        <feDisplacementMap in="SourceGraphic" in2="tn" scale={13} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      {/* wide, ragged bleed for soft colour-bloom halos — a much bigger
          displacement than wetpaper, safe here because it only ever sits
          behind a blurred glow blob, never a face or a glyph */}
      <filter id="inkbloom" x="-70%" y="-70%" width="240%" height="240%">
        <feTurbulence type="fractalNoise" baseFrequency="0.014 0.026" numOctaves={3} seed={31} result="ib" />
        <feDisplacementMap in="SourceGraphic" in2="ib" scale={46} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
