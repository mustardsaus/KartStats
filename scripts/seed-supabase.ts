// Pushes the historical dataset (src/lib/data/real-history.json — already
// parsed from the user's Excel file) into a freshly-migrated Supabase
// project. Run this once, after running supabase/schema.sql and setting
// NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local:
//   npx tsx --env-file=.env.local scripts/seed-supabase.ts
import { createHash } from "node:crypto";
import type { RawRace, RawSeason } from "../src/lib/types";
import { CIRCUITS } from "../src/lib/data/circuits";
import realHistory from "../src/lib/data/real-history.json";
import { supabaseStore } from "../src/lib/db/supabase-store";
import { isSupabaseConfigured } from "../src/lib/supabase/client";

async function main() {
  if (!isSupabaseConfigured()) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Add them to .env.local first."
    );
    process.exit(1);
  }

  console.log("Ensuring the full circuit roster exists...");
  await supabaseStore.addCircuits(CIRCUITS);

  const seasons = realHistory.seasons as RawSeason[];
  const racesBySeasonId = new Map<string, RawRace[]>();
  for (const race of realHistory.races as RawRace[]) {
    const list = racesBySeasonId.get(race.seasonId) ?? [];
    list.push(race);
    racesBySeasonId.set(race.seasonId, list);
  }

  const contentHash = createHash("sha256")
    .update(JSON.stringify({ seasons, races: realHistory.races }))
    .digest("hex");

  console.log(`Importing ${seasons.length} seasons / ${realHistory.races.length} races...`);
  const result = await supabaseStore.importSeasons(seasons, racesBySeasonId, contentHash, realHistory.sourceFile);

  if (!result.imported) {
    console.log(`Skipped: ${result.reason}`);
    console.log("(This usually means it's already been imported — nothing to do.)");
    return;
  }

  console.log(`Done — imported seasons ${result.seasonNumbers.join(", ")} (${result.raceCount} races).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
