"""
Dolphin -> KartStats live telemetry bridge.

Turns the positions/laps auto_track_race.py already reads reliably (via
the real Raceinfo/RaceinfoPlayer/RacedataSettings fields documented in
mkw-structures -- see that file's own module doc) into HTTP POSTs against
KartStats' /api/telemetry/events route. See src/lib/telemetry/events.ts
and src/app/api/telemetry/events/route.ts in the main kartstats-fresh
repo for the receiving side -- this file is the only thing on the Dolphin
side that knows about that wire contract (seasonId/raceNumber/tsMs/type +
per-type fields, slot as 1|2).

Deliberately NOT wired into item/powerup detection yet. auto_track_race.py's
own git history for its item-tracking code (ITEMHandler structural scans,
pointer-chasing, several reverts, still actively changing as of this
bridge being written) shows that signal isn't confirmed reliable the way
position/lap/course data already is. Sending unconfirmed item reads into
KartStats' permanent race_item_events/race_powerups tables would quietly
corrupt the Tomfoolery Tales stats with noise that looks like real data.
Wire item-received events here once that research settles on one trusted
signal -- not before.

Uses only the standard library (urllib) -- no new dependency for an
already dependency-light tool, and this has to run on whatever bare
Python the Dolphin-memory venv happens to have.

Every public method here is best-effort and never raises: a network
hiccup (dev server not running, wrong token, wrong URL) must never be
able to stall or crash the actual Dolphin-memory tracking loop this
rides along with. Failures print at most once every
ERROR_LOG_INTERVAL_S, not on every tick.
"""

import json
import time
import urllib.error
import urllib.request

# course_id (RacedataSettings' RACEDATA_OFF_COURSE_ID -- see
# auto_track_race.py's TRACK_NAMES) -> KartStats circuit slug (see
# src/lib/data/circuits.ts in the main repo). Covers only the 32 real race
# tracks (0x00-0x1F) -- 0x20-0x29 in TRACK_NAMES are battle stages, which
# War Mode (and so this bridge) never sees.
COURSE_ID_TO_CIRCUIT_ID = {
    0x00: "mario-circuit", 0x01: "moo-moo-meadows", 0x02: "mushroom-gorge",
    0x03: "grumble-volcano", 0x04: "toads-factory", 0x05: "coconut-mall",
    0x06: "dk-summit", 0x07: "warios-gold-mine", 0x08: "luigi-circuit",
    0x09: "daisy-circuit", 0x0A: "moonview-highway", 0x0B: "maple-treeway",
    0x0C: "bowsers-castle", 0x0D: "rainbow-road", 0x0E: "dry-dry-ruins",
    0x0F: "koopa-cape",
    0x10: "gcn-peach-beach", 0x11: "gcn-mario-circuit", 0x12: "gcn-waluigi-stadium",
    0x13: "gcn-dk-mountain", 0x14: "ds-yoshi-falls", 0x15: "ds-desert-hills",
    0x16: "ds-peach-gardens", 0x17: "ds-delfino-square", 0x18: "snes-mario-circuit-3",
    0x19: "snes-ghost-valley-2", 0x1A: "n64-mario-raceway", 0x1B: "n64-sherbet-land",
    0x1C: "n64-bowsers-castle", 0x1D: "n64-dks-jungle-parkway",
    0x1E: "gba-bowser-castle-3", 0x1F: "gba-shy-guy-beach",
}

POST_TIMEOUT_S = 2.0
ERROR_LOG_INTERVAL_S = 10.0


class TelemetryBridge:
    """One instance per script run. Holds the season id / auth the whole
    run uses, plus small per-race, per-slot state (last known lap, when
    the current lap started, whether that slot's race-finished event has
    already been sent) needed to turn raw polls into the right event
    types. `slot` here is always the 1-indexed TelemetrySlot the KartStats
    side expects (1 or 2) -- which raw Dolphin slot ends up 1 vs 2 doesn't
    matter, since KartStats' own Player Assignment step is exactly where
    that gets resolved to adi/ren (with a swap escape hatch for when it's
    guessed backwards)."""

    def __init__(self, season_id: str, api_url: str, token: str):
        self.season_id = season_id
        self.api_url = api_url
        self.token = token
        self._pending = []
        self._last_error_log = 0.0
        self._slot_state = {}

    def start_race(self, race_number: int):
        """Call once per race, before polling starts -- clears per-slot
        lap/finish tracking left over from the previous race."""
        self._slot_state = {}

    def send_circuit_detected(self, race_number: int, circuit_id: str):
        self._queue(
            {"type": "circuit-detected", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": 0, "circuitId": circuit_id}
        )
        self.flush()

    def poll_slot(self, race_number: int, ts_ms: int, slot: int, reading, finishing: bool):
        """`reading` is (position, lap, maxlap, flags) from
        auto_track_race.py's read_player(), or None if this slot couldn't
        be read this tick (silently skipped, same as the main loop
        already does for stale reads elsewhere). `finishing` is the
        caller's own STATE_FINISHING check -- the MKW-specific flag
        constants stay in auto_track_race.py, which already has them for
        its own loop; this module just reacts to the resulting bool so it
        doesn't need to duplicate (and risk drifting from) those
        constants."""
        if reading is None:
            return
        pos, lap, _maxlap, _flags = reading
        state = self._slot_state.setdefault(slot, {"lap": None, "lap_start_ms": 0, "finished": False})

        self._queue(
            {
                "type": "position-update",
                "seasonId": self.season_id,
                "raceNumber": race_number,
                "tsMs": ts_ms,
                "slot": slot,
                "position": pos,
                "lap": lap,
            }
        )

        if state["lap"] is not None and lap > state["lap"]:
            self._queue(
                {
                    "type": "lap-complete",
                    "seasonId": self.season_id,
                    "raceNumber": race_number,
                    "tsMs": ts_ms,
                    "slot": slot,
                    "lap": state["lap"],
                    "lapTimeMs": ts_ms - state["lap_start_ms"],
                }
            )
            state["lap_start_ms"] = ts_ms
        state["lap"] = lap

        if finishing and not state["finished"]:
            state["finished"] = True
            self._queue(
                {
                    "type": "race-finished",
                    "seasonId": self.season_id,
                    "raceNumber": race_number,
                    "tsMs": ts_ms,
                    "slot": slot,
                    "finalPosition": pos,
                    "finalTimeMs": ts_ms,
                }
            )

    def slot_finished(self, slot: int) -> bool:
        return self._slot_state.get(slot, {}).get("finished", False)

    def flush(self):
        if not self._pending:
            return
        events, self._pending = self._pending, []
        body = json.dumps({"events": events}).encode("utf-8")
        req = urllib.request.Request(
            self.api_url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"},
        )
        try:
            urllib.request.urlopen(req, timeout=POST_TIMEOUT_S).read()
        except Exception as exc:  # deliberately broad -- see class docstring
            now = time.time()
            if now - self._last_error_log >= ERROR_LOG_INTERVAL_S:
                print(
                    f"KartStats bridge: POST to {self.api_url} failed ({exc}) -- "
                    "will keep trying; Dolphin tracking itself is unaffected.",
                    flush=True,
                )
                self._last_error_log = now

    def _queue(self, event: dict):
        self._pending.append(event)
