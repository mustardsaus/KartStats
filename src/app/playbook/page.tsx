import { loadStatsModel } from "@/lib/services/stats-service";
import { getStore } from "@/lib/db";
import { SectionHeading } from "@/components/ui/Card";
import { PlaybookClient } from "@/components/playbook/PlaybookClient";

/**
 * Playbook: pick a character + kart, see the combined build's stats and
 * which circuits it's suited to. Same loading shape as every other
 * analyze page (kart-kontrol/page.tsx) -- load everything once server-
 * side, derive/filter client-side -- plus one extra bulk fetch
 * (getAllRaceSpeedSamples) that Kart Kontrol doesn't need, for the
 * real-telemetry circuit profile (lib/stats/circuit-profile.ts).
 */
export default async function PlaybookPage() {
  const model = await loadStatsModel();
  const circuits = model.circuits.map((c) => c.circuit);
  const speedSamples = await getStore().getAllRaceSpeedSamples();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
      <SectionHeading eyebrow="Analyze" title="Playbook" />
      <p className="text-text-dim max-w-2xl mb-8 text-sm leading-relaxed">
        Pick a character and kart to see the build&apos;s combined stats and which circuits it&apos;s suited to — a
        research-based estimate for every build, plus your actual recorded results once you&apos;ve raced it enough.
      </p>
      <PlaybookClient seasons={model.seasons} circuits={circuits} speedSamples={speedSamples} />
    </div>
  );
}
