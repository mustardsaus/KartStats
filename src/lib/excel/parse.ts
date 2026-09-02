import * as XLSX from "xlsx";
import type { Circuit, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { CIRCUITS } from "@/lib/data/circuits";
import { isValidFinishingPosition } from "@/lib/stats/points";
import { normalizeCircuitName } from "./circuit-aliases";

export interface ImportWarning {
  level: "info" | "warning" | "error";
  message: string;
}

export interface ParsedRaceRow {
  circuitName: string;
  adiFinishingPosition: number;
  renFinishingPosition: number;
}

export interface ImportResult {
  seasons: RawSeason[];
  racesBySeasonId: Map<string, RawRace[]>;
  newCircuits: Circuit[]; // circuits encountered that weren't in the known roster
  warnings: ImportWarning[];
  incompleteTrailingRaces: ParsedRaceRow[]; // rows left over that don't fill a full 32-race season
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Reads the raw race-log sheet: column A = circuit name, column B = Adi's
 * finishing position, column C = Ren's finishing position. No header row
 * is assumed — every row with three populated cells is treated as data.
 */
export function parseRaceSheet(rows: unknown[][]): {
  rows: ParsedRaceRow[];
  warnings: ImportWarning[];
} {
  const warnings: ImportWarning[] = [];
  const parsed: ParsedRaceRow[] = [];

  rows.forEach((row, idx) => {
    const [circuitCell, adiCell, renCell] = row;
    const isBlank = circuitCell === undefined && adiCell === undefined && renCell === undefined;
    if (isBlank) return;

    if (typeof circuitCell !== "string" || circuitCell.trim() === "") {
      warnings.push({ level: "error", message: `Row ${idx + 1}: missing circuit name — skipped.` });
      return;
    }
    const adiPos = Number(adiCell);
    const renPos = Number(renCell);
    if (!isValidFinishingPosition(adiPos)) {
      warnings.push({
        level: "error",
        message: `Row ${idx + 1} (${circuitCell}): invalid Adi finishing position "${adiCell}" — skipped.`,
      });
      return;
    }
    if (!isValidFinishingPosition(renPos)) {
      warnings.push({
        level: "error",
        message: `Row ${idx + 1} (${circuitCell}): invalid Ren finishing position "${renCell}" — skipped.`,
      });
      return;
    }

    parsed.push({
      circuitName: normalizeCircuitName(circuitCell),
      adiFinishingPosition: adiPos,
      renFinishingPosition: renPos,
    });
  });

  return { rows: parsed, warnings };
}

/**
 * Optional points-mapping sheet: column A = finishing position, column B =
 * points. If no sheet is supplied, callers should fall back to a
 * previously configured mapping — the importer never invents scoring.
 */
export function parsePointsMappingSheet(rows: unknown[][]): {
  mapping: PointsMapping;
  warnings: ImportWarning[];
} {
  const warnings: ImportWarning[] = [];
  const mapping: PointsMapping = [];

  rows.forEach((row, idx) => {
    const [posCell, pointsCell] = row;
    if (posCell === undefined && pointsCell === undefined) return;
    const pos = Number(posCell);
    const points = Number(pointsCell);
    if (!Number.isInteger(pos) || pos < 1 || !Number.isFinite(points)) {
      warnings.push({ level: "error", message: `Points mapping row ${idx + 1}: invalid entry — skipped.` });
      return;
    }
    mapping.push({ finishingPosition: pos, points });
  });

  return { mapping, warnings };
}

/**
 * For a handful of unrecognized names that are known to sometimes stand in
 * for more than one real circuit (e.g. a hand-typed race log calling both
 * the Nitro "Bowser's Castle" and the Retro "GBA Bowser Castle 3" by a
 * similar-sounding name), this lists which canonical circuit to prefer,
 * in priority order, when more than one candidate is missing from the
 * season. Ordering reflects which mapping is overwhelmingly more common
 * in practice — this is a documented judgment call, not a guess made
 * silently: every resolution is still reported as an import warning.
 */
const AMBIGUOUS_ALIAS_PRIORITY: Record<string, string[]> = {
  "SNES Bowser's Castle": ["Bowser's Castle", "GBA Bowser Castle 3"],
};

/**
 * Within one season's worth of rows (assumed to be exactly RACES_PER_SEASON
 * long), reconciles unrecognized circuit names against the canonical
 * roster: if a season is missing exactly one canonical circuit and has
 * exactly one row using an unrecognized name, the two are almost certainly
 * the same real-world race (a typo/rename), so the row is relabeled — and
 * the correction is reported as a warning rather than applied silently.
 * A genuinely duplicate canonical name (the same real circuit typed twice)
 * is resolved the same way when it lines up with a single missing circuit;
 * the later occurrence is the one relabeled, and this is also reported.
 * Anything that still can't be resolved unambiguously is left as-is and
 * surfaced as a new circuit rather than guessed at.
 */
function gapFillSeasonCircuitNames(
  seasonRows: ParsedRaceRow[],
  canonicalNames: Set<string>,
  seasonLabel: string,
  warnings: ImportWarning[]
): ParsedRaceRow[] {
  let rows = [...seasonRows];

  const recompute = () => {
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.circuitName, (counts.get(r.circuitName) ?? 0) + 1));
    const missing = new Set([...canonicalNames].filter((name) => !counts.has(name)));
    const unrecognized = [...counts.keys()].filter((name) => !canonicalNames.has(name));
    const duplicated = [...counts.entries()].filter(([name, c]) => c > 1 && canonicalNames.has(name));
    return { counts, missing, unrecognized, duplicated };
  };

  // Pass 1: resolve unrecognized names that have a known priority mapping
  // against whichever candidate is actually missing this season.
  let { missing, unrecognized } = recompute();
  for (const badName of unrecognized) {
    const priorities = AMBIGUOUS_ALIAS_PRIORITY[badName];
    if (!priorities) continue;
    const target = priorities.find((candidate) => missing.has(candidate));
    if (!target) continue;
    const idx = rows.findIndex((r) => r.circuitName === badName);
    if (idx === -1) continue;
    rows = rows.map((r, i) => (i === idx ? { ...r, circuitName: target } : r));
    warnings.push({
      level: "info",
      message: `${seasonLabel}: interpreted "${badName}" as "${target}" (known alias, resolved against that season's missing circuit).`,
    });
  }

  // Pass 2: exactly one missing canonical circuit + exactly one remaining unrecognized name -> alias.
  ({ missing, unrecognized } = recompute());
  let duplicated = recompute().duplicated;
  if (missing.size === 1 && unrecognized.length === 1 && duplicated.length === 0) {
    const missingName = [...missing][0];
    const [badName] = unrecognized;
    const idx = rows.findIndex((r) => r.circuitName === badName);
    rows = rows.map((r, i) => (i === idx ? { ...r, circuitName: missingName } : r));
    warnings.push({
      level: "info",
      message: `${seasonLabel}: interpreted "${badName}" as "${missingName}" (only circuit missing that season).`,
    });
  }

  // Pass 3: exactly one missing canonical circuit + exactly one canonical circuit duplicated -> relabel the later dupe.
  ({ missing, duplicated } = recompute());
  if (missing.size === 1 && duplicated.length === 1) {
    const missingName = [...missing][0];
    const [dupeName] = duplicated[0];
    const lastIdx = rows.map((r) => r.circuitName).lastIndexOf(dupeName);
    rows = rows.map((r, i) => (i === lastIdx ? { ...r, circuitName: missingName } : r));
    warnings.push({
      level: "info",
      message: `${seasonLabel}: "${dupeName}" appeared twice; relabeled the later occurrence as "${missingName}" (only circuit missing that season).`,
    });
  }

  const final = recompute();
  if (final.unrecognized.length > 0) {
    warnings.push({
      level: "warning",
      message: `${seasonLabel}: could not confidently resolve circuit name(s) ${final.unrecognized
        .map((n) => `"${n}"`)
        .join(", ")} — added as new circuit(s) instead of an existing one.`,
    });
  }

  return rows;
}

