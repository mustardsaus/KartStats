"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { staggerIn } from "@/lib/animation";

/**
 * Wraps a list/grid of items so they pop+slide in together with a small
 * per-item stagger on mount, instead of just appearing — cards, table
 * rows, search results. Mark each direct child that should animate with
 * `data-stagger-item`; this only queries within itself, so it's safe to
 * nest (e.g. a table row containing its own unrelated markup).
 *
 * `as` picks the wrapper element — a table's rows need a real `<tbody>`,
 * not a `<div>`, to stay valid HTML, so this takes a small fixed set of
 * tags rather than being fully generic.
 */
export function StaggerIn({
  as = "div",
  className,
  itemSelector,
  children,
}: {
  as?: "div" | "tbody" | "ul";
  className?: string;
  itemSelector?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    staggerIn(ref.current, itemSelector);
  }, [itemSelector]);

  if (as === "tbody") {
    return (
      <tbody ref={ref as React.Ref<HTMLTableSectionElement>} className={className}>
        {children}
      </tbody>
    );
  }
  if (as === "ul") {
    return (
      <ul ref={ref as React.Ref<HTMLUListElement>} className={className}>
        {children}
      </ul>
    );
  }
  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={className}>
      {children}
    </div>
  );
}
