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

# character_id (RacedataPlayer.characterId -- see auto_track_race.py's
# detect_loadout()) -> KartStats character slug (src/lib/data/characters.ts).
# IDs and names checked against the Custom Mario Kart wiki's "List of
# Identifiers" page (the same source auto_track_race.py's game-build
# constants are checked against) -- "mii" (ids 0x18+) has no single slug
# in KartStats' roster, so it's intentionally left out of this table: an
# unmapped id is skipped by send_loadout_detected rather than guessed.
CHARACTER_ID_TO_SLUG = {
    0x00: "mario", 0x01: "baby-peach", 0x02: "waluigi", 0x03: "bowser",
    0x04: "baby-daisy", 0x05: "dry-bones", 0x06: "baby-mario", 0x07: "luigi",
    0x08: "toad", 0x09: "donkey-kong", 0x0A: "yoshi", 0x0B: "wario",
    0x0C: "baby-luigi", 0x0D: "toadette", 0x0E: "koopa-troopa", 0x0F: "daisy",
    0x10: "peach", 0x11: "birdo", 0x12: "diddy-kong", 0x13: "king-boo",
    0x14: "bowser-jr", 0x15: "dry-bowser", 0x16: "funky-kong", 0x17: "rosalina",
}

# vehicle_id (RacedataPlayer.vehicleId) -> KartStats vehicle slug
# (src/lib/data/karts.ts). NOTE: an earlier draft of this table (in
# discover_character_vehicle.py) was missing "Quacker" entirely, which
# shifted every id from 0x1B onward by one and mislabeled 9 of the 36
# vehicles -- this table was re-checked against the same wiki source
# specifically because of that, not assumed correct by inheritance.
VEHICLE_ID_TO_SLUG = {
    0x00: "standard-kart-s", 0x01: "standard-kart-m", 0x02: "standard-kart-l",
    0x03: "booster-seat", 0x04: "classic-dragster", 0x05: "offroader",
    0x06: "mini-beast", 0x07: "wild-wing", 0x08: "flame-flyer",
    0x09: "cheep-charger", 0x0A: "super-blooper", 0x0B: "piranha-prowler",
    0x0C: "tiny-titan", 0x0D: "daytripper", 0x0E: "jetsetter",
    0x0F: "blue-falcon", 0x10: "sprinter", 0x11: "honeycoupe",
    0x12: "standard-bike-s", 0x13: "standard-bike-m", 0x14: "standard-bike-l",
    0x15: "bullet-bike", 0x16: "mach-bike", 0x17: "flame-runner",
    0x18: "bit-bike", 0x19: "sugarscoot", 0x1A: "wario-bike",
    0x1B: "quacker", 0x1C: "zip-zip", 0x1D: "shooting-star",
    0x1E: "magikruiser", 0x1F: "sneakster", 0x20: "spear",
    0x21: "jet-bubble", 0x22: "dolphin-dasher", 0x23: "phantom",
}

# item_id (ITEMPacket.item_tail, read via auto_track_race.py's
# read_item_packet -- the one item-related field this project has
# actually validated, via the same strict multi-field shape-check
# trusted for Raceinfo/RaceConfig; see _itemhandler_shape_ok) -> KartStats
# ItemId slug (src/lib/data/items.ts). Covers every real item id
# (0x00-0x12); the "(no item)" sentinel (0x14) is never passed in here.
ITEM_ID_TO_SLUG = {
    0x00: "green-shell", 0x01: "red-shell", 0x02: "banana", 0x03: "fake-item-box",
    0x04: "mushroom", 0x05: "triple-mushrooms", 0x06: "bob-omb", 0x07: "blue-shell",
    0x08: "lightning", 0x09: "star", 0x0A: "golden-mushroom", 0x0B: "mega-mushroom",
    0x0C: "blooper", 0x0D: "pow-block", 0x0E: "thunder-cloud", 0x0F: "bullet-bill",
    0x10: "triple-green-shells", 0x11: "triple-red-shells", 0x12: "triple-bananas",
}


def discover_season_id(api_url: str, token: str, timeout_s: float = 10.0):
    """GET the companion /active-season endpoint (same host as api_url,
    swap the /events tail for /active-season) and return its seasonId, or
    None on any failure/absence -- callers poll this in a loop rather than
    treating a None as fatal, since "no Immersive season waiting yet" is
    the normal state between seasons."""
    url = api_url.rsplit("/events", 1)[0] + "/active-season"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read())
        return data.get("seasonId")
    except Exception:
        return None


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
        self._loadout_events = []  # sent immediately (see send_loadout_detected), kept here only for the backup file

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

    def send_loadout_detected(self, race_number: int, slot: int, character_id: int, vehicle_id: int):
        """Sent immediately and on its own (same reasoning as
        send_circuit_detected) -- not queued into the end-of-race batch,
        so the KartStats page can show who's playing as what WHILE the
        race is still running, not only after it ends. KartStats only
        ever USES the first race's reading for the whole season (see
        lib/telemetry/finalize.ts), so sending it every race is harmless,
        not wasteful logic to special-case out here. An id this bridge
        doesn't have a slug for (a Mii) is skipped entirely -- never
        guessed."""
        char_slug = CHARACTER_ID_TO_SLUG.get(character_id)
        kart_slug = VEHICLE_ID_TO_SLUG.get(vehicle_id)
        if not char_slug or not kart_slug:
            return
        event = {
            "type": "loadout-detected",
            "seasonId": self.season_id,
            "raceNumber": race_number,
            "tsMs": 0,
            "slot": slot,
            "characterId": char_slug,
            "kartId": kart_slug,
        }
        self._loadout_events.append(event)
        self._outbox.put([event])

    def send_item_received(self, race_number: int, slot: int, ts_ms: int, item_id: int, lap: int):
        """Queued into the end-of-race batch like position/lap data --
        unlike circuit/loadout, nothing in KartStats shows items live
        today (only the post-race result panel and Tomfoolery Tales read
        them), so there's no reason to pay for an immediate POST per
        pickup. An item id with no slug mapping is skipped entirely,
        never guessed -- in practice every real item id is mapped."""
        item_slug = ITEM_ID_TO_SLUG.get(item_id)
        if not item_slug:
            return
        self._queue(
            {"type": "item-received", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": ts_ms, "slot": slot, "itemId": item_slug, "lap": lap}
        )

    def send_speed_update(self, race_number: int, slot: int, ts_ms: int, speed: float):
        """Queued into the end-of-race batch like send_item_received --
        nothing in KartStats shows live speed today either. `speed` is
        the raw PlayerSub10.vehicleSpeed reading auto_track_race.py's
        structural scan finds (see PLAYERSUB10_OFF_VEHICLE_SPEED there) --
        not km/h or any other real-world unit, since no conversion
        factor has been confirmed. It's the same raw unit on every race
        though, so max() within a race (the speed trap) and comparisons
        across races/circuits are both meaningful on KartStats' side."""
        self._queue(
            {"type": "speed-update", "seasonId": self.season_id, "raceNumber": race_number, "tsMs": ts_ms, "slot": slot, "speed": round(speed, 2)}
        )

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
        events = ([self._circuit_event] if self._circuit_event else []) + self._loadout_events + self._race_events
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