/**
 * Full import pipeline: parsed race rows -> validated, gap-filled, and
 * grouped into RACES_PER_SEASON-sized seasons with derived RawSeason
 * shells. Leftover rows that don't complete a full season are returned
 * separately rather than silently forming a short "season".
 */
export function groupRowsIntoSeasons(
  rows: ParsedRaceRow[],
  options?: { seasonStartDate?: Date; startingSeasonNumber?: number }
): ImportResult {
  const warnings: ImportWarning[] = [];
  const canonicalNames = new Set(CIRCUITS.map((c) => c.name));
  const knownCircuitsByName = new Map(CIRCUITS.map((c) => [c.name, c]));
  const newCircuits: Circuit[] = [];
  const newCircuitNames = new Set<string>();

  const seasons: RawSeason[] = [];
  const racesBySeasonId = new Map<string, RawRace[]>();

  const fullSeasonCount = Math.floor(rows.length / RACES_PER_SEASON);
  const startingSeasonNumber = options?.startingSeasonNumber ?? 1;
  const baseDate = options?.seasonStartDate ?? new Date("2024-01-01T00:00:00.000Z");

  for (let s = 0; s < fullSeasonCount; s++) {
    const seasonNumber = startingSeasonNumber + s;
    const seasonLabel = `Season ${seasonNumber}`;
    let seasonRows = rows.slice(s * RACES_PER_SEASON, (s + 1) * RACES_PER_SEASON);
    seasonRows = gapFillSeasonCircuitNames(seasonRows, canonicalNames, seasonLabel, warnings);

    const seasonId = `season-${seasonNumber}`;
    const startDate = new Date(baseDate);
    startDate.setUTCDate(startDate.getUTCDate() + s * 21);
    const completionDate = new Date(startDate);
    completionDate.setUTCDate(completionDate.getUTCDate() + 20);

    const races: RawRace[] = seasonRows.map((row, i) => {
      let circuit = knownCircuitsByName.get(row.circuitName);
      if (!circuit) {
        const id = slugify(row.circuitName);
        circuit = { id, name: row.circuitName, imageUrl: "/circuits/placeholder.svg" };
        if (!newCircuitNames.has(row.circuitName)) {
          newCircuitNames.add(row.circuitName);
          newCircuits.push(circuit);
        }
      }
      return {
        id: `${seasonId}-race-${i + 1}`,
        seasonId,
        raceNumber: i + 1,
        circuitId: circuit.id,
        adiFinishingPosition: row.adiFinishingPosition,
        renFinishingPosition: row.renFinishingPosition,
        createdAt: startDate.toISOString(),
      };
    });

    racesBySeasonId.set(seasonId, races);
    seasons.push({
      id: seasonId,
      seasonNumber,
      startDate: startDate.toISOString(),
      completionDate: completionDate.toISOString(),
      isComplete: true,
      winnerId: null,
      adiFinalPoints: null,
      renFinalPoints: null,
      createdAt: startDate.toISOString(),
    });
  }

  const leftover = rows.slice(fullSeasonCount * RACES_PER_SEASON);
  if (leftover.length > 0) {
    warnings.push({
      level: "warning",
      message: `${leftover.length} trailing race row(s) do not complete a full ${RACES_PER_SEASON}-race season and were not imported as a season. They can be entered live via War Mode to complete the season.`,
    });
  }

  return { seasons, racesBySeasonId, newCircuits, warnings, incompleteTrailingRaces: leftover };
}

