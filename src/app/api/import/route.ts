import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { parseRaceSheet, groupRowsIntoSeasons } from "@/lib/excel/parse";
import { getStore } from "@/lib/db";
import { CIRCUITS } from "@/lib/data/circuits";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const mode = formData.get("mode"); // "preview" | "commit"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  let rows: unknown[][];
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  } catch {
    return NextResponse.json({ error: "Could not read this file — is it a valid .xlsx spreadsheet?" }, { status: 400 });
  }

  const { rows: parsedRows, warnings: raceWarnings } = parseRaceSheet(rows);
  const result = groupRowsIntoSeasons(parsedRows);
  result.warnings = [...raceWarnings, ...result.warnings];

  const summary = {
    validRows: parsedRows.length,
    completeSeasons: result.seasons.length,
    seasonNumbers: result.seasons.map((s) => s.seasonNumber),
    newCircuits: result.newCircuits.map((c) => c.name),
    trailingIncompleteRaces: result.incompleteTrailingRaces.length,
    warnings: result.warnings,
    contentHash,
  };

  if (mode !== "commit") {
    return NextResponse.json({ preview: summary });
  }

  if (result.seasons.length === 0) {
    return NextResponse.json({ error: "No complete 32-race seasons found — nothing to import." }, { status: 400 });
  }

  const store = getStore();
  // Always ensure the full canonical 32-circuit roster exists before writing
  // any races — a fresh Supabase database only has the tables, not this
  // roster (schema.sql seeds players and the points mapping, not circuits).
  // addCircuits upserts on id, so this is a safe no-op once it's done.
  await store.addCircuits([...CIRCUITS, ...result.newCircuits]);

  let importResult;
  try {
    importResult = await store.importSeasons(result.seasons, result.racesBySeasonId, contentHash, file.name);
  } catch (err) {
    return NextResponse.json(
      { error: `Import failed: ${err instanceof Error ? err.message : String(err)}`, preview: summary },
      { status: 500 }
    );
  }

  if (!importResult.imported) {
    return NextResponse.json({ error: importResult.reason ?? "Import was rejected.", preview: summary }, { status: 409 });
  }

  return NextResponse.json({ imported: importResult, preview: summary });
}
