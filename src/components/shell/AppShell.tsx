"use client";

import { useEffect, useState } from "react";
import { StoryIntro } from "@/components/loading/StoryIntro";
import { ScrollFilters } from "@/components/dashboard/ScrollFilters";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  // The real page (nav + content) always renders — server-rendered HTML is
  // never empty, which matters for crawlers, no-JS clients, and anything
  // that fetches the page without executing JavaScript. The intro is a
  // purely client-side overlay on top of it, skipped entirely once it's
  // already played this session.
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = Boolean(sessionStorage.getItem("mk-rivalry-loaded"));
    } catch {
      // ignore storage errors, default to showing the intro
    }
    if (!alreadySeen) {
      const id = requestAnimationFrame(() => setShowIntro(true));
      return () => cancelAnimationFrame(id);
    }
  }, []);

  const handleDone = () => {
    setShowIntro(false);
    try {
      sessionStorage.setItem("mk-rivalry-loaded", "1");
    } catch {
      // ignore
    }
  };

  return (
    <>
      <ScrollFilters />
      {showIntro && <StoryIntro onDone={handleDone} />}
      <div className="flex min-h-dvh flex-col">
        <TopNav />
        <main className="flex-1">{children}</main>
      </div>
    </>
  );
}
