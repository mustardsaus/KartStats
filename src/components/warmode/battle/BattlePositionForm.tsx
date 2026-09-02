"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Circuit, DriverId } from "@/lib/types";
import { PLAYERS } from "@/lib/data/points-mapping";
import { recordPositionAction } from "@/app/war-mode/battle-actions";
import { PositionPicker } from "@/components/warmode/PositionPicker";
import { PopIn } from "@/components/ui/PopIn";
import { Check, ChevronLeft, Flag } from "lucide-react";

/**
 * Battle Mode's dedicated "log the result" screen — reached from the
 * cockpit's "Race concluded?" button as a full screen of its own, not an
 * inline card, so there's room for big, unambiguous position buttons.
 *
 * Each player can only pick their OWN finishing position, from their own
 * device (gated by the joined identity in myPlayerId) — unlike blue
 * shells and power-ups, a race result is the one thing worth requiring
 * the right person to enter themselves. The other player's slot is
 * view-only here: a "waiting" placeholder until they record it from
 * their own phone, then the same locked checkmark either device can see.
 *
 * Positions are optimistic (useOptimistic): tapping a position swaps
 * straight to the locked checkmark view in the same tick as the click,
 * instead of waiting on the server round trip + refetch to reflect it.
 */
export function BattlePositionForm({
  seasonId,
  roundId,
  circuit,
  raceNumber,
  myPlayerId,
  adiPosition,
  renPosition,
  guestEnabled = false,
  guestPosition = null,
  onBack,
  onChanged,
}: {
  seasonId: string;
  roundId: string;
  circuit: Circuit | undefined;
  raceNumber: number;
  myPlayerId: DriverId;
  adiPosition: number | null;
  renPosition: number | null;
  guestEnabled?: boolean;
  guestPosition?: number | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticPositions, addOptimisticPosition] = useOptimistic(
    { adi: adiPosition, ren: renPosition, guest: guestPosition },
    (
      current: { adi: number | null; ren: number | null; guest: number | null },
      update: { playerId: DriverId; position: number }
    ) => ({
      ...current,
      [update.playerId]: update.position,
    })
  );

  const handlePick = (playerId: DriverId, position: number) => {
    setError(null);
    startTransition(async () => {
      addOptimisticPosition({ playerId, position });
      const result = await recordPositionAction(seasonId, roundId, playerId, position);
      // A rejected pick (e.g. a position collision) never wrote to the
      // round, so the optimistic value reverts on its own once onChanged's
      // refresh brings back the real (unchanged) positions — this just
      // surfaces why, instead of leaving the tap looking like it silently
      // did nothing.
      if ("error" in result && result.error) setError(result.error);
      onChanged();
    });
  };

  return (
    <div className="w-full max-w-md mx-auto text-center">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-paper/60 hover:text-paper/85 mb-5 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back
      </button>

      <p className="font-hud text-xs font-bold tracking-[0.25em] text-danger uppercase flex items-center justify-center gap-2 mb-2">
        <Flag className="h-4 w-4" /> Race {raceNumber} of 32
      </p>
      {circuit && (
        <h3 className="font-display text-3xl sm:text-4xl text-paper tracking-wide mb-8 drop-shadow-lg">{circuit.name}</h3>
      )}

      <div className="space-y-10">
        <PositionSlot
          label={`${PLAYERS.adi.name} Finish`}
          value={optimisticPositions.adi}
          accent="adi"
          pending={pending}
          canPick={myPlayerId === "adi"}
          otherName={PLAYERS.adi.name}
          onPick={(p) => handlePick("adi", p)}
        />
        <PositionSlot
          label={`${PLAYERS.ren.name} Finish`}
          value={optimisticPositions.ren}
          accent="ren"
          pending={pending}
          canPick={myPlayerId === "ren"}
          otherName={PLAYERS.ren.name}
          onPick={(p) => handlePick("ren", p)}
        />
        {guestEnabled && (
          <PositionSlot
            label="Prawns Finish"
            value={optimisticPositions.guest}
            accent="guest"
            pending={pending}
            canPick={myPlayerId === "guest"}
            otherName="Prawns"
            onPick={(p) => handlePick("guest", p)}
          />
        )}
      </div>

      {error && <p className="text-sm text-danger mt-6">{error}</p>}

      <p className="text-[11px] text-paper/45 mt-8">Each player records their own finish from their own device.</p>
    </div>
  );
}

function PositionSlot({
  label,
  value,
  accent,
  pending,
  canPick,
  otherName,
  onPick,
}: {
  label: string;
  value: number | null;
  accent: "adi" | "ren" | "guest";
  pending: boolean;
  canPick: boolean;
  otherName: string;
  onPick: (position: number) => void;
}) {
  if (value !== null) {
    return (
      <div className="text-center">
        <span className="block text-xs font-hud font-semibold text-paper/65 mb-2 uppercase tracking-wide">{label}</span>
        <PopIn
          className={`mx-auto flex h-14 w-14 items-center justify-center gap-1 rounded-full text-lg font-hud font-bold ${
            accent === "adi" ? "bg-adi text-bg" : accent === "ren" ? "bg-ren text-void" : "bg-paper/25 text-paper"
          }`}
        >
          <Check className="h-4 w-4" /> P{value}
        </PopIn>
      </div>
    );
  }

  if (!canPick) {
    return (
      <div className="text-center">
        <span className="block text-xs font-hud font-semibold text-paper/65 mb-2 uppercase tracking-wide">{label}</span>
        <div className="rounded-xl border border-dashed border-paper/20 py-6 px-4 text-sm text-paper/45">
          Waiting for {otherName} to pick their finish…
        </div>
      </div>
    );
  }

  // PositionPicker only knows the two accent colors — a "guest" slot the
  // current device CAN pick (i.e. this device joined as Prawns) reuses the
  // neutral "ren" button styling rather than teaching that shared component
  // a third color scheme for a seat it otherwise never needs to render.
  return (
    <PositionPicker label={label} value={null} onChange={onPick} accent={accent === "adi" ? "adi" : "ren"} disabled={pending} />
  );
}
