"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Circuit, PlayerId, TransmissionMode } from "@/lib/types";
import type { SeasonStat } from "@/lib/stats";
import {
  MIN_SAMPLE_SIZE,
  buildCharacterCircuitSuitability,
  buildCharacterComparison,
  buildCircuitBreakdown,
  buildComboCircuitSuitability,
  buildKartCircuitSuitability,
  buildKartComparison,
  buildKartKontrolSummary,
  buildSeasonsTable,
  getUsedCharacterIds,
  getUsedCombos,
  getUsedKartIds,
  type CircuitSuitability,
  type KartKontrolFilter,
  type LoadoutUsageRow,
} from "@/lib/stats/kart-kontrol";
import { CHARACTERS_BY_ID } from "@/lib/data/characters";
import { VEHICLES_BY_ID } from "@/lib/data/karts";
import { PLAYERS } from "@/lib/data/points-mapping";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { StaggerIn } from "@/components/ui/StaggerIn";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * Kart Kontrol (Season 15+): the player/character/kart filterable stats
 * page. Everything here is derived client-side from the full seasons
 * dataset the server component passes down (see lib/stats/kart-kontrol.ts)
 * — no extra fetch, since the dataset is already small enough (a handful
 * of seasons, 32 races each) to filter instantly in the browser.
 *
 * Character/kart dropdowns are populated ONLY from what this player has
 * actually used (getUsedCharacterIds/getUsedKartIds) — never the full
 * roster — so a player who's only ever driven 3 characters sees 3 options,
 * not 26. Picking neither filter means "everything": the player's whole
 * career, including every pre-Season-15 race (which simply has no loadout
 * data).
 */
