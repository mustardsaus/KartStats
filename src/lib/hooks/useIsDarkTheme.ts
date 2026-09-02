"use client";

import { useEffect, useState } from "react";

/**
 * Whether Dark Mode is currently active, read from the `data-theme`
 * attribute ThemeToggle sets on <html> (see ThemeToggle.tsx — theme is a
 * plain DOM attribute + localStorage, no React context). Starts `false` so
 * server and first client render match (no hydration mismatch); flips to
 * the real value within a frame of mount, same pattern ThemeToggle itself
 * uses for its own icon/label.
 */
export function useIsDarkTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute("data-theme") === "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
