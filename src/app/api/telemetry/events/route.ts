/**
 * The Dolphin -> KartStats live telemetry bridge (Immersive War Mode).
 * The Python tracker (tools/position-read/scripts -- already built and
 * locked down, not touched by this route) POSTs batches of TelemetryEvent
 * here as it detects race events. Guarded by a static bearer token
 * (TELEMETRY_BRIDGE_TOKEN) -- proportionate for a local script talking to
 * a local dev server, not real session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { dropLapZeroEvents, resolveEvents, type TelemetryEvent } from "@/lib/telemetry/events";
import { maybeFinalizeImmersiveRace } from "@/lib/telemetry/finalize";
import { completeSeasonIfFull } from "@/app/war-mode/actions";

export const runtime = "nodejs";

interface TelemetryEventBatchBody {
  events: TelemetryEvent[];
}

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.TELEMETRY_BRIDGE_TOKEN;
  // Refuse everything if the bridge isn't configured -- never silently
  // accept events with no token set.
  if (!token) return false;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: TelemetryEventBatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body?.events) || body.events.length === 0) {
    return NextResponse.json({ error: "Expected a non-empty `events` array." }, { status: 400 });
  }

  // All events in one POST batch belong to the same in-progress race --
  // the Python side only ever buffers one race at a time.
  const { seasonId } = body.events[0];
  const senderRaceNumber = body.events[0].raceNumber;
  const mismatched = body.events.find((e) => e.seasonId !== seasonId || e.raceNumber !== senderRaceNumber);
  if (mismatched) {
    return NextResponse.json(
      { error: "All events in one batch must share the same seasonId and raceNumber." },
      { status: 400 }
    );
  }

  const store = getStore();
  const seasons = await store.getSeasons();
  const season = seasons.find((s) => s.id === seasonId);
  if (!season) {
    return NextResponse.json({ error: `Season ${seasonId} not found.` }, { status: 404 });
  }
  if (season.mode !== "immersive") {
    return NextResponse.json({ error: `Season ${seasonId} is not an Immersive season.` }, { status: 409 });
  }

  // The race number is decided HERE, not trusted from the sender: the
  // Python tracker counts races from 1 each time it starts, so restarting
  // it mid-season would otherwise send "race 1" again and collide with an
  // already-saved race. The in-progress race is always the next one after
  // however many are saved for this season.
  const racesBySeason = await store.getRacesBySeasonId();
  const raceNumber = (racesBySeason.get(seasonId)?.length ?? 0) + 1;

  // Lap 0 is dropped here -- the single ingestion choke point, never
  // trusted to the Python sender alone (see dropLapZeroEvents's module
  // doc in lib/telemetry/events.ts). resolveEvents then turns each
  // event's raw tracked slot into the real adi/ren playerId, using this
  // season's Player Assignment (adiTelemetrySlot/renTelemetrySlot).
  const withoutLapZero = dropLapZeroEvents(body.events);
  const resolved = resolveEvents(season, withoutLapZero).map((e) => ({ ...e, raceNumber }));
  const droppedCount = body.events.length - resolved.length;

  if (resolved.length > 0) {
    await store.ingestTelemetryEvents(seasonId, raceNumber, resolved);
  }

  const allEvents = await store.getLiveTelemetryEvents(seasonId, raceNumber);
  const result = await maybeFinalizeImmersiveRace(seasonId, raceNumber, allEvents);

  if (result.finalized) {
    await completeSeasonIfFull(seasonId);
    revalidatePath("/war-mode");
    revalidatePath("/");
    revalidatePath("/season-rewind");
  }

  return NextResponse.json({
    ingested: resolved.length,
    dropped: droppedCount,
    finalized: result.finalized,
    raceId: result.raceId ?? null,
  });
}
