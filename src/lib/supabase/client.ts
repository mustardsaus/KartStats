import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Battle Mode needs everything isSupabaseConfigured() needs, PLUS a public
 * anon key so the browser can subscribe to Realtime — that's genuinely a
 * hosted-Supabase-platform feature with no local/in-memory equivalent, so
 * the UI hides "Engage in Battle" entirely rather than pretending to offer
 * a mode that can't actually go live.
 */
export function isBattleModeAvailable(): boolean {
  return isSupabaseConfigured() && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Server-only Supabase client, authenticated with the service role key so
 * War Mode / Excel-import writes bypass RLS. Never import this from a
 * Client Component — the service role key must never reach the browser.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured — NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}
