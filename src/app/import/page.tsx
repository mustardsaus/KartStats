"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionHeading } from "@/components/ui/Card";
import { UploadCloud, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

interface Preview {
  validRows: number;
  completeSeasons: number;
  seasonNumbers: number[];
  newCircuits: string[];
  trailingIncompleteRaces: number;
  warnings: { level: "info" | "warning" | "error"; message: string }[];
  contentHash: string;
}

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ seasonNumbers: number[]; raceCount: number } | null>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setError(null);
    setImported(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("mode", "preview");
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not preview this file.");
      } else {
        setPreview(data.preview);
      }
    } catch {
      setError("Something went wrong reading the file.");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "commit");
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
      } else {
        setImported(data.imported);
        router.refresh();
      }
    } catch {
      setError("Something went wrong importing the file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      <SectionHeading eyebrow="Data" title="Import Historical Data" />
      <p className="text-text-dim max-w-2xl mb-8 text-sm">
        Upload a race-log spreadsheet: column A is the circuit name, column B is Adi&apos;s finishing
        position, column C is Ren&apos;s finishing position. Rows are grouped into 32-race seasons
        automatically — points are always calculated, never read from the file.
      </p>

      <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border hover:border-border-strong bg-surface p-10 cursor-pointer transition-colors mb-6">
        <UploadCloud className="h-8 w-8 text-text-faint" />
        <span className="text-sm text-text-dim">
          {file ? file.name : "Click to choose an .xlsx file"}
        </span>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {loading && <p className="text-sm text-text-faint mb-6">Reading file…</p>}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger mb-6">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {preview && !imported && (
        <div className="rounded-xl border border-border bg-surface p-5 sm:p-6 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Stat label="Valid Rows" value={preview.validRows} />
            <Stat label="Complete Seasons" value={preview.completeSeasons} />
            <Stat label="Seasons" value={preview.seasonNumbers.join(", ") || "—"} />
            <Stat label="Leftover Races" value={preview.trailingIncompleteRaces} />
          </div>

          {preview.newCircuits.length > 0 && (
            <p className="text-xs text-text-dim mb-4">
              New circuits detected (will be added): {preview.newCircuits.join(", ")}
            </p>
          )}

          {preview.warnings.length > 0 && (
            <div className="space-y-1.5 mb-5 max-h-60 overflow-y-auto pr-1">
              {preview.warnings.map((w, i) => (
                <div
                  key={i}
                  className={
                    "flex items-start gap-2 rounded-md px-3 py-2 text-xs " +
                    (w.level === "error"
                      ? "bg-danger/10 text-danger"
                      : w.level === "warning"
                        ? "bg-gold/10 text-gold"
                        : "bg-surface-raised text-text-dim")
                  }
                >
                  {w.level === "error" ? (
                    <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  ) : w.level === "warning" ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleCommit}
            disabled={loading || preview.completeSeasons === 0}
            className="w-full rounded-xl bg-gold text-void py-3 font-hud font-bold tracking-wide disabled:opacity-40 hover:brightness-110 transition-all"
          >
            {preview.completeSeasons === 0
              ? "No complete seasons to import"
              : `Import ${preview.completeSeasons} Season${preview.completeSeasons === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {imported && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald/40 bg-emerald/10 p-5 text-emerald">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-hud font-bold">Import complete</p>
            <p className="text-sm mt-1 text-text-dim">
              Added season{imported.seasonNumbers.length === 1 ? "" : "s"} {imported.seasonNumbers.join(", ")} —{" "}
              {imported.raceCount} races. Every stat page has already picked it up.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-raised py-3 text-center">
      <p className="text-stat text-lg font-bold text-text">{value}</p>
      <p className="text-[12px] text-text-faint uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}
