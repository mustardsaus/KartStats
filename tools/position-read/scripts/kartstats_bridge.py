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

DESIGN (deferred): nothing is streamed live. The tracker records the whole
race in memory -- every position change, lap split, and finish -- and
sends it as ONE batch when the race ends (finish_race). The only early
POST is the circuit, so the page can show the track name while the race
runs. A JSON copy of every race is also written to ../race_backups/ so a
failed POST can be replayed:
    python scripts/kartstats_bridge.py ../race_backups/<file>.json --api-url ... --token ...

Every public method here is best-effort and never raises: a network
hiccup (dev server not running, wrong token, wrong URL) must never be
able to stall or crash the actual Dolphin-memory tracking loop this
rides along with. Failures print at most once every
ERROR_LOG_INTERVAL_S, not on every tick.
"""

import json
import os
import queue
import threading
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

POST_TIMEOUT_S = 30.0  # one POST per race, from a background thread; generous so a cold start can't fail it
ERROR_LOG_INTERVAL_S = 10.0
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "race_backups")


class TelemetryBridge:
    """One instance per script run. `slot` is always the 1-indexed
    TelemetrySlot KartStats expects (1 or 2); which raw Dolphin slot ends up
    1 vs 2 is resolved to adi/ren by KartStats' Player Assignment step."""

    def __init__(self, season_id: str, api_url: str, token: str):
        self.season_id = season_id
        self.api_url = api_url
        self.token = token
        self._outbox = queue.Queue()
        self._worker = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker.start()
        self._last_error_log = 0.0
        self._reset_race_state()

    def _reset_race_state(self):
        self._slot_state = {}
        self._race_events = []  # everything for the current race -- sent once, by finish_race
        self._circuit_event = None
        self.circuit_id = None

    def start_race(self, race_number: int):
        """Call once per race, before polling starts."""
        self._reset_race_state()

    def send_circuit_detected(self, race_number: int, circuit_id: str):
        """Sent immediately and on its own, so the KartStats page can show
        the track while the race is still running. Calling it again (e.g.
        the course read changed at GO) replaces the earlier one -- the page
        and the finalize step both use the LATEST circuit event."""
        event = {"type": "circuit-detected", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": 0, "circuitId": circuit_id}
        self.circuit_id = circuit_id
        self._circuit_event = event
        self._outbox.put([event])

    def poll_slot(self, race_number: int, ts_ms: int, slot: int, reading, finishing: bool):
        """`reading` is (position, lap, maxlap, flags) from read_player(),
        or None if unreadable this tick. Records position changes, lap
        splits and the finish into memory; sends nothing. A lap that never
        completes (e.g. last place when the race ends for everyone) never
        produces a lap-complete, so its time is simply absent."""
        if reading is None:
            return
        pos, lap, _maxlap, _flags = reading
        state = self._slot_state.setdefault(
            slot, {"lap": None, "lap_start_ms": 0, "finished": False, "pos": None, "completed": set(), "last_pos_sent": None}
        )
        state["pos"] = pos

        if state["last_pos_sent"] != (pos, lap):
            state["last_pos_sent"] = (pos, lap)
            self._queue(
                {"type": "position-update", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": ts_ms, "slot": slot, "position": pos, "lap": lap}
            )

        if state["lap"] is not None and lap > state["lap"]:
            done = state["lap"]  # the lap that just ended
            if done >= 1:
                # Lap 0 is the run-up to the start line (karts start behind
                # it) -- lap 1's clock started at GO, so it is NOT reset
                # when the counter ticks 0 -> 1.
                self._complete_lap(race_number, ts_ms, slot, state, done)
                state["lap_start_ms"] = ts_ms
        state["lap"] = lap

        if finishing and not state["finished"]:
            state["finished"] = True
            if lap >= 3:
                self._complete_lap(race_number, ts_ms, slot, state, 3)  # no-op if the 3 -> 4 tick already did it
            self._queue(
                {"type": "race-finished", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": ts_ms, "slot": slot, "finalPosition": pos, "finalTimeMs": ts_ms}
            )

    def _complete_lap(self, race_number, ts_ms, slot, state, lap):
        if lap in state["completed"]:
            return
        state["completed"].add(lap)
        self._queue(
            {"type": "lap-complete", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": ts_ms, "slot": slot, "lap": lap, "lapTimeMs": ts_ms - state["lap_start_ms"]}
        )

    def slot_finished(self, slot: int) -> bool:
        return self._slot_state.get(slot, {}).get("finished", False)

    def flush(self, force: bool = False):
        """Kept so existing call sites still work -- nothing is streamed any more."""
        return

    def finish_race(self, race_number: int):
        """Race is over for everyone: any slot that never crossed the line
        (last place -- the race ends when everyone else finishes) is closed
        out with its last known position and NO final time, then the whole
        race is sent as one batch."""
        for slot, state in self._slot_state.items():
            if not state["finished"] and state["pos"] is not None:
                state["finished"] = True
                self._queue(
                    {"type": "race-finished", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": 0, "slot": slot, "finalPosition": state["pos"], "finalTimeMs": None}
                )
        if not self._race_events:
            return
        events = ([self._circuit_event] if self._circuit_event else []) + self._race_events
        path = self._backup(race_number, events)
        self._outbox.put(events)
        print(f"KartStats bridge: race {race_number} sent ({len(events)} events); backup at {path}", flush=True)
        self.drain(40)
        self._reset_race_state()

    def drain(self, timeout_s: float = 40.0):
        deadline = time.time() + timeout_s
        while self._outbox.unfinished_tasks and time.time() < deadline:
            time.sleep(0.1)

    def _backup(self, race_number, events):
        try:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            path = os.path.abspath(os.path.join(BACKUP_DIR, f"race_{self.season_id[:8]}_{race_number}_{int(time.time())}.json"))
            with open(path, "w") as f:
                json.dump({"events": events}, f)
            return path
        except Exception:
            return "(backup failed)"

    def _worker_loop(self):
        while True:
            events = self._outbox.get()
            try:
                self._post(events)
            except Exception:
                pass
            finally:
                self._outbox.task_done()

    def _post(self, events):
        body = json.dumps({"events": events}).encode("utf-8")
        req = urllib.request.Request(
            self.api_url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"},
        )
        try:
            urllib.request.urlopen(req, timeout=POST_TIMEOUT_S).read()
        except urllib.error.HTTPError as exc:
            self._log_error(f"HTTP {exc.code}: {exc.read()[:200]!r}")
        except Exception as exc:  # deliberately broad -- see module docstring
            self._log_error(str(exc))

    def _log_error(self, detail: str):
        now = time.time()
        if now - self._last_error_log >= ERROR_LOG_INTERVAL_S:
            print(f"KartStats bridge: POST to {self.api_url} failed ({detail}) -- tracking continues; the race was saved to race_backups/ and can be replayed.", flush=True)
            self._last_error_log = now

    def _queue(self, event: dict):
        self._race_events.append(event)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Replay a saved race batch (race_backups/*.json) to KartStats.")
    ap.add_argument("file")
    ap.add_argument("--api-url", default=os.environ.get("KARTSTATS_API_URL"))
    ap.add_argument("--token", default=os.environ.get("KARTSTATS_BRIDGE_TOKEN"))
    a = ap.parse_args()
    data = json.load(open(a.file))
    req = urllib.request.Request(
        a.api_url,
        data=json.dumps(data).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {a.token}"},
    )
    print(urllib.request.urlopen(req, timeout=POST_TIMEOUT_S).read().decode())
