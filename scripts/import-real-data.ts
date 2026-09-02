// One-off script: converts the user's uploaded historical Excel file into
// the app's static fallback dataset (src/lib/data/real-history.json), using
// the exact same import pipeline (src/lib/excel/parse.ts) that the in-app
// Excel importer will use for future imports. Run with:
//   npx tsx scripts/import-real-data.ts <path-to-xlsx>
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseRaceSheet, groupRowsIntoSeasons } from "../src/lib/excel/parse";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: tsx scripts/import-real-data.ts <path-to-xlsx>");
  process.exit(1);
}

const buf = fs.readFileSync(inputPath);
const wb = XLSX.read(buf, { type: "buffer" });
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1 });

const { rows: parsedRows, warnings: raceWarnings } = parseRaceSheet(rows);
const result = groupRowsIntoSeasons(parsedRows);
result.warnings = [...raceWarnings, ...result.warnings];

console.log(`Parsed ${parsedRows.length} valid race rows -> ${result.seasons.length} complete seasons.`);
console.log(`New/unrecognized circuits: ${result.newCircuits.map((c) => c.name).join(", ") || "none"}`);
console.log("\nWarnings:");
result.warnings.forEach((w) => console.log(`  [${w.level}] ${w.message}`));

const races = [...result.racesBySeasonId.values()].flat();

const output = {
  seasons: result.seasons,
  races,
  generatedAt: new Date().toISOString(),
  sourceFile: path.basename(inputPath),
};

const outPath = path.join(__dirname, "../src/lib/data/real-history.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\nWrote ${races.length} races across ${result.seasons.length} seasons to ${outPath}`);
