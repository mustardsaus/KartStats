"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Browser-only Supabase client, authenticated with the public anon key.
 * Used for exactly one thing: subscribing to Realtime changes on
 * `seasons` / `battle_rounds` so both phones in a battle update live. RLS
 * (see the migration script) grants this key SELECT only on those two
 * tables — every write, and every other read, still goes through Next.js
 * server actions using the service-role key (src/lib/supabase/client.ts),
 * exactly as it did before Battle Mode existed. Never import this from a
 * Server Component/action.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Battle Mode isn't configured in this environment — NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}
