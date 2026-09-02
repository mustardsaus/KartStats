import type { PlayerId } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import type { RaceStat, StatsModel } from "./index";

/** Race enriched with which season it belongs to — the unit facts are built from. */
type FlatRace = RaceStat & { seasonNumber: number };

function name(playerId: PlayerId): string {
  return PLAYERS[playerId].name;
}

function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return n === 1 ? word : pluralWord;
}

function pointDiff(race: RaceStat): number {
  return Math.abs(race.adiPoints - race.renPoints);
}

function raceWinner(race: RaceStat): PlayerId | null {
  if (race.adiPoints === race.renPoints) return null;
  return race.adiPoints > race.renPoints ? "adi" : "ren";
}

/**
 * "Interesting" here means: surfaces something that took real digging to
 * notice — a margin, a streak, a sweep — rather than restating a number
 * that's already on a trophy card. Every fact is computed from the live
 * model, so it stays true as new seasons get recorded; nothing here is
 * hand-written copy. Facts with insufficient data (e.g. no perfect sweep
 * yet) are simply omitted rather than padded out.
 */
export function computeStatFacts(model: StatsModel): string[] {
  const completedSeasons = model.seasons.filter((s) => s.isComplete);
  const allRaces: FlatRace[] = model.seasons.flatMap((s) =>
    s.races.map((r) => ({ ...r, seasonNumber: s.season.seasonNumber }))
  );

  const facts: string[] = [];

  if (allRaces.length === 0) {
    return facts;
  }

  // --- Closest decided race ---
  const decidedRaces = allRaces.filter((r) => pointDiff(r) > 0);
  if (decidedRaces.length > 0) {
    const closest = decidedRaces.reduce((a, b) => (pointDiff(a) <= pointDiff(b) ? a : b));
    const diff = pointDiff(closest);
    facts.push(
      `The tightest race on record: Season ${closest.seasonNumber}, Race ${closest.raceNumber} at ${closest.circuit.name} — decided by just ${diff} ${plural(diff, "point")}.`
    );
  }

  // --- Biggest single-race blowout ---
  if (decidedRaces.length > 0) {
    const biggest = decidedRaces.reduce((a, b) => (pointDiff(a) >= pointDiff(b) ? a : b));
    const winner = raceWinner(biggest);
    if (winner) {
      const diff = pointDiff(biggest);
      facts.push(
        `Biggest blowout of a single race: ${name(winner)} put ${diff} ${plural(diff, "point")} on ${name(winner === "adi" ? "ren" : "adi")} at ${biggest.circuit.name}, Season ${biggest.seasonNumber}.`
      );
    }
  }

  // --- Closest completed season ---
  const decidedSeasons = completedSeasons.filter((s) => s.winner !== "tie");
  if (decidedSeasons.length > 0) {
    const closestSeason = decidedSeasons.reduce((a, b) => (a.winningMargin <= b.winningMargin ? a : b));
    facts.push(
      closestSeason.winningMargin === 0
        ? `Season ${closestSeason.season.seasonNumber} ended in a dead-even tie.`
        : `Season ${closestSeason.season.seasonNumber} was razor-thin — decided by only ${closestSeason.winningMargin} ${plural(closestSeason.winningMargin, "point")}.`
    );
  }

  // --- Most lopsided completed season ---
  if (decidedSeasons.length > 0) {
    const blowoutSeason = decidedSeasons.reduce((a, b) => (a.winningMargin >= b.winningMargin ? a : b));
    if (blowoutSeason.winningMargin > 0 && blowoutSeason.winner) {
      facts.push(
        `Season ${blowoutSeason.season.seasonNumber} was the most lopsided yet: ${name(blowoutSeason.winner as PlayerId)} won by ${blowoutSeason.winningMargin} points.`
      );
    }
  }

  // --- Longest race-outcome streak, all-time ---
  {
    let bestPlayer: PlayerId | null = null;
    let bestLength = 0;
    let bestEndRace: FlatRace | null = null;
    let curPlayer: PlayerId | null = null;
    let curLength = 0;
    let curStart: FlatRace | null = null;
    for (const race of allRaces) {
      const w = raceWinner(race);
      if (w && w === curPlayer) {
        curLength += 1;
      } else if (w) {
        curPlayer = w;
        curLength = 1;
        curStart = race;
      } else {
        curPlayer = null;
        curLength = 0;
        curStart = null;
      }
      if (curLength > bestLength) {
        bestLength = curLength;
        bestPlayer = curPlayer;
        bestEndRace = race;
        void curStart;
      }
    }
    if (bestPlayer && bestLength >= 3 && bestEndRace) {
      facts.push(
        `${name(bestPlayer)}'s longest heater: ${bestLength} straight races winning the points, through Season ${bestEndRace.seasonNumber}.`
      );
    }
  }

  // --- Current streak (still standing, most recent races) ---
  {
    let curPlayer: PlayerId | null = null;
    let curLength = 0;
    for (const race of allRaces) {
      const w = raceWinner(race);
      if (w && w === curPlayer) curLength += 1;
      else if (w) {
        curPlayer = w;
        curLength = 1;
      } else {
        curPlayer = null;
        curLength = 0;
      }
    }
    if (curPlayer && curLength >= 3) {
      facts.push(`${name(curPlayer)} is riding a ${curLength}-race streak heading into the next one.`);
    }
  }

  // Circuit-based facts share this set so the same track doesn't get
  // featured twice in a row while cycling — each one below registers the
  // circuit id it used before moving to the next section.
  const usedCircuitIds = new Set<string>();

  // --- Perfect sweep at a circuit ---
  {
    const sweeps = model.circuits.filter(
      (c) => c.appearances >= 2 && (c.adiSwingProbability === 100 || c.renSwingProbability === 100)
    );
    if (sweeps.length > 0) {
      const best = sweeps.reduce((a, b) => (a.appearances >= b.appearances ? a : b));
      const dominant: PlayerId = best.adiSwingProbability === 100 ? "adi" : "ren";
      usedCircuitIds.add(best.circuit.id);
      facts.push(
        `${name(dominant)} has never lost at ${best.circuit.name} — a perfect sweep across ${best.appearances} ${plural(best.appearances, "race")}.`
      );
    }
  }

  // --- Most one-sided circuit short of a full sweep ---
  {
    const contested = model.circuits.filter((c) => c.appearances >= 3 && !usedCircuitIds.has(c.circuit.id));
    const withSwing = contested
      .map((c) => {
        const adiSwing = c.adiSwingProbability ?? 0;
        const renSwing = c.renSwingProbability ?? 0;
        const dominant: PlayerId = adiSwing >= renSwing ? "adi" : "ren";
        const swing = Math.max(adiSwing, renSwing);
        return { circuit: c, dominant, swing };
      })
      .filter((c) => c.swing < 100 && c.swing >= 65);
    if (withSwing.length > 0) {
      const top = withSwing.reduce((a, b) => (a.swing >= b.swing ? a : b));
      usedCircuitIds.add(top.circuit.circuit.id);
      facts.push(
        `${top.circuit.circuit.name} is ${name(top.dominant)}'s house — they've finished ahead ${top.swing.toFixed(0)}% of the time there.`
      );
    }
  }

  // --- Never won a single race at a circuit (distinct from a points sweep —
  // this is about literal 1st-place finishes, so it can catch a circuit
  // where a player scrapes points but has simply never topped the podium) ---
  {
    const droughts = model.circuits
      .filter((c) => c.appearances >= 3 && !usedCircuitIds.has(c.circuit.id))
      .flatMap((c) => {
        const out: { circuit: (typeof c)["circuit"]; player: PlayerId; appearances: number }[] = [];
        if (c.adiFirstPlaceFinishes === 0) out.push({ circuit: c.circuit, player: "adi", appearances: c.appearances });
        if (c.renFirstPlaceFinishes === 0) out.push({ circuit: c.circuit, player: "ren", appearances: c.appearances });
        return out;
      });
    if (droughts.length > 0) {
      const worst = droughts.reduce((a, b) => (a.appearances >= b.appearances ? a : b));
      usedCircuitIds.add(worst.circuit.id);
      facts.push(
        `${name(worst.player)} has never won a single race at ${worst.circuit.name} — ${worst.appearances} tries, zero 1st-place finishes.`
      );
    }
  }

  // --- Highest combined scoring circuit ---
  {
    const scored = model.circuits
      .filter((c) => c.appearances >= 3 && !usedCircuitIds.has(c.circuit.id))
      .map((c) => ({ circuit: c.circuit, avg: (c.adiTotalPoints + c.renTotalPoints) / c.appearances }));
    if (scored.length > 0) {
      const top = scored.reduce((a, b) => (a.avg >= b.avg ? a : b));
      usedCircuitIds.add(top.circuit.id);
      facts.push(
        `${top.circuit.name} runs hottest: a combined ${top.avg.toFixed(1)} points between them per race, more than anywhere else.`
      );
    }
  }

  // --- Most evenly contested circuit ---
  {
    const evenness = model.circuits
      .filter((c) => c.appearances >= 4 && !usedCircuitIds.has(c.circuit.id) && c.adiSwingProbability !== null)
      .map((c) => ({ circuit: c.circuit, distanceFrom50: Math.abs((c.adiSwingProbability as number) - 50) }));
    if (evenness.length > 0) {
      const closest = evenness.reduce((a, b) => (a.distanceFrom50 <= b.distanceFrom50 ? a : b));
      if (closest.distanceFrom50 <= 8) {
        usedCircuitIds.add(closest.circuit.id);
        facts.push(`${closest.circuit.name} is the most evenly fought track in the rivalry — practically a 50/50 split.`);
      }
    }
  }

  // --- Most-raced circuit ---
  {
    const mostRaced = model.circuits.reduce((a, b) => (a.appearances >= b.appearances ? a : b));
    if (mostRaced.appearances >= 4) {
      facts.push(`${mostRaced.circuit.name} has been raced more than any other track — ${mostRaced.appearances} times and counting.`);
    }
  }

  // --- Comeback season: eventual winner didn't lead the whole way ---
  {
    const comebacks = decidedSeasons
      .map((s) => {
        const winner = s.winner as PlayerId;
        const opponent: PlayerId = winner === "adi" ? "ren" : "adi";
        let lastOpponentLeadRace: number | null = null;
        for (const r of s.races) {
          if (r.leader === opponent) lastOpponentLeadRace = r.raceNumber;
        }
        return lastOpponentLeadRace ? { season: s, winner, opponent, lastOpponentLeadRace } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (comebacks.length > 0) {
      const best = comebacks.reduce((a, b) => (a.lastOpponentLeadRace >= b.lastOpponentLeadRace ? a : b));
      facts.push(
        `Season ${best.season.season.seasonNumber} was a real comeback: ${name(best.opponent)} was still leading after Race ${best.lastOpponentLeadRace}, but ${name(best.winner)} took the title anyway.`
      );
    }
  }

  // --- Consistency: lower spread of finishing positions ---
  if (allRaces.length >= 10) {
    const stdev = (values: number[]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
      return Math.sqrt(variance);
    };
    const adiStdev = stdev(allRaces.map((r) => r.adiFinishingPosition));
    const renStdev = stdev(allRaces.map((r) => r.renFinishingPosition));
    const steadier: PlayerId = adiStdev <= renStdev ? "adi" : "ren";
    const steadierStdev = steadier === "adi" ? adiStdev : renStdev;
    facts.push(
      `${name(steadier)} is the steadier hand — a finishing-position spread of just ±${steadierStdev.toFixed(1)} across ${allRaces.length} races.`
    );
  }

  // --- Combined totals ---
  {
    const totalPoints = model.players.adi.careerPoints + model.players.ren.careerPoints;
    facts.push(
      `Across ${completedSeasons.length} completed ${plural(completedSeasons.length, "season")}, Adi and Ren have raced ${allRaces.length} times for a combined ${totalPoints.toLocaleString()} points.`
    );
  }

  // --- Championship lead ---
  {
    const a = model.players.adi.championships;
    const b = model.players.ren.championships;
    if (a !== b && a + b > 0) {
      const leader: PlayerId = a > b ? "adi" : "ren";
      const trailer: PlayerId = leader === "adi" ? "ren" : "adi";
      const leaderCount = leader === "adi" ? a : b;
      const trailerCount = leader === "adi" ? b : a;
      facts.push(`${name(leader)} leads the championship count ${leaderCount}-${trailerCount} over ${name(trailer)}.`);
    } else if (a + b > 0) {
      facts.push(`Adi and Ren are dead level on championships, ${a}-${b}.`);
    }
  }

  // --- Race win lead ---
  {
    const a = model.players.adi.raceWins;
    const b = model.players.ren.raceWins;
    if (a !== b && a + b > 0) {
      const leader: PlayerId = a > b ? "adi" : "ren";
      const diff = Math.abs(a - b);
      facts.push(`${name(leader)} has ${diff} more race ${plural(diff, "win")} than ${name(leader === "adi" ? "ren" : "adi")} — ${a} to ${b} overall.`);
    }
  }

  // --- Last-place frequency ---
  {
    const lastPlaceCounts: Record<PlayerId, number> = { adi: 0, ren: 0 };
    for (const r of allRaces) {
      if (r.adiFinishingPosition === 12) lastPlaceCounts.adi += 1;
      if (r.renFinishingPosition === 12) lastPlaceCounts.ren += 1;
    }
    const worse: PlayerId = lastPlaceCounts.adi >= lastPlaceCounts.ren ? "adi" : "ren";
    const count = lastPlaceCounts[worse];
    if (count > 0) {
      facts.push(`${name(worse)} has finished dead last ${count} ${plural(count, "time")}.`);
    }
  }

  // --- Podium rate ---
  {
    const adiPodiumPct = allRaces.length
      ? (allRaces.filter((r) => r.adiFinishingPosition <= 3).length / allRaces.length) * 100
      : 0;
    const renPodiumPct = allRaces.length
      ? (allRaces.filter((r) => r.renFinishingPosition <= 3).length / allRaces.length) * 100
      : 0;
    if (allRaces.length >= 5) {
      const leader: PlayerId = adiPodiumPct >= renPodiumPct ? "adi" : "ren";
      const pct = leader === "adi" ? adiPodiumPct : renPodiumPct;
      facts.push(`${name(leader)} lands on the podium in ${pct.toFixed(0)}% of all races raced.`);
    }
  }

  // --- Average margin per race ---
  if (allRaces.length >= 5) {
    const avgMargin = allRaces.reduce((sum, r) => sum + pointDiff(r), 0) / allRaces.length;
    facts.push(`On average, a race in this rivalry is decided by ${avgMargin.toFixed(1)} points.`);
  }

  return facts;
}
