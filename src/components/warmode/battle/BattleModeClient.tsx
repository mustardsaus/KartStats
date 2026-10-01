"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { BattleRound, Circuit, PlayerId, PointsMapping, RawRace, RawSeason } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { ensurePendingRoundAction, getBattleStateAction, pickTrackAction } from "@/app/war-mode/battle-actions";
import { useBattleRealtime } from "@/lib/hooks/useBattleRealtime";
import { buildRaceStats, calculateSeasonTotals, determineSeasonWinner } from "@/lib/stats";
import { calculateGuestSeasonPoints } from "@/lib/stats/guest";
import { slideIn } from "@/lib/animation";
import { JoinBattleForm, type BattleIdentity } from "./JoinBattleForm";
import { WaitingRoom } from "./WaitingRoom";
import { TrackPicker } from "./TrackPicker";
import { BattleScreen } from "./BattleScreen";
import { Cockpit } from "./Cockpit";
import { LoadoutSetup } from "./LoadoutSetup";
import { EndBattleControl } from "./EndBattleControl";
import { SeasonCompletionScreen } from "../SeasonCompletionScreen";
import { PLAYERS } from "@/lib/data/points-mapping";
import { Loader2 } from "lucide-react";

/** Has this named player locked in their own loadout for this round yet? Guest never tracks one. */
function hasLoadout(round: BattleRound, playerId: PlayerId): boolean {
  return playerId === "adi"
    ? Boolean(round.adiCharacter && round.adiKart && round.adiTransmission)
    : Boolean(round.renCharacter && round.renKart && round.renTransmission);
}

function missingLoadoutNames(round: BattleRound): string {
  const missing: string[] = [];
  if (!hasLoadout(round, "adi")) missing.push(PLAYERS.adi.name);
  if (!hasLoadout(round, "ren")) missing.push(PLAYERS.ren.name);
  return missing.join(" & ") || "the other player";
}

/** Shown to whichever device is done with its own loadout while the other player is still picking theirs. */
function LoadoutWaiting({ round }: { round: BattleRound }) {
  return (
    <div className="mx-auto max-w-sm px-4 py-20 text-center">
      <Loader2 className="h-8 w-8 text-danger mx-auto mb-4 animate-spin" />
      <h1 className="font-display text-2xl tracking-wide text-text mb-2">Waiting on {missingLoadoutNames(round)}</h1>
      <p className="text-text-dim text-sm">Locking in a loadout for race {round.raceNumber}.</p>
    </div>
  );
}

const IDENTITY_KEY = "mk-rivalry-battle-identity";

function readStoredIdentity(seasonId: string): BattleIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BattleIdentity;
    return parsed.seasonId === seasonId ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredIdentity(identity: BattleIdentity) {
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // localStorage can throw (private browsing, storage full) — identity
    // just won't survive a reload; the join form will show again, which
    // is a safe, if mildly annoying, fallback.
  }
}

function clearStoredIdentity() {
  try {
    window.localStorage.removeItem(IDENTITY_KEY);
  } catch {
    // see writeStoredIdentity
  }
}

interface BattleModeClientProps {
  initialSeason: RawSeason;
  circuits: Circuit[];
  pointsMapping: PointsMapping;
  initialRaces: RawRace[];
  historicalSeasons: RawSeason[];
  historicalRacesBySeasonId: Map<string, RawRace[]>;
}

