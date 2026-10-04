#!/usr/bin/env python3
"""
Hunts for "what hit me" -- did a shell/banana/bomb/etc. just stun this
player, and if the game records it, which one. Nothing here is guessed:
this watches two windows of memory we already have 100%-reliable,
ground-truth-confirmed anchors for, and logs every byte that changes in
either one for a whole race, so a real hit can be correlated against
whatever changed at that exact moment -- same "play a race, report what
actually happened, match it against the log" method that found the held
item, Raceinfo, and everything else in this project that's actually
panned out.

The two anchors:
  - RaceinfoPlayer (via Raceinfo::sInstance -> players[0]) -- the struct
    auto_track_race.py already reads position/lap/stateFlags from. Its
    stateFlags bitfield (offset 0x38) has 6 DOCUMENTED bits (IN_RACE,
    END_RACE_CAMERA, WRONG_WAY, DC, FINISHING, COMING_LAST_ANIM) but is a
    full 32-bit field -- there's room for an undocumented "just got hit"
    bit or two here.
  - The new struct resolve_held_item_chain.py found (global slot
    0x809BEE20 -> +0x14 -> this struct, held item at +0x8C). Confirmed
    live this session to update correctly through 8 straight pickup/use
    cycles. Stun/collision state is a very plausible neighbor of held-item
    state in whatever class this is.

Honest expectation: MKW might only track a generic "stunned" state rather
than the literal item that caused it -- some hits (two different shell
colors, say) may be mechanically identical to the game and simply not
distinguished anywhere in memory, while others (an explosion, a shrink, a
launch) are different enough to likely be tracked separately. This script
can only show what's actually there; it can't promise the specific
distinction you're hoping for.

Self-recalled timestamps turned out too imprecise to match confidently
against the log on the first real run -- "~135s" from memory, while
actively driving, didn't land cleanly on any single candidate. So this
version adds a live marker: tap Enter the INSTANT you get hit (no typing
needed, hands barely leave the controller) and that exact moment gets
logged. Report the order of what hit you afterward, same as before, and
marker 1/2/3/... line up with that order precisely instead of guessing.

Usage:
    python scripts/watch_hit_events.py
Get into a race. The instant you get hit, tap Enter (then keep playing).
Ctrl+C when done, then report the order/type of hits that correspond to
each marker.
"""
import os
import queue
import sys
import threading
import time
from pathlib import Path

try:
    import numpy as np
