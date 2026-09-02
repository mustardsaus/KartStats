import type { BattleRound, Circuit, DriverId, ItemId, PlayerId, PointsMapping, RawRace, RawSeason, RaceInput, RacePowerup, RoundPowerup } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { generateBattleCode } from "@/lib/data/battle-code";
import { getSupabaseServerClient } from "@/lib/supabase/client";
import type { DataStore, ImportBatchResult } from "./types";

// --- row <-> domain-type mapping -------------------------------------------

interface CircuitRow {
  id: string;
  name: string;
  image_url: string;
  cup: string | null;
  category: "Nitro" | "Retro" | null;
}
function rowToCircuit(r: CircuitRow): Circuit {
  return { id: r.id, name: r.name, imageUrl: r.image_url, cup: r.cup ?? undefined, category: r.category ?? undefined };
}

interface SeasonRow {
  id: string;
  season_number: number;
  start_date: string;
  completion_date: string | null;
  is_complete: boolean;
  winner_id: PlayerId | "tie" | null;
  adi_final_points: number | null;
  ren_final_points: number | null;
  created_at: string;
  battle_code?: string | null;
  admin_player_id?: PlayerId | null;
  adi_joined_at?: string | null;
  ren_joined_at?: string | null;
  guest_enabled?: boolean | null;
  guest_joined_at?: string | null;
}
function rowToSeason(r: SeasonRow): RawSeason {
  return {
    id: r.id,
    seasonNumber: r.season_number,
    startDate: r.start_date,
    completionDate: r.completion_date,
    isComplete: r.is_complete,
    winnerId: r.winner_id,
    adiFinalPoints: r.adi_final_points,
    renFinalPoints: r.ren_final_points,
    createdAt: r.created_at,
    battleCode: r.battle_code ?? null,
    adminPlayerId: r.admin_player_id ?? null,
    adiJoinedAt: r.adi_joined_at ?? null,
    renJoinedAt: r.ren_joined_at ?? null,
    guestEnabled: r.guest_enabled ?? false,
    guestJoinedAt: r.guest_joined_at ?? null,
  };
}

interface RaceRow {
  id: string;
  season_id: string;
  race_number: number;
  circuit_id: string;
  adi_finishing_position: number;
  ren_finishing_position: number;
  created_at: string;
  adi_blue_shell_count?: number | null;
  ren_blue_shell_count?: number | null;
  guest_finishing_position?: number | null;
  guest_blue_shell_count?: number | null;
}
function rowToRace(r: RaceRow): RawRace {
  return {
    id: r.id,
    seasonId: r.season_id,
    raceNumber: r.race_number,
    circuitId: r.circuit_id,
    adiFinishingPosition: r.adi_finishing_position,
    renFinishingPosition: r.ren_finishing_position,
    createdAt: r.created_at,
    adiBlueShellCount: r.adi_blue_shell_count ?? null,
    renBlueShellCount: r.ren_blue_shell_count ?? null,
    guestFinishingPosition: r.guest_finishing_position ?? null,
    guestBlueShellCount: r.guest_blue_shell_count ?? null,
  };
}

interface BattleRoundRow {
  id: string;
  season_id: string;
  race_number: number;
  circuit_id: string;
  adi_position: number | null;
  ren_position: number | null;
  adi_blue_shell_count: number;
  ren_blue_shell_count: number;
  finalized_at: string | null;
  finalized_race_id: string | null;
  created_at: string;
  guest_enabled: boolean | null;
  guest_position: number | null;
  guest_blue_shell_count: number | null;
}
function rowToBattleRound(r: BattleRoundRow): BattleRound {
  return {
    id: r.id,
    seasonId: r.season_id,
    raceNumber: r.race_number,
    circuitId: r.circuit_id,
    adiPosition: r.adi_position,
    renPosition: r.ren_position,
    adiBlueShellCount: r.adi_blue_shell_count,
    renBlueShellCount: r.ren_blue_shell_count,
    finalizedAt: r.finalized_at,
    finalizedRaceId: r.finalized_race_id,
    createdAt: r.created_at,
    guestEnabled: Boolean(r.guest_enabled),
    guestPosition: r.guest_position,
    guestBlueShellCount: r.guest_blue_shell_count ?? 0,
  };
}

interface RoundPowerupRow {
  battle_round_id: string;
  player_id: DriverId;
  item_id: ItemId;
  count: number;
}
function rowToRoundPowerup(r: RoundPowerupRow): RoundPowerup {
  return { battleRoundId: r.battle_round_id, playerId: r.player_id, itemId: r.item_id, count: r.count };
}

interface RacePowerupRow {
  race_id: string;
  player_id: DriverId;
  item_id: ItemId;
  count: number;
}
function rowToRacePowerup(r: RacePowerupRow): RacePowerup {
  return { raceId: r.race_id, playerId: r.player_id, itemId: r.item_id, count: r.count };
}