/** Convenience: parse an xlsx ArrayBuffer/Buffer straight through the whole pipeline. */
export function parseWorkbook(
  fileData: ArrayBuffer | Buffer,
  options?: { raceSheetName?: string; pointsSheetName?: string }
): {
  importResult: ImportResult;
  pointsMapping: PointsMapping | null;
  parseWarnings: ImportWarning[];
} {
  const wb = XLSX.read(fileData, { type: "array" });
  const raceSheetName = options?.raceSheetName ?? wb.SheetNames[0];
  const raceSheet = wb.Sheets[raceSheetName];
  const raceRows = XLSX.utils.sheet_to_json<unknown[]>(raceSheet, { header: 1 });
  const { rows, warnings: raceWarnings } = parseRaceSheet(raceRows);

  let pointsMapping: PointsMapping | null = null;
  const parseWarnings = [...raceWarnings];

  if (options?.pointsSheetName && wb.Sheets[options.pointsSheetName]) {
    const pointsSheet = wb.Sheets[options.pointsSheetName];
    const pointsRows = XLSX.utils.sheet_to_json<unknown[]>(pointsSheet, { header: 1 });
    const parsedPoints = parsePointsMappingSheet(pointsRows);
    pointsMapping = parsedPoints.mapping;
    parseWarnings.push(...parsedPoints.warnings);
  }

  const importResult = groupRowsIntoSeasons(rows);
  importResult.warnings = [...parseWarnings, ...importResult.warnings];

  return { importResult, pointsMapping, parseWarnings };
}
