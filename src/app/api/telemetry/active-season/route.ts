/**
 * Lets the Dolphin tracker find the season to post into on its own,
 * instead of the person copying a season id out of the page and passing
 * it on the command line every time (see tools/position-read/README.md
 * and kartstats_bridge.py's discover_season()). Same bearer-token guard
 * as /api/telemetry/events -- this is read-only, but still only useful to
 * someone who already has the bridge token.
 *
 * Returns the single Immersive season currently waiting for Dolphin: not
 * complete, mode === "immersive". If more than one such season exists
 * (shouldn't normally happen -- War Mode only lets one season be active
 * at a time) the most recently created one wins, same "newest wins"
 * convention used elsewhere rather than guessing which the person meant.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.TELEMETRY_BRIDGE_TOKEN;
  if (!token) return false;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const store = getStore();
  const seasons = await store.getSeasons();
  const candidates = seasons
    .filter((s) => !s.isComplete && s.mode === "immersive")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ seasonId: candidates[0]?.id ?? null });
}
