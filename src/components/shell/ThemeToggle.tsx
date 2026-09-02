"use client";

import { useEffect, useState } from "react";
import { Moon, ScrollText } from "lucide-react";
import { PopIn } from "@/components/ui/PopIn";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mk-rivalry-theme";

/**
 * Switches between the default "lore" (parchment/watercolor) theme and a
 * Dark Mode that restores the app's earlier dark, modern-ish HUD look —
 * pure CSS variable swap via a `data-theme` attribute on <html>, so every
 * component that already reads theme tokens repaints automatically with
 * no component-level branching. Persisted to localStorage; layout.tsx
 * applies the saved choice via an inline head script before first paint
 * so there's no flash of the wrong theme on reload.
 */
export function ThemeToggle({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDark(document.documentElement.getAttribute("data-theme") === "dark");
      setMounted(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.toggleAttribute("data-theme", next);
    if (next) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "lore");
    } catch {
      // ignore storage errors
    }
  };

  // Avoid rendering theme-dependent icon/label before mount reads the
  // real attribute — a static "lore" guess keeps server and first client
  // render identical (no hydration mismatch), and it's fine visually since
  // this swaps to the correct state within a frame or two either way.
  const isDark = mounted && dark;

  if (variant === "mobile") {
    return (
      <button
        onClick={toggle}
        className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-paper-dim hover:bg-paper/10 hover:text-paper transition-colors w-full"
      >
        <PopIn key={String(isDark)}>{isDark ? <ScrollText className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</PopIn>
        {isDark ? "Switch to Scroll Theme" : "Switch to Dark Mode"}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to Scroll theme" : "Switch to Dark Mode"}
      title={isDark ? "Switch to Scroll theme" : "Switch to Dark Mode"}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md text-paper-dim hover:bg-paper/10 hover:text-paper transition-colors"
      )}
    >
      <PopIn key={String(isDark)}>
        {isDark ? <ScrollText className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </PopIn>
    </button>
  );
}
