"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BattleRound, Circuit, PointsMapping, RawRace, RawSeason, RoundPowerup } from "@/lib/types";
import { RACES_PER_SEASON } from "@/lib/types";
import { getBattleStateAction, pickTrackAction } from "@/app/war-mode/battle-actions";
import { useBattleRealtime } from "@/lib/hooks/useBattleRealtime";
import { buildRaceStats, calculateSeasonTotals, determineSeasonWinner } from "@/lib/stats";
import { calculateGuestSeasonPoints } from "@/lib/stats/guest";
import { slideIn } from "@/lib/animation";
import { JoinBattleForm, type BattleIdentity } from "./JoinBattleForm";
import { WaitingRoom } from "./WaitingRoom";
import { TrackPicker } from "./TrackPicker";
import { BattleScreen } from "./BattleScreen";
import { Cockpit } from "./Cockpit";
import { SeasonCompletionScreen } from "../SeasonCompletionScreen";
import { PLAYERS } from "@/lib/data/points-mapping";

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
  const [roundPowerups, setRoundPowerups] = useState<RoundPowerup[]>([]);
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

  // Slide the track-picker/cockpit content in from the side whenever the
  // screen changes — a new round starting, or switching between picking
  // a track and racing. Keyed on a primitive (not the activeRound object
  // itself, which gets a fresh reference on every refresh()) so this
  // doesn't replay on every background poll, only on an actual change.
  const isCockpitScreen = Boolean(activeRound);
  const screenKey = activeRound ? activeRound.id : "track";
  useEffect(() => {
    slideIn(screenRef.current, isCockpitScreen ? 28 : -28);
  }, [screenKey, isCockpitScreen]);

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
    setRoundPowerups(state.roundPowerups);
  }, [initialSeason.id, router]);

  useBattleRealtime(season.id, refresh);

  const handleJoined = (newIdentity: BattleIdentity) => {
    writeStoredIdentity(newIdentity);
    setIdentity(newIdentity);
    refresh();
  };

  const handleSwitchPlayer = () => {
    clearStoredIdentity();
    setIdentity(null);
  };

  const handleAbandoned = () => {
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

  const allJoined = Boolean(season.adiJoinedAt && season.renJoinedAt && (!season.guestEnabled || season.guestJoinedAt));
  if (!allJoined) {
    return (
      <WaitingRoom
        season={season}
        myPlayerId={identity.playerId}
        onSwitchPlayer={handleSwitchPlayer}
        onAbandoned={handleAbandoned}
        canAbandon={races.length === 0}
      />
    );
  }

  // Once the season's 32nd race finalizes, stop rendering the track
  // picker/cockpit entirely — otherwise a stale device (or a realtime
  // event landing between "round finalized" and "season marked complete")
  // could momentarily fall through to TrackPicker and let someone start a
  // "round 33 of 32". Checking races.length directly here (rather than
  // trusting activeRound to already be null) closes that race condition.
  // "Play Again" routes through SeasonCompletionScreen's own link back to
  // /war-mode, which re-renders WarModeLanding fresh — same pattern as
  // solo mode's WarModeClient.
  const seasonComplete = races.length >= RACES_PER_SEASON;
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

  // A single BattleScreen call site for both the track-picker and cockpit
  // content (not two separate returns) — React reconciles it as the same
  // instance across the switch, so the backdrop and leaderboard stay
  // mounted instead of flashing/resetting. The inner ref'd div is what
  // the anime.js slide (above) animates on each screen change; Cockpit
  // keeps its own key={activeRound.id} so its internal state (which
  // screen within the cockpit is showing) still resets per round.
  return (
    <BattleScreen
      circuit={activeRound ? circuitsById.get(activeRound.circuitId) : undefined}
      adiPoints={adiTotal}
      renPoints={renTotal}
      guestEnabled={Boolean(season.guestEnabled)}
      guestPoints={guestTotal}
    >
      <div ref={screenRef}>
        {activeRound ? (
          <Cockpit
            key={activeRound.id}
            season={season}
            round={activeRound}
            circuit={circuitsById.get(activeRound.circuitId)}
            myPlayerId={identity.playerId}
            races={races}
            historicalSeasons={historicalSeasons}
            historicalRacesBySeasonId={historicalRacesBySeasonId}
            circuits={circuits}
            pointsMapping={pointsMapping}
            roundPowerups={roundPowerups}
            onChanged={refresh}
          />
        ) : (
          <TrackPicker
            circuits={circuits}
            raceNumber={races.length + 1}
            isAdmin={isAdmin}
            adminName={adminName}
            onSelect={handlePickTrack}
            pending={pending}
          />
        )}
      </div>
    </BattleScreen>
  );
}
