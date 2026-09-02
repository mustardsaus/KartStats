/**
 * Known alternate spellings for circuits that appear in real-world manually
 * typed race logs. Only add an entry here when the alias is unambiguous
 * (i.e. it can only ever mean one canonical circuit) — ambiguous cases
 * (like a name that sometimes means one track and sometimes another,
 * depending on what's missing from that season) are resolved by the
 * gap-fill algorithm in `parse.ts` instead, not hardcoded here.
 */
export const CIRCUIT_NAME_ALIASES: Record<string, string> = {
  "Waluigi Stadium": "GCN Waluigi Stadium",
};

export function normalizeCircuitName(rawName: string): string {
  const trimmed = rawName.trim();
  return CIRCUIT_NAME_ALIASES[trimmed] ?? trimmed;
}