except ImportError:
    print(
        "numpy isn't installed. From tools/position-read, with your venv active:\n"
        "  pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402
import resolve_held_item_chain as rhic  # noqa: E402

dme = atr.dme

# RaceinfoPlayer window: generous past the last documented field (0x48)
# so any undocumented nearby state is still covered.
RIP_WINDOW_SIZE = 0x100

# The held-item-chain struct: same window size already used for its own
# scan in auto_track_race.py's player-item work.
KART_STATE_WINDOW_SIZE = 0x200

POLL_INTERVAL_S = 0.15
LOG_PATH = Path(__file__).resolve().parent.parent / "watch_hit_events_log.txt"

# Known offsets, labeled so the log reads as "known field changed" instead
# of "mystery offset changed" -- real candidates are whatever ISN'T here.
RIP_KNOWN_OFFSETS = {
    atr.PLAYER_OFF_ID: "id",
    atr.PLAYER_OFF_POSITION: "position",
    atr.PLAYER_OFF_CURRENT_LAP: "currentLap",
    atr.PLAYER_OFF_MAX_LAP: "maxLap",
    atr.PLAYER_OFF_STATE_FLAGS: "stateFlags",
    0x3C: "lapFinishTimes (ptr)",
    0x40: "raceFinishTime (ptr)",
    0x48: "controllerHolder (ptr)",
}
KART_STATE_KNOWN_OFFSETS = {
    rhic.HELD_ITEM_OFFSET: "held item (confirmed)",
}

STATE_FLAG_NAMES = {
    atr.STATE_IN_RACE: "IN_RACE",
    atr.STATE_END_RACE_CAMERA: "END_RACE_CAMERA",
    atr.STATE_WRONG_WAY: "WRONG_WAY",
    atr.STATE_DC: "DC",
    atr.STATE_FINISHING: "FINISHING",
    atr.STATE_COMING_LAST_ANIM: "COMING_LAST_ANIM",
}


def start_enter_marker_thread(mark_queue: "queue.Queue") -> None:
    """Runs a daemon thread that blocks on input() (a bare Enter press,
    no typing required) and pushes a sentinel onto mark_queue each time.
    Separate thread so the polling loop never blocks waiting for a
    keypress that might not come for minutes."""

    def _listen():
        while True:
            try:
                input()
            except EOFError:
                return
            mark_queue.put(True)

    t = threading.Thread(target=_listen, daemon=True)
    t.start()


def drain_marks(mark_queue: "queue.Queue", elapsed: float, mark_count: int):
    """Pure-ish helper: pulls every pending mark off the queue and returns
    (new_mark_count, [log lines]) -- kept separate from the emit/print
    side effect so the counting logic is testable without a real queue
    full of real threading timing."""
    lines = []
    while not mark_queue.empty():
        mark_queue.get()
        mark_count += 1
        lines.append(f"[{elapsed:6.1f}s] *** HIT MARKED (#{mark_count}) -- note what this one was ***")
    return mark_count, lines


def read_window(base: int, size: int):
    try:
        return dme.read_bytes(base, size)
    except Exception:
        return None


def diff_bytes(prev: bytes, cur: bytes):
    """Pure byte-level diff: returns [(offset, old_byte, new_byte), ...]
    for every byte that changed. Kept separate from the polling loop so
    it's testable without mocking dme."""
    if prev is None or cur is None or len(prev) != len(cur):
        return []
    a = np.frombuffer(prev, dtype=np.uint8)
    b = np.frombuffer(cur, dtype=np.uint8)
    idxs = np.nonzero(a != b)[0]
    return [(int(i), int(a[i]), int(b[i])) for i in idxs]


def decode_state_flags_change(old_val: int, new_val: int) -> str:
    changed_bits = old_val ^ new_val
    parts = []
    for bit, name in STATE_FLAG_NAMES.items():
        if changed_bits & bit:
            parts.append(f"{name}:{'0->1' if new_val & bit else '1->0'}")
    unknown_changed = changed_bits & ~sum(STATE_FLAG_NAMES.keys())
    if unknown_changed:
        parts.append(f"UNDOCUMENTED_BITS:0x{unknown_changed:08X}")
    return ", ".join(parts) if parts else "(no named bits changed)"


def resolve_anchors():
    """Returns (rip_addr, kart_state_addr) or (None, None) if either is
    currently unavailable."""
    raceinfo_addr = atr.try_fast_path()
    if raceinfo_addr is None:
        found, _t, _c, _nr = atr.find_raceinfo_candidates()
        if not found:
            return None, None
        raceinfo_addr = found[0]

    rip_addr = atr.get_local_player_addr(raceinfo_addr)

    chain = rhic.resolve_chain()
    kart_state_addr = chain["array_ptr"]

    return rip_addr, kart_state_addr


def main() -> None:
    lines = [f"\n=== watch-hit-events run at {time.strftime('%Y-%m-%d %H:%M:%S')} ==="]

    def emit(msg: str = "") -> None:
        print(msg)
        lines.append(msg)

    try:
        atr.hook_with_retry()

        rip_addr, kart_state_addr = resolve_anchors()
        if rip_addr is None or kart_state_addr is None:
            emit("Couldn't resolve one or both anchors -- are you actually in a race right now?")
            return

        emit(f"RaceinfoPlayer -> 0x{rip_addr:08X}  (watching 0x{RIP_WINDOW_SIZE:X} bytes)")
        emit(f"Kart-state struct -> 0x{kart_state_addr:08X}  (watching 0x{KART_STATE_WINDOW_SIZE:X} bytes)")
        emit(
            "\nLogging every byte that changes in either window for the rest of this "
            "race. The INSTANT you get hit, tap Enter in this terminal (no typing "
            "needed) -- that marks the exact moment precisely. Report the order/type "
            "of hits afterward. Ctrl+C when done.\n"
        )

        mark_queue: "queue.Queue" = queue.Queue()
        start_enter_marker_thread(mark_queue)
        mark_count = 0

        t_start = time.time()
        prev_rip = read_window(rip_addr, RIP_WINDOW_SIZE)
        prev_ks = read_window(kart_state_addr, KART_STATE_WINDOW_SIZE)

        while True:
            time.sleep(POLL_INTERVAL_S)
            if not dme.is_hooked():
                emit("Lost hook to Dolphin. Stopping.")
                break

            elapsed = time.time() - t_start

            mark_count, mark_lines = drain_marks(mark_queue, elapsed, mark_count)
            for line in mark_lines:
                emit(line)

            cur_rip = read_window(rip_addr, RIP_WINDOW_SIZE)
            if cur_rip is None:
                emit(f"[{elapsed:6.1f}s] RaceinfoPlayer window unreadable -- race likely ended. Stopping.")
                break
            for offset, old, new in diff_bytes(prev_rip, cur_rip):
                label = RIP_KNOWN_OFFSETS.get(offset, "unknown")
                extra = ""
                if offset == atr.PLAYER_OFF_STATE_FLAGS:
                    extra = f"  [{decode_state_flags_change(old, new)}]"
                emit(f"[{elapsed:6.1f}s] RIP+0x{offset:03X} ({label}): {old} -> {new}{extra}")
            prev_rip = cur_rip

            cur_ks = read_window(kart_state_addr, KART_STATE_WINDOW_SIZE)
            if cur_ks is None:
                emit(f"[{elapsed:6.1f}s] Kart-state window unreadable -- race likely ended. Stopping.")
                break
            for offset, old, new in diff_bytes(prev_ks, cur_ks):
                label = KART_STATE_KNOWN_OFFSETS.get(offset, "unknown")
                emit(f"[{elapsed:6.1f}s] KS+0x{offset:03X} ({label}): {old} -> {new}")
            prev_ks = cur_ks
    except KeyboardInterrupt:
        emit("\nStopped.")
    finally:
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\n(Appended this run's output to {LOG_PATH})")


if __name__ == "__main__":
    main()