export function BattleModeClient({
  initialSeason,
  circuits,
  pointsMapping,
  initialRaces,
  historicalSeasons,
  historicalRacesBySeasonId,
}: BattleModeClientProps) {
  const router = useRouter();
  const [season, setSeason] = useState(initialSeason);
  const [races, setRaces] = useState(initialRaces);
  const [activeRound, setActiveRound] = useState<BattleRound | null>(null);
  const [identity, setIdentity] = useState<BattleIdentity | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const screenRef = useRef<HTMLDivElement>(null);

  const circuitsById = useMemo(() => new Map(circuits.map((c) => [c.id, c])), [circuits]);

  // Computed here (not inside Cockpit) so the live score is available to
  // BattleScreen regardless of which child screen — track picker or
  // cockpit — it's currently wrapping.
  const raceStats = useMemo(() => buildRaceStats(races, circuitsById, pointsMapping), [races, circuitsById, pointsMapping]);
  const { adiTotal, renTotal } = useMemo(() => calculateSeasonTotals(raceStats), [raceStats]);
  const guestTotal = useMemo(() => calculateGuestSeasonPoints(races, pointsMapping), [races, pointsMapping]);

  // Hoisted above the early returns below (plain derivations from state,
  // not hooks) so the ensure-pending-round effect further down — which
  // must itself run unconditionally, in the same position every render —
  // can read them.
  const allJoined = Boolean(season.adiJoinedAt && season.renJoinedAt && (!season.guestEnabled || season.guestJoinedAt));
  const seasonComplete = races.length >= RACES_PER_SEASON;

  // Kart Kontrol (Season 15+): one round now passes through up to four
  // screens in sequence — loadout picker, waiting-on-the-other-player,
  // track picker, then racing — rather than just "track picker or
  // cockpit", so the slide animation below needs a key that changes on
  // every one of those hand-offs, not just when a round starts/ends.
  // Computed from state alone (identity, activeRound) so it can sit above
  // the early returns further down, same as allJoined/seasonComplete.
  const phase: "opening" | "loadout" | "loadout-waiting" | "track" | "racing" = !activeRound
    ? "opening"
    : !activeRound.circuitId
      ? identity && identity.playerId !== "guest" && !hasLoadout(activeRound, identity.playerId)
        ? "loadout"
        : !(hasLoadout(activeRound, "adi") && hasLoadout(activeRound, "ren"))
          ? "loadout-waiting"
          : "track"
      : "racing";

  // Slide the content in from the side whenever the screen changes.
  // Keyed on primitives (not the activeRound object itself, which gets a
  // fresh reference on every refresh()) so this doesn't replay on every
  // background poll, only on an actual phase change.
  const screenKey = activeRound ? `${activeRound.id}:${phase}` : "none";
  useEffect(() => {
    slideIn(screenRef.current, phase === "racing" ? 28 : -28);
  }, [screenKey, phase]);

  // localStorage only exists client-side, so identity can't be resolved
  // during the initial (server) render without a hydration mismatch —
  // this one-time read-after-mount is the standard escape hatch for that,
  // not state that could instead be derived inline during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdentity(readStoredIdentity(initialSeason.id));
    setIdentityLoaded(true);
  }, [initialSeason.id]);

  // If this battle was abandoned (or completed) from elsewhere, the
  // season this client is watching disappears server-side — bounce back
  // to the landing page (via a server-data refresh) rather than showing
  // a dead join/waiting screen. useBattleRealtime below calls this once
  // as soon as its subscription goes live, which covers the initial
  // fetch too — no separate mount-time fetch needed here.
  const refresh = useCallback(async () => {
    const state = await getBattleStateAction(initialSeason.id);
    if (!state.season) {
      router.refresh();
      return;
    }
    setSeason(state.season);
    setRaces(state.races);
    setActiveRound(state.activeRound);
  }, [initialSeason.id, router]);

  useBattleRealtime(season.id, refresh);

  // Kart Kontrol (Season 15+): open the next round — with no track picked
  // yet — as soon as everyone's joined, the season isn't done, and
  // nothing's already open. Any joined device can trigger this (whichever
  // one notices first); ensurePendingRoundAction treats a second,
  // near-simultaneous call from the other device as a no-op rather than
  // an error. This is what lets both players reach their own loadout
  // picker immediately after the previous race (or right at season
  // start), before anyone touches the track picker.
  useEffect(() => {
    if (!identity || !allJoined || seasonComplete || activeRound) return;
    let cancelled = false;
    ensurePendingRoundAction(season.id).then((result) => {
      if (!cancelled && "round" in result) setActiveRound(result.round);
    });
    return () => {
      cancelled = true;
    };
  }, [identity, allJoined, seasonComplete, activeRound, season.id]);

  const handleJoined = (newIdentity: BattleIdentity) => {
    writeStoredIdentity(newIdentity);
    setIdentity(newIdentity);
    refresh();
  };

  const handleSwitchPlayer = () => {
    clearStoredIdentity();
    setIdentity(null);
  };

  // Shared success handler for every way a battle can end from this
  // device: WaitingRoom's "Cancel battle" (0 races, deletes outright),
  // and EndBattleControl from either the track-picker or the cockpit
  // (0 races -> same delete; 1+ races -> completes the season now with
  // whatever's been played). Either way there's no season left for this
  // identity to resume into, so clear it and refresh back to the landing
  // page.
  const handleBattleEnded = () => {
    clearStoredIdentity();
    router.refresh();
  };

  const handlePickTrack = (circuitId: string) => {
    startTransition(async () => {
      await pickTrackAction(season.id, circuitId);
      await refresh();
    });
  };

  if (!identityLoaded) return null; // avoid a flash of the join form before localStorage resolves

  if (!identity) {
    return <JoinBattleForm season={season} onJoined={handleJoined} />;
  }

  if (!allJoined) {
    return (
      <WaitingRoom
        season={season}
        myPlayerId={identity.playerId}
        onSwitchPlayer={handleSwitchPlayer}
        onAbandoned={handleBattleEnded}
        canAbandon={races.length === 0}
      />
    );
  }

  // Once the season's 32nd race finalizes, stop rendering the loadout
  // picker/track picker/cockpit entirely — otherwise a stale device (or a
  // realtime event landing between "round finalized" and "season marked
  // complete") could momentarily fall through and let someone start a
  // "round 33 of 32". Checking races.length directly here (rather than
  // trusting activeRound to already be null) closes that race condition.
  // "Play Again" routes through SeasonCompletionScreen's own link back to
  // /war-mode, which re-renders WarModeLanding fresh — same pattern as
  // solo mode's WarModeClient.
  if (seasonComplete) {
    return (
      <SeasonCompletionScreen
        seasonNumber={season.seasonNumber}
        winner={determineSeasonWinner(adiTotal, renTotal)}
        adiPoints={adiTotal}
        renPoints={renTotal}
      />
    );
  }

  const isAdmin = season.adminPlayerId === identity.playerId;
  const adminName = season.adminPlayerId ? PLAYERS[season.adminPlayerId].name : "the admin";

  // Kart Kontrol (Season 15+): a round now opens with no track picked yet
  // (see the ensure-pending-round effect above and the `phase` derivation
  // next to it), so there are up to four screens per round instead of two
  // — loadout picker, waiting-on-the-other-player, track picker, then the
  // normal cockpit — chosen by `phase`, which is already computed from
  // the exact same state this switch needs.
  let content: ReactNode;
  if (phase === "opening") {
    content = (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 text-danger animate-spin" />
      </div>
    );
  } else if (phase === "loadout" && identity.playerId !== "guest") {
    content = (
      <div className="space-y-6">
        <LoadoutSetup
          seasonId={season.id}
          roundId={activeRound!.id}
          myPlayerId={identity.playerId}
          races={races}
          onDone={refresh}
        />
        <div className="text-center pt-2">
          <EndBattleControl seasonId={season.id} raceCount={races.length} isAdmin={isAdmin} onEnded={handleBattleEnded} />
        </div>
      </div>
    );
  } else if (phase === "loadout-waiting" || phase === "loadout") {
    // The "|| phase === 'loadout'" case is unreachable in practice (only a
    // named player with their own loadout still unset reaches "loadout" —
    // see the derivation above) but keeps this switch exhaustive for the
    // guest seat, which never has a loadout of its own to set.
    content = (
      <div className="space-y-6">
        <LoadoutWaiting round={activeRound!} />
        <div className="text-center pt-2">
          <EndBattleControl seasonId={season.id} raceCount={races.length} isAdmin={isAdmin} onEnded={handleBattleEnded} />
        </div>
      </div>
    );
  } else if (phase === "track") {
    content = (
      <TrackPicker
        seasonId={season.id}
        raceCount={races.length}
        circuits={circuits}
        raceNumber={activeRound!.raceNumber}
        isAdmin={isAdmin}
        adminName={adminName}
        onSelect={handlePickTrack}
        onEnded={handleBattleEnded}
        pending={pending}
      />
    );
  } else {
    const round = activeRound!;
    content = (
      <Cockpit
        key={round.id}
        season={season}
        round={round}
        circuit={circuitsById.get(round.circuitId!)}
        myPlayerId={identity.playerId}
        races={races}
        historicalSeasons={historicalSeasons}
        historicalRacesBySeasonId={historicalRacesBySeasonId}
        circuits={circuits}
        pointsMapping={pointsMapping}
        isAdmin={isAdmin}
        onChanged={refresh}
        onEnded={handleBattleEnded}
      />
    );
  }

  // A single BattleScreen call site for every inner screen (not a
  // separate return per case) — React reconciles it as the same instance
  // across the switch, so the backdrop and leaderboard stay mounted
  // instead of flashing/resetting. The inner ref'd div is what the
  // anime.js slide (above) animates on each screen change.
  return (
    <BattleScreen
      circuit={activeRound?.circuitId ? circuitsById.get(activeRound.circuitId) : undefined}
      adiPoints={adiTotal}
      renPoints={renTotal}
      guestEnabled={Boolean(season.guestEnabled)}
      guestPoints={guestTotal}
    >
      <div ref={screenRef}>{content}</div>
    </BattleScreen>
  );
}