export const supabaseStore: DataStore = {
  async getPlayers() {
    return PLAYERS;
  },

  async getCircuits() {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("circuits").select("*").order("name");
    if (error) throw error;
    return (data as CircuitRow[]).map(rowToCircuit);
  },

  async addCircuits(circuits: Circuit[]) {
    if (circuits.length === 0) return;
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("circuits").upsert(
      circuits.map((c) => ({
        id: c.id,
        name: c.name,
        image_url: c.imageUrl,
        cup: c.cup ?? null,
        category: c.category ?? null,
      })),
      { onConflict: "id" }
    );
    if (error) throw error;
  },

  async getPointsMapping() {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("points_mapping")
      .select("*")
      .order("finishing_position");
    if (error) throw error;
    return (data as { finishing_position: number; points: number }[]).map((r) => ({
      finishingPosition: r.finishing_position,
      points: r.points,
    })) as PointsMapping;
  },

  async setPointsMapping(mapping: PointsMapping) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("points_mapping")
      .upsert(mapping.map((m) => ({ finishing_position: m.finishingPosition, points: m.points })), {
        onConflict: "finishing_position",
      });
    if (error) throw error;
  },

  async getSeasons() {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("seasons").select("*").order("season_number");
    if (error) throw error;
    return (data as SeasonRow[]).map(rowToSeason);
  },

  async getRacesBySeasonId() {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("races").select("*").order("race_number");
    if (error) throw error;
    const map = new Map<string, RawRace[]>();
    for (const row of data as RaceRow[]) {
      const race = rowToRace(row);
      const list = map.get(race.seasonId) ?? [];
      list.push(race);
      map.set(race.seasonId, list);
    }
    return map;
  },

  async startSeason() {
    const supabase = getSupabaseServerClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("seasons")
      .select("season_number")
      .order("season_number", { ascending: false })
      .limit(1);
    if (fetchErr) throw fetchErr;
    const nextNumber = ((existing?.[0]?.season_number as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from("seasons")
      .insert({ season_number: nextNumber, is_complete: false })
      .select()
      .single();
    if (error) throw error;
    return rowToSeason(data as SeasonRow);
  },

  async addRace(seasonId: string, input: RaceInput) {
    const supabase = getSupabaseServerClient();
    const { count, error: countErr } = await supabase
      .from("races")
      .select("id", { count: "exact", head: true })
      .eq("season_id", seasonId);
    if (countErr) throw countErr;
    const raceNumber = (count ?? 0) + 1;
    if (raceNumber > RACES_PER_SEASON) {
      throw new Error(`Season already has ${RACES_PER_SEASON} races recorded.`);
    }

    const { data, error } = await supabase
      .from("races")
      .insert({
        season_id: seasonId,
        race_number: raceNumber,
        circuit_id: input.circuitId,
        adi_finishing_position: input.adiFinishingPosition,
        ren_finishing_position: input.renFinishingPosition,
        guest_finishing_position: input.guestFinishingPosition ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToRace(data as RaceRow);
  },

  async completeSeason(seasonId, cached) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("seasons")
      .update({
        is_complete: true,
        completion_date: new Date().toISOString(),
        winner_id: cached.winnerId,
        adi_final_points: cached.adiFinalPoints,
        ren_final_points: cached.renFinalPoints,
      })
      .eq("id", seasonId)
      .select()
      .single();
    if (error) throw error;
    return rowToSeason(data as SeasonRow);
  },

  async importSeasons(seasons, racesBySeasonId, contentHash, sourceFileName): Promise<ImportBatchResult> {
    const supabase = getSupabaseServerClient();

    const { data: existingBatch } = await supabase
      .from("import_batches")
      .select("id")
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (existingBatch) {
      return {
        imported: false,
        reason: `This file has already been imported (matched by content hash). Source: ${sourceFileName}`,
        seasonNumbers: [],
        raceCount: 0,
      };
    }

    const { data: existingSeasons, error: existingErr } = await supabase
      .from("seasons")
      .select("season_number");
    if (existingErr) throw existingErr;
    const existingNumbers = new Set((existingSeasons ?? []).map((s: { season_number: number }) => s.season_number));
    const conflicting = seasons.filter((s) => existingNumbers.has(s.seasonNumber));
    if (conflicting.length > 0) {
      return {
        imported: false,
        reason: `Season number(s) ${conflicting
          .map((s) => s.seasonNumber)
          .join(", ")} already exist — remap or clear existing data before re-importing.`,
        seasonNumbers: [],
        raceCount: 0,
      };
    }

    // Seasons first (races reference season UUIDs generated by Postgres).
    const seasonIdMap = new Map<string, string>(); // import-time id -> real db uuid
    for (const season of seasons) {
      const { data, error } = await supabase
        .from("seasons")
        .insert({
          season_number: season.seasonNumber,
          start_date: season.startDate,
          completion_date: season.completionDate,
          is_complete: season.isComplete,
          winner_id: season.winnerId,
          adi_final_points: season.adiFinalPoints,
          ren_final_points: season.renFinalPoints,
        })
        .select("id")
        .single();
      if (error) throw error;
      seasonIdMap.set(season.id, (data as { id: string }).id);
    }

    let raceCount = 0;
    for (const [importSeasonId, races] of racesBySeasonId.entries()) {
      const dbSeasonId = seasonIdMap.get(importSeasonId);
      if (!dbSeasonId) continue;
      const { error } = await supabase.from("races").insert(
        races.map((r) => ({
          season_id: dbSeasonId,
          race_number: r.raceNumber,
          circuit_id: r.circuitId,
          adi_finishing_position: r.adiFinishingPosition,
          ren_finishing_position: r.renFinishingPosition,
        }))
      );
      if (error) throw error;
      raceCount += races.length;
    }

    await supabase.from("import_batches").insert({
      content_hash: contentHash,
      source_file_name: sourceFileName,
      season_numbers: seasons.map((s) => s.seasonNumber),
      race_count: raceCount,
    });

    return { imported: true, seasonNumbers: seasons.map((s) => s.seasonNumber), raceCount };
  },

  // --- Battle Mode ----------------------------------------------------

  async startBattleSeason(guestEnabled: boolean) {
    const supabase = getSupabaseServerClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("seasons")
      .select("season_number")
      .order("season_number", { ascending: false })
      .limit(1);
    if (fetchErr) throw fetchErr;
    const nextNumber = ((existing?.[0]?.season_number as number | undefined) ?? 0) + 1;

    // Battle codes are unique; retry a handful of times on a random collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateBattleCode();
      const { data, error } = await supabase
        .from("seasons")
        .insert({ season_number: nextNumber, is_complete: false, battle_code: code, guest_enabled: guestEnabled })
        .select()
        .single();
      if (!error) return rowToSeason(data as SeasonRow);
      if (error.code !== "23505") throw error; // not a uniqueness collision — a real error
    }
    throw new Error("Could not generate a unique battle code after several attempts — try again.");
  },

  async getSeasonByBattleCode(code: string) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("seasons").select("*").eq("battle_code", code).maybeSingle();
    if (error) throw error;
    return data ? rowToSeason(data as SeasonRow) : null;
  },

  async joinBattleSeason(seasonId: string, playerId: DriverId) {
    const supabase = getSupabaseServerClient();
    const column = playerId === "adi" ? "adi_joined_at" : playerId === "ren" ? "ren_joined_at" : "guest_joined_at";
    const { data, error } = await supabase
      .from("seasons")
      .update({ [column]: new Date().toISOString() })
      .eq("id", seasonId)
      .is(column, null)
      .select()
      .single();
    if (!error) return rowToSeason(data as SeasonRow);
    // Already joined (0 rows matched `is(column, null)`) — idempotent, just return the current row.
    const { data: current, error: fetchErr } = await supabase.from("seasons").select("*").eq("id", seasonId).single();
    if (fetchErr) throw fetchErr;
    return rowToSeason(current as SeasonRow);
  },

  async claimAdmin(seasonId: string, playerId: PlayerId) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("seasons")
      .update({ admin_player_id: playerId })
      .eq("id", seasonId)
      .is("admin_player_id", null)
      .select()
      .single();
    if (!error) return rowToSeason(data as SeasonRow);
    // Already claimed (by this or the other player) — return the current row as-is.
    const { data: current, error: fetchErr } = await supabase.from("seasons").select("*").eq("id", seasonId).single();
    if (fetchErr) throw fetchErr;
    return rowToSeason(current as SeasonRow);
  },

  async getActiveRound(seasonId: string) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("battle_rounds")
      .select("*")
      .eq("season_id", seasonId)
      .is("finalized_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToBattleRound(data as BattleRoundRow) : null;
  },

  async startRound(seasonId: string, circuitId: string) {
    const supabase = getSupabaseServerClient();
    const [{ count, error: countErr }, { data: seasonRow, error: seasonErr }] = await Promise.all([
      supabase.from("races").select("id", { count: "exact", head: true }).eq("season_id", seasonId),
      supabase.from("seasons").select("guest_enabled").eq("id", seasonId).single(),
    ]);
    if (countErr) throw countErr;
    if (seasonErr) throw seasonErr;
    const raceNumber = (count ?? 0) + 1;
    if (raceNumber > RACES_PER_SEASON) {
      throw new Error(`Season already has ${RACES_PER_SEASON} races recorded.`);
    }
    const guestEnabled = Boolean((seasonRow as { guest_enabled: boolean | null } | null)?.guest_enabled);

    const { data, error } = await supabase
      .from("battle_rounds")
      .insert({ season_id: seasonId, race_number: raceNumber, circuit_id: circuitId, guest_enabled: guestEnabled })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("A round is already in progress for this season.");
      }
      throw error;
    }
    return rowToBattleRound(data as BattleRoundRow);
  },

  async recordRoundPosition(roundId: string, playerId: DriverId, position: number) {
    const supabase = getSupabaseServerClient();
    const column = playerId === "adi" ? "adi_position" : playerId === "ren" ? "ren_position" : "guest_position";
    const { data, error } = await supabase
      .from("battle_rounds")
      .update({ [column]: position })
      .eq("id", roundId)
      .is("finalized_at", null)
      .select()
      .single();
    if (!error) return rowToBattleRound(data as BattleRoundRow);
    // Round already finalized (or doesn't exist) — return its current state rather than throwing,
    // so a slow/duplicate submit from a second device is a harmless no-op.
    const { data: current, error: fetchErr } = await supabase.from("battle_rounds").select("*").eq("id", roundId).single();
    if (fetchErr) throw fetchErr;
    return rowToBattleRound(current as BattleRoundRow);
  },

  async incrementBlueShellCount(roundId: string, playerId: DriverId) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("increment_blue_shell", { p_round_id: roundId, p_player: playerId });
    if (error) throw error;
    return rowToBattleRound(data as BattleRoundRow);
  },

  async decrementBlueShellCount(roundId: string, playerId: DriverId) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("decrement_blue_shell", { p_round_id: roundId, p_player: playerId });
    if (error) throw error;
    return rowToBattleRound(data as BattleRoundRow);
  },

  async setRoundPowerupCount(roundId: string, playerId: DriverId, itemId: ItemId, count: number) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("battle_round_powerups")
      .upsert(
        { battle_round_id: roundId, player_id: playerId, item_id: itemId, count },
        { onConflict: "battle_round_id,player_id,item_id" }
      );
    if (error) throw error;
  },

  async getRoundPowerups(roundId: string) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("battle_round_powerups").select("*").eq("battle_round_id", roundId);
    if (error) throw error;
    return (data as RoundPowerupRow[]).map(rowToRoundPowerup);
  },

  async claimFinalizeRound(roundId: string) {
    const supabase = getSupabaseServerClient();
    // Guest position is only required when the round itself is flagged
    // guest_enabled — for a 2-driver round guest_position stays null the
    // whole time, so it can't be included in this single query's `.not`
    // filters (that would wrongly block every 2-driver round from ever
    // finalizing). Fetch the round first to decide, then do the same
    // atomic conditional UPDATE...WHERE...RETURNING claim as before.
    const { data: current, error: fetchErr } = await supabase
      .from("battle_rounds")
      .select("*")
      .eq("id", roundId)
      .single();
    if (fetchErr) throw fetchErr;
    const round = current as BattleRoundRow;
    if (round.finalized_at) return null;
    if (round.adi_position === null || round.ren_position === null) return null;
    if (round.guest_enabled && round.guest_position === null) return null;

    const { data, error } = await supabase
      .from("battle_rounds")
      .update({ finalized_at: new Date().toISOString() })
      .eq("id", roundId)
      .is("finalized_at", null)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? rowToBattleRound(data as BattleRoundRow) : null;
  },

  async unclaimFinalizeRound(roundId: string) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("battle_rounds").update({ finalized_at: null }).eq("id", roundId);
    if (error) throw error;
  },

  async completeFinalizeRound(roundId: string, raceId: string) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("battle_rounds").update({ finalized_race_id: raceId }).eq("id", roundId);
    if (error) throw error;
  },

  async setRaceBlueShellCounts(raceId: string, adiCount: number, renCount: number, guestCount?: number | null) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("races")
      .update({ adi_blue_shell_count: adiCount, ren_blue_shell_count: renCount, guest_blue_shell_count: guestCount ?? null })
      .eq("id", raceId);
    if (error) throw error;
  },

  async copyRoundPowerupsToRace(roundId: string, raceId: string) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("battle_round_powerups").select("*").eq("battle_round_id", roundId);
    if (error) throw error;
    const rows = data as RoundPowerupRow[];
    if (rows.length === 0) return;
    const { error: insertErr } = await supabase.from("race_powerups").insert(
      rows.map((r) => ({ race_id: raceId, player_id: r.player_id, item_id: r.item_id, count: r.count }))
    );
    if (insertErr) throw insertErr;
  },

  async getRacePowerups() {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("race_powerups").select("*");
    if (error) throw error;
    return (data as RacePowerupRow[]).map(rowToRacePowerup);
  },

  async deleteEmptySeason(seasonId: string) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("seasons").delete().eq("id", seasonId);
    if (error) throw error;
  },
};
