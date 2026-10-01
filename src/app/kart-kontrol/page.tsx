import { loadStatsModel } from "@/lib/services/stats-service";
import { SectionHeading } from "@/components/ui/Card";
import { KartKontrolClient } from "@/components/kartkontrol/KartKontrolClient";

/**
 * Kart Kontrol (Season 15+): character, kart, and transmission tracking.
 * All the actual filtering/derivation happens client-side in
 * KartKontrolClient — this just loads the full stats model once, same as
 * every other analyze page (players/page.tsx, trendline/page.tsx).
 */
export default async function KartKontrolPage() {
  const model = await loadStatsModel();
  const circuits = model.circuits.map((c) => c.circuit);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
      <SectionHeading eyebrow="Analyze" title="Kart Kontrol" />
      <p className="text-text-dim max-w-2xl mb-8 text-sm leading-relaxed">
        Character, kart, and transmission tracking for Battle Mode, Season 15 onward. Pick a player, then narrow by
        character or kart to see how a loadout actually performs.
      </p>
      <KartKontrolClient seasons={model.seasons} circuits={circuits} />
    </div>
  );
}
