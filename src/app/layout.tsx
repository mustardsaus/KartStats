import type { Metadata } from "next";
// Self-hosted via @fontsource (npm packages) rather than next/font/google —
// keeps builds hermetic (no runtime fetch to fonts.googleapis.com needed)
// and avoids any dependency on outbound access to Google Fonts.
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/alegreya/400.css";
import "@fontsource/alegreya/500.css";
import "@fontsource/alegreya/600.css";
import "@fontsource/alegreya/700.css";
import "@fontsource/alegreya/400-italic.css";
import "@fontsource/alegreya/500-italic.css";
import "@fontsource/alegreya/600-italic.css";
import "@fontsource/spectral/500.css";
import "@fontsource/spectral/600.css";
import "@fontsource/spectral/700.css";
// Dark-mode font set — only actually downloaded by the browser if the
// dark theme is active and something on screen resolves to these families.
import "@fontsource/orbitron/600.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/800.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Racing Archives — Adi vs Ren",
  description: "The chronicle of the all-time Mario Kart Wii rivalry between Adi and Ren — stats, seasons, and War Mode.",
};

// Every page here reads live race/season data (Supabase in production).
// Without this, Next.js prerenders these routes to static HTML at build
// time and serves that same snapshot to every visitor forever — which is
// exactly why the live site kept showing "0 seasons" after data was
// imported. Forcing dynamic rendering at the root makes every nested page
// fetch fresh on every request.
export const dynamic = "force-dynamic";

// Applies the saved theme before first paint so switching to Dark Mode
// doesn't flash the parchment theme for a frame on every reload. Runs as
// an early inline script rather than a useEffect (which would only run
// after React hydrates and the parchment styles have already painted).
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("mk-rivalry-theme");
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
