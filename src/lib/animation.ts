import { animate, stagger } from "animejs";

/**
 * House animation presets (anime.js) for Battle Mode's small, frequent
 * interactions — screen entrances, tap feedback, count pop-ins. Kept as
 * tiny wrapper functions so the duration/easing choices live in one place
 * rather than being re-typed at every call site. All of these are
 * *imperative* (call them from a ref in an effect or an event handler) —
 * anime.js isn't a declarative component library like the framer-motion
 * usage elsewhere (LiveLeaderboard's score bump, pre-existing), so there's
 * no exit-animation choreography here: content that unmounts just
 * disappears, and whatever mounts next slides/pops in immediately. That
 * trade-off is deliberate — the goal here is snappier taps, not a longer
 * pipeline of animation-then-DOM-change.
 */

/** A screen sliding in from the side (track picker <-> cockpit, cockpit
 *  main <-> position entry). `fromX` is which side it enters from —
 *  negative for "from the left" (going back), positive for "from the
 *  right" (going deeper). */
export function slideIn(el: Element | null, fromX: number) {
  if (!el) return;
  animate(el, {
    translateX: [fromX, 0],
    opacity: [0, 1],
    duration: 320,
    ease: "outQuad",
  });
}

/** A value popping into place — count badges, the locked position
 *  checkmark. Re-run this (e.g. in a useEffect keyed on the value) every
 *  time the value changes for a repeatable "bump". */
export function popIn(el: Element | null) {
  if (!el) return;
  animate(el, {
    scale: [0.5, 1],
    opacity: [0, 1],
    duration: 320,
    ease: "outBack",
  });
}

/** A quick press-down-and-back pulse for a tapped button, triggered from
 *  the click handler itself rather than a CSS :active state, so it plays
 *  in full even on a fast tap-and-release. */
export function tapPulse(el: Element | null) {
  if (!el) return;
  animate(el, {
    scale: [1, 0.92, 1],
    duration: 260,
    ease: "outQuad",
  });
}

/** A list of items (cards, table rows, search results) popping/sliding in
 *  together with a small per-item delay, instead of just appearing —
 *  covers the "a whole list has zero entrance animation" gap. Pass the
 *  CONTAINER (not the items) — this queries `itemSelector` within it, so
 *  it can be called from one ref regardless of how many items there are
 *  or how often the list re-filters. Safe to call on an empty container. */
export function staggerIn(container: Element | null, itemSelector = "[data-stagger-item]") {
  if (!container) return;
  const items = container.querySelectorAll(itemSelector);
  if (!items.length) return;
  animate(items, {
    translateY: [14, 0],
    opacity: [0, 1],
    duration: 360,
    delay: stagger(28, { start: 40 }),
    ease: "outQuad",
  });
}

/** Ticks a number element's text content from its current displayed value
 *  up/down to `to`, instead of snapping straight to the new value — for a
 *  live score or stat that changes while it's on screen. `from` should be
 *  the value that was just showing (the caller tracks this, e.g. via a
 *  ref), not re-read from the DOM. No-ops (just sets the text) when the
 *  values already match, when reduced motion is requested, or when the
 *  element isn't mounted yet. */
export function countUp(el: Element | null, from: number, to: number, duration = 500) {
  if (!el) return;
  if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = String(to);
    return;
  }
  const counter = { value: from };
  animate(counter, {
    value: to,
    duration,
    ease: "outQuad",
    onUpdate: () => {
      el.textContent = String(Math.round(counter.value));
    },
  });
}
