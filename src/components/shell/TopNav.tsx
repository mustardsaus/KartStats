"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scroll, Menu, X, LineChart, MapPinned, Users, History, Swords, UploadCloud, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const ANALYZE_LINKS = [
  { href: "/trendline", label: "Trendline", icon: LineChart },
  { href: "/circuits", label: "Circuit Stats", icon: MapPinned },
  { href: "/players", label: "Player Stats", icon: Users },
];

const HISTORY_LINKS = [
  { href: "/season-rewind", label: "Season Rewind", icon: History },
  { href: "/tomfoolery-tales", label: "Tomfoolery Tales", icon: PartyPopper },
  { href: "/import", label: "Import Data", icon: UploadCloud },
];

export function TopNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const isWarMode = pathname.startsWith("/war-mode");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-void/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Scroll className="h-6 w-6 text-nav-accent" strokeWidth={2} />
          <span className="font-display text-sm sm:text-lg font-bold tracking-wide text-paper whitespace-nowrap">
            RACING ARCHIVES<span className="text-adi-glow">.</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          <NavGroup label="Analyze" links={ANALYZE_LINKS} active={ANALYZE_LINKS.some((l) => isActive(l.href))} />
          <NavGroup label="History" links={HISTORY_LINKS} active={HISTORY_LINKS.some((l) => isActive(l.href))} />
          <Link
            href="/war-mode"
            className={cn(
              "ml-2 flex items-center gap-1.5 rounded-md px-3 py-2 font-hud text-sm font-semibold tracking-wide transition-colors",
              isWarMode
                ? "bg-danger text-bg"
                : "bg-danger/15 text-danger hover:bg-danger/25"
            )}
          >
            <Swords className="h-4 w-4 animate-pulse" />
            WAR MODE
          </Link>
          <ThemeToggle />
        </nav>

        <button
          className="lg:hidden rounded-md p-2 text-paper-dim hover:bg-paper/10 hover:text-paper"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden overflow-hidden border-t border-border bg-void"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              <MobileSectionLabel>Analyze</MobileSectionLabel>
              {ANALYZE_LINKS.map((l) => (
                <MobileLink key={l.href} {...l} active={isActive(l.href)} onClick={() => setMobileOpen(false)} />
              ))}
              <MobileSectionLabel>History</MobileSectionLabel>
              {HISTORY_LINKS.map((l) => (
                <MobileLink key={l.href} {...l} active={isActive(l.href)} onClick={() => setMobileOpen(false)} />
              ))}
              <MobileSectionLabel>Live</MobileSectionLabel>
              <MobileLink
                href="/war-mode"
                label="War Mode"
                icon={Swords}
                active={isWarMode}
                onClick={() => setMobileOpen(false)}
              />
              <div className="mt-2 pt-2 border-t border-border">
                <ThemeToggle variant="mobile" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function NavGroup({
  label,
  links,
  active,
}: {
  label: string;
  links: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        className={cn(
          "flex items-center gap-1 rounded-md px-3 py-2 font-hud text-sm font-semibold tracking-wide transition-colors",
          active ? "text-nav-accent" : "text-paper-dim hover:text-paper"
        )}
      >
        {label.toUpperCase()}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full pt-1 w-56"
          >
            <div className="rounded-lg border border-border bg-surface p-1.5 shadow-2xl shadow-void/50">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-text-dim hover:bg-surface-raised hover:text-text transition-colors"
                >
                  <l.icon className="h-4 w-4 text-text-faint" />
                  {l.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 px-2 font-hud text-xs font-bold tracking-[0.2em] text-paper-dim/70">
      {children}
    </div>
  );
}

function MobileLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "bg-surface-raised text-gold" : "text-paper-dim hover:bg-paper/10 hover:text-paper"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