export function KartKontrolClient({ seasons, circuits }: { seasons: SeasonStat[]; circuits: Circuit[] }) {
  const [playerId, setPlayerId] = useState<PlayerId>("adi");
  const [character, setCharacter] = useState<string | null>(null);
  const [kart, setKart] = useState<string | null>(null);
  const [transmission, setTransmission] = useState<TransmissionMode | null>(null);

  const usedCharacters = useMemo(() => getUsedCharacterIds(seasons, playerId), [seasons, playerId]);
  const usedKarts = useMemo(() => getUsedKartIds(seasons, playerId), [seasons, playerId]);
  const usedCombos = useMemo(() => getUsedCombos(seasons, playerId), [seasons, playerId]);

  const filter: KartKontrolFilter = useMemo(
    () => ({ character, kart, transmission }),
    [character, kart, transmission]
  );

  const summary = useMemo(() => buildKartKontrolSummary(seasons, playerId, filter), [seasons, playerId, filter]);
  const seasonRows = useMemo(() => buildSeasonsTable(seasons, playerId, filter), [seasons, playerId, filter]);
  const circuitRows = useMemo(
    () => buildCircuitBreakdown(seasons, playerId, filter, circuits),
    [seasons, playerId, filter, circuits]
  );
  const characterComparison = useMemo(() => buildCharacterComparison(seasons, playerId), [seasons, playerId]);
  const kartComparison = useMemo(() => buildKartComparison(seasons, playerId), [seasons, playerId]);

  const accent = playerId === "adi" ? "adi" : "ren";

  const selectPlayer = (id: PlayerId) => {
    setPlayerId(id);
    setCharacter(null);
    setKart(null);
    setTransmission(null);
  };

  const characterName = character ? (CHARACTERS_BY_ID.get(character)?.name ?? character) : null;
  const kartName = kart ? (VEHICLES_BY_ID.get(kart)?.name ?? kart) : null;

  // What circuit-suitability should it show when nothing specific is
  // selected? Falls back to whichever character/kart this player has
  // actually used the most, so Insights is never just an empty filter
  // prompt — it always has something real to show once any data exists.
  const suitabilityCharacterId = character ?? characterComparison[0]?.id ?? null;
  const suitabilityKartId = kart ?? kartComparison[0]?.id ?? null;

  const characterSuitability = useMemo(
    () =>
      suitabilityCharacterId
        ? buildCharacterCircuitSuitability(seasons, playerId, suitabilityCharacterId, circuits)
        : null,
    [seasons, playerId, suitabilityCharacterId, circuits]
  );
  const kartSuitability = useMemo(
    () => (suitabilityKartId ? buildKartCircuitSuitability(seasons, playerId, suitabilityKartId, circuits) : null),
    [seasons, playerId, suitabilityKartId, circuits]
  );

  return (
    <div className="space-y-10">
      {/* Player selector — top-level context for everything below. */}
      <div className="flex gap-3">
        {(["adi", "ren"] as const).map((id) => (
          <button
            key={id}
            onClick={() => selectPlayer(id)}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl border p-4 transition-colors",
              playerId === id
                ? id === "adi"
                  ? "border-adi bg-adi/10"
                  : "border-ren bg-ren/10"
                : "border-border bg-surface hover:bg-surface-raised"
            )}
          >
            <PlayerAvatar playerId={id} size={40} />
            <div className="text-left">
              <p className={cn("font-display text-lg tracking-wide", playerId === id ? (id === "adi" ? "text-adi" : "text-ren") : "text-text")}>
                {PLAYERS[id].name.toUpperCase()}
              </p>
              <p className="text-[11px] text-text-faint">{PLAYERS[id].characterName}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Character / kart / transmission filters. */}
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterSelect
            label="Character"
            value={character}
            onChange={setCharacter}
            options={usedCharacters.map((id) => ({ value: id, label: CHARACTERS_BY_ID.get(id)?.name ?? id }))}
            placeholder="Any character"
          />
          <FilterSelect
            label="Kart"
            value={kart}
            onChange={setKart}
            options={usedKarts.map((id) => ({ value: id, label: VEHICLES_BY_ID.get(id)?.name ?? id }))}
            placeholder="Any kart"
          />
          {/* Transmission is deliberately the smallest, least prominent control here — tracked, never a headline feature. */}
          <FilterSelect
            label="Transmission"
            value={transmission}
            onChange={(v) => setTransmission(v as TransmissionMode | null)}
            options={[
              { value: "automatic", label: "Automatic" },
              { value: "manual", label: "Manual" },
            ]}
            placeholder="Any transmission"
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-text-dim">
            Showing <span className={cn("font-semibold", accent === "adi" ? "text-adi" : "text-ren")}>{PLAYERS[playerId].name}</span>
            {characterName && (
              <>
                {" "}
                as <span className="font-semibold text-text">{characterName}</span>
              </>
            )}
            {kartName && (
              <>
                {" "}
                in the <span className="font-semibold text-text">{kartName}</span>
              </>
            )}
            {transmission && (
              <>
                {" "}
                &middot; <span className="font-semibold text-text capitalize">{transmission}</span>
              </>
            )}
            {!characterName && !kartName && !transmission && <> &middot; everything</>}
          </p>
          {(character || kart || transmission) && (
            <button
              onClick={() => {
                setCharacter(null);
                setKart(null);
                setTransmission(null);
              }}
              className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Summary stats — adapt to whatever is currently filtered. */}
      {summary.races === 0 ? (
        <p className="text-sm text-text-faint">No races recorded yet for this combination.</p>
      ) : (
        <StaggerIn className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatTile label="Races" value={summary.races} accent={accent} />
          <StatTile label="Races Won" value={summary.racesWon} accent={accent} />
          <StatTile label="Seasons Won" value={summary.seasonsWon} accent={accent} />
          <StatTile label="Podiums" value={summary.podiums} accent={accent} />
          <StatTile label="Total Points" value={summary.totalPoints} accent={accent} />
          <StatTile label="Avg. Pts/Race" value={summary.avgPointsPerRace ?? "—"} accent={accent} />
          <StatTile label="Median Finish" value={summary.medianFinish ?? "—"} accent={accent} />
          <StatTile label="Avg. Finish" value={summary.avgFinish ?? "—"} accent={accent} />
          <StatTile label="Win Rate" value={summary.winRate !== null ? `${summary.winRate}%` : "—"} accent={accent} />
          <StatTile label="Podium Rate" value={summary.podiumRate !== null ? `${summary.podiumRate}%` : "—"} accent={accent} />
        </StaggerIn>
      )}

      {/* Seasons using this loadout — rows link to the existing Season Rewind detail page. */}
      {seasonRows.length > 0 && (
        <div>
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">
            {character || kart || transmission ? "Seasons Using This Loadout" : "Seasons Played"}
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-surface-raised">
                  <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Season</th>
                  <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Races</th>
                  <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">
                    {PLAYERS[playerId].name}&rsquo;s Points
                  </th>
                  <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Outcome</th>
                </tr>
              </thead>
              <StaggerIn as="tbody">
                {seasonRows.map((row, i) => (
                  <tr key={row.seasonNumber} data-stagger-item className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}>
                    <td className="px-3 py-2">
                      <Link href={`/season-rewind/${row.seasonNumber}`} className="font-hud font-bold text-text hover:text-gold">
                        Season {row.seasonNumber}
                      </Link>
                      {!row.isComplete && <span className="text-text-faint text-[12px] ml-1.5">&middot; in progress</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-stat text-text-dim">{row.racesWithLoadout}</td>
                    <td className="px-3 py-2 text-right text-stat font-bold text-text">{row.playerFinalPoints ?? "—"}</td>
                    <td className="px-3 py-2 text-left text-text-dim">
                      {!row.isComplete
                        ? "—"
                        : row.winner === "tie"
                          ? "Tied"
                          : row.winner === playerId
                            ? "Won"
                            : "Lost"}
                    </td>
                  </tr>
                ))}
              </StaggerIn>
            </table>
          </div>
        </div>
      )}

      {/* Circuit-by-circuit breakdown for the current filter. */}
      {circuitRows.length > 0 && (
        <div>
          <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">Circuit Breakdown</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-surface-raised">
                  <th className="px-3 py-2.5 text-left font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Circuit</th>
                  <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Races</th>
                  <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Wins</th>
                  <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Podiums</th>
                  <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Avg. Finish</th>
                  <th className="px-3 py-2.5 text-right font-hud text-xs font-bold tracking-[0.1em] text-text-faint uppercase">Avg. Pts</th>
                </tr>
              </thead>
              <StaggerIn as="tbody">
                {circuitRows.map((row, i) => (
                  <tr key={row.circuit.id} data-stagger-item className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}>
                    <td className="px-3 py-2 text-text font-medium">{row.circuit.name}</td>
                    <td className="px-3 py-2 text-right text-stat text-text-dim">{row.races}</td>
                    <td className="px-3 py-2 text-right text-stat text-text-dim">{row.wins}</td>
                    <td className="px-3 py-2 text-right text-stat text-text-dim">{row.podiums}</td>
                    <td className="px-3 py-2 text-right text-stat text-text-dim">{row.avgFinish ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-stat font-bold text-text">{row.avgPoints ?? "—"}</td>
                  </tr>
                ))}
              </StaggerIn>
            </table>
          </div>
        </div>
      )}

      {/* Insights — more visually expressive than the plain tables above, per spec. */}
      {(characterComparison.length > 0 || kartComparison.length > 0) && (
        <div className="rounded-2xl border border-border-strong bg-gradient-to-br from-surface to-surface-raised p-5 sm:p-7 space-y-8">
          <div>
            <p className="font-display text-xl tracking-wide text-text mb-1">Insights</p>
            <p className="text-xs text-text-faint">
              {PLAYERS[playerId].name}&rsquo;s loadout patterns, Season 15 onward. Circuit calls need at least {MIN_SAMPLE_SIZE} races before a
              pattern counts.
            </p>
          </div>

          {characterComparison.length > 0 && (
            <UsageTable title="Character Comparison" rows={characterComparison} accent={accent} />
          )}
          {kartComparison.length > 0 && <UsageTable title="Kart Comparison" rows={kartComparison} accent={accent} />}

          {(characterSuitability || kartSuitability) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {characterSuitability && suitabilityCharacterId && (
                <SuitabilityCard
                  title={`Circuit Suitability — ${CHARACTERS_BY_ID.get(suitabilityCharacterId)?.name ?? suitabilityCharacterId}`}
                  suitability={characterSuitability}
                  accent={accent}
                />
              )}
              {kartSuitability && suitabilityKartId && (
                <SuitabilityCard
                  title={`Circuit Suitability — ${VEHICLES_BY_ID.get(suitabilityKartId)?.name ?? suitabilityKartId}`}
                  suitability={kartSuitability}
                  accent={accent}
                />
              )}
            </div>
          )}

          {usedCombos.length > 0 && (
            <div>
              <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">Combo Insights</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {usedCombos.slice(0, 4).map((combo) => (
                  <ComboInsightCard key={`${combo.character}::${combo.kart}`} combo={combo} seasons={seasons} playerId={playerId} circuits={circuits} accent={accent} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="block font-hud text-[11px] font-bold tracking-[0.15em] text-text-faint uppercase mb-1.5">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={options.length === 0}
        className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-adi/40"
      >
        <option value="">{options.length === 0 ? "No data yet" : placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string | number; accent: "adi" | "ren" }) {
  return (
    <div data-stagger-item className="rounded-lg border border-border bg-surface p-3 text-center">
      <p className={cn("text-stat text-lg font-bold", accent === "adi" ? "text-adi" : "text-ren")}>{value}</p>
      <p className="text-[10px] text-text-faint uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function UsageTable({ title, rows, accent }: { title: string; rows: LoadoutUsageRow[]; accent: "adi" | "ren" }) {
  return (
    <div>
      <p className="font-hud text-xs font-bold tracking-[0.2em] text-text-faint uppercase mb-3">{title}</p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="bg-surface-raised">
              <th className="px-3 py-2 text-left font-hud text-[11px] font-bold tracking-[0.1em] text-text-faint uppercase"></th>
              <th className="px-3 py-2 text-right font-hud text-[11px] font-bold tracking-[0.1em] text-text-faint uppercase">Races</th>
              <th className="px-3 py-2 text-right font-hud text-[11px] font-bold tracking-[0.1em] text-text-faint uppercase">Win %</th>
              <th className="px-3 py-2 text-right font-hud text-[11px] font-bold tracking-[0.1em] text-text-faint uppercase">Podium %</th>
              <th className="px-3 py-2 text-right font-hud text-[11px] font-bold tracking-[0.1em] text-text-faint uppercase">Avg. Finish</th>
              <th className="px-3 py-2 text-right font-hud text-[11px] font-bold tracking-[0.1em] text-text-faint uppercase">Avg. Pts</th>
            </tr>
          </thead>
          <StaggerIn as="tbody">
            {rows.map((row, i) => (
              <tr key={row.id} data-stagger-item className={cn("border-t border-border", i % 2 === 1 && "bg-surface/50")}>
                <td className="px-3 py-2 text-text font-medium">{row.name}</td>
                <td className="px-3 py-2 text-right text-stat text-text-dim">{row.races}</td>
                <td className="px-3 py-2 text-right text-stat text-text-dim">{row.winRate ?? "—"}</td>
                <td className="px-3 py-2 text-right text-stat text-text-dim">{row.podiumRate ?? "—"}</td>
                <td className="px-3 py-2 text-right text-stat text-text-dim">{row.avgFinish ?? "—"}</td>
                <td className={cn("px-3 py-2 text-right text-stat font-bold", accent === "adi" ? "text-adi" : "text-ren")}>
                  {row.avgPoints ?? "—"}
                </td>
              </tr>
            ))}
          </StaggerIn>
        </table>
      </div>
    </div>
  );
}

function SuitabilityCard({
  title,
  suitability,
  accent,
}: {
  title: string;
  suitability: CircuitSuitability;
  accent: "adi" | "ren";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-hud text-[11px] font-bold tracking-[0.15em] text-text-faint uppercase mb-3">{title}</p>
      {suitability.insufficientData ? (
        <p className="text-sm text-text-faint">Not enough historical races to establish a circuit pattern yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className={cn("text-[11px] font-hud font-bold uppercase tracking-wide mb-1.5", accent === "adi" ? "text-adi" : "text-ren")}>
              Strong
            </p>
            {suitability.strong.length === 0 ? (
              <p className="text-xs text-text-faint">None yet</p>
            ) : (
              <ul className="space-y-1">
                {suitability.strong.map((e) => (
                  <li key={e.circuit.id} className="text-xs text-text">
                    {e.circuit.name} <span className="text-text-faint">({e.avgPoints} pts avg)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[11px] font-hud font-bold uppercase tracking-wide text-text-faint mb-1.5">Weak</p>
            {suitability.weak.length === 0 ? (
              <p className="text-xs text-text-faint">None yet</p>
            ) : (
              <ul className="space-y-1">
                {suitability.weak.map((e) => (
                  <li key={e.circuit.id} className="text-xs text-text">
                    {e.circuit.name} <span className="text-text-faint">({e.avgPoints} pts avg)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ComboInsightCard({
  combo,
  seasons,
  playerId,
  circuits,
  accent,
}: {
  combo: { character: string; characterName: string; kart: string; kartName: string; races: number };
  seasons: SeasonStat[];
  playerId: PlayerId;
  circuits: Circuit[];
  accent: "adi" | "ren";
}) {
  const summary = useMemo(
    () => buildKartKontrolSummary(seasons, playerId, { character: combo.character, kart: combo.kart }),
    [seasons, playerId, combo.character, combo.kart]
  );
  const suitability = useMemo(
    () => buildComboCircuitSuitability(seasons, playerId, combo.character, combo.kart, circuits),
    [seasons, playerId, combo.character, combo.kart, circuits]
  );
  const hasEnoughData = summary.races >= MIN_SAMPLE_SIZE;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-display text-base text-text mb-0.5">
        {combo.characterName} &middot; {combo.kartName}
      </p>
      <p className="text-[11px] text-text-faint mb-3">{combo.races} races together</p>
      {!hasEnoughData ? (
        <p className="text-sm text-text-faint">Not enough historical races to establish a pattern yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <ComboMiniStat label="Win %" value={summary.winRate !== null ? `${summary.winRate}%` : "—"} accent={accent} />
            <ComboMiniStat label="Podium %" value={summary.podiumRate !== null ? `${summary.podiumRate}%` : "—"} accent={accent} />
            <ComboMiniStat label="Avg. Pts" value={summary.avgPointsPerRace ?? "—"} accent={accent} />
          </div>
          {suitability.insufficientData ? (
            <p className="text-xs text-text-faint">Not enough races at any one circuit yet for a circuit pattern.</p>
          ) : (
            <p className="text-xs text-text-dim">
              {suitability.strong.length > 0 && <>Strong at {suitability.strong.map((s) => s.circuit.name).join(", ")}. </>}
              {suitability.weak.length > 0 && <>Weak at {suitability.weak.map((s) => s.circuit.name).join(", ")}.</>}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ComboMiniStat({ label, value, accent }: { label: string; value: string | number; accent: "adi" | "ren" }) {
  return (
    <div className="rounded-md bg-surface-raised p-2 text-center">
      <p className={cn("text-stat text-sm font-bold", accent === "adi" ? "text-adi" : "text-ren")}>{value}</p>
      <p className="text-[9px] text-text-faint uppercase tracking-wide">{label}</p>
    </div>
  );
}
