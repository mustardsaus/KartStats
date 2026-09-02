import { isSupabaseConfigured } from "@/lib/supabase/client";
import { localStore } from "./local-store";
import { supabaseStore } from "./supabase-store";
import type { DataStore } from "./types";

/**
 * Returns the active data store. Supabase is used automatically once
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; until then
 * everything runs against the in-memory store seeded from the imported
 * historical dataset (src/lib/data/real-history.json), so the app is fully
 * functional from the first run. The Supabase client itself is created
 * lazily on first use, so importing supabase-store here has no effect
 * when the env vars are unset.
 */
export function getStore(): DataStore {
  return isSupabaseConfigured() ? supabaseStore : localStore;
}

export type { DataStore } from "./types";
