#!/usr/bin/env python3
"""
Finds the real "currently held item" field -- confirmed for real via
Dolphin's own built-in Cheat Search (Tools > Cheats Manager > Start New
Cheat Search), not guessed. That search converged on a single 32-bit
int (0x8124b934 in that one session) that reads ~19-20 while holding no
item and drops to a small 0-18 value matching the real in-game item ID
the instant an item is picked up (9=Star, 10=Golden Mushroom, 15=Bullet
Bill all confirmed exactly against the community item-ID table).

That exact address is a per-session heap allocation, though, so it will
almost certainly be somewhere else next time Dolphin is launched. This
script re-finds it automatically every run using the now-confirmed
VALUE signature instead of guessing at wide ranges like every previous
attempt in this project:
  - idle state: an int32 in a narrow window around 19-20 (not a wide
    guessed range -- this is the one actual observed idle value)
  - confirmation: the SAME address transitions into [0, 18] (a real
    item ID) during the live-watch window, exactly matching what was
    seen in Dolphin's Cheat Search

Usage:
    python scripts/find_held_item.py
Get into a race, make sure you're NOT currently holding an item, let it
scan + narrow, then pick up (and optionally use) a few different items
during the watch window.
"""
import os
import sys
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

dme = atr.dme

# Confirmed via Dolphin's own Cheat Search against this item-ID table
# (community item-modifier reference; 14="Lightning" is a likely source
# typo/duplicate -- 8 is also Lightning -- left as-is until a real
# Thundercloud is observed to confirm or correct it).
ITEM_NAMES = {
    0: "Green Shell", 1: "Red Shell", 2: "Banana", 3: "Fake Item Box",
    4: "Mushroom", 5: "Triple Mushrooms", 6: "Bob-omb", 7: "Blue Shell",
    8: "Lightning", 9: "Star", 10: "Golden Mushroom", 11: "Mega Mushroom",
    12: "Blooper", 13: "POW", 14: "Lightning (?)", 15: "Bullet Bill",
    16: "Triple Green Shells", 17: "Triple Red Shells", 18: "Triple Bananas",
}
ITEM_ID_MIN, ITEM_ID_MAX = 0, 18

# The one actually-observed idle value (20) plus a small buffer on
# either side -- NOT a wide guessed range like every earlier attempt.
IDLE_MIN, IDLE_MAX = 17, 22

# Same heap regions already proven relevant for per-race player state.
HEAP_REGIONS = [
    (0x81000000, 0x81800000),  # MEM1 heap-likely portion
    (0x90000000, 0x94000000),  # MEM2
]

STABILITY_ROUNDS = 4
STABILITY_INTERVAL_S = 0.25

WATCH_DURATION_S = 60.0
POLL_INTERVAL_S = 0.2

RETENTION_CAP = 2000
PRINT_CAP = 40

LOG_PATH = Path(__file__).resolve().parent.parent / "held_item_log.txt"


def item_name(value) -> str:
    if value is None:
        return "?"
    if ITEM_ID_MIN <= value <= ITEM_ID_MAX:
        return ITEM_NAMES.get(value, f"unknown item {value}")
    return "none"


def scan_region_for_idle_value(start: int, end: int):
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return []
    arr = np.frombuffer(buf, dtype=np.uint8)
    n = len(arr) // 4
    if n <= 0:
        return []
    usable = n * 4
    vals = np.frombuffer(arr[:usable].tobytes(), dtype=">i4")
    mask = (vals >= IDLE_MIN) & (vals <= IDLE_MAX)
    idxs = np.nonzero(mask)[0]
    return [int(start + i * 4) for i in idxs]


def find_idle_candidates():
    found = []
    for start, end in HEAP_REGIONS:
        found.extend(scan_region_for_idle_value(start, end))
    return found


def read_i32(addr: int):
    try:
        return int.from_bytes(dme.read_bytes(addr, 4), byteorder="big", signed=True)
    except Exception:
        return None


def filter_stable_candidates(candidates, rounds: int = STABILITY_ROUNDS, interval_s: float = STABILITY_INTERVAL_S):
    """Keeps only candidates whose value stays EXACTLY the same across
    `rounds` re-reads -- the real idle item-slot field should sit still
    while you're not touching anything, same reasoning already proven
    out (and already shown NOT to be a universal filter on its own) in
    find_player_candidates.py, but here it's layered on top of the much
    tighter, empirically-confirmed idle-value window instead of a wide
    guessed range, so it's not fighting ubiquitous defaults this time."""
    if not candidates or rounds <= 1:
        return list(candidates)
    alive = {addr: read_i32(addr) for addr in candidates}
    for _ in range(rounds - 1):
        time.sleep(interval_s)
        alive = {addr: val for addr, val in alive.items() if read_i32(addr) == val}
        if not alive:
            break
    return sorted(alive.keys())


def main() -> None:
    lines = [f"\n=== find-held-item run at {time.strftime('%Y-%m-%d %H:%M:%S')} ==="]

    def emit(msg: str = "") -> None:
        print(msg)
        lines.append(msg)

    try:
        atr.hook_with_retry()
        raceinfo_addr = atr.try_fast_path()
        if raceinfo_addr is None:
            emit("Raceinfo fast path didn't check out -- are you actually in a race right now?")
            found, _t, _c, _nr = atr.find_raceinfo_candidates()
            if not found:
                emit("No Raceinfo candidate found.")
                return
            raceinfo_addr = found[0]
        emit(f"Raceinfo -> 0x{raceinfo_addr:08X}")

        emit(
            f"\nScanning for int32 values in the idle window [{IDLE_MIN}, {IDLE_MAX}] "
            "-- make sure you're not currently holding an item..."
        )
        t0 = time.time()
        raw = find_idle_candidates()
        emit(f"{len(raw)} raw candidate(s) found in {time.time() - t0:.2f}s.")

        if len(raw) > RETENTION_CAP:
            emit(f"(Capping to the first {RETENTION_CAP} for the stability pass.)")
            raw = raw[:RETENTION_CAP]

        stability_window_s = (STABILITY_ROUNDS - 1) * STABILITY_INTERVAL_S
        emit(f"Verifying stability over ~{stability_window_s:.1f}s (stay idle)...")
        candidates = filter_stable_candidates(raw)
        emit(f"{len(candidates)} candidate(s) stayed stable (down from {len(raw)}).")
        lines.append(f"{len(raw)} raw -> {len(candidates)} stable idle candidate(s)")

        if not candidates:
            emit("\nNo stable idle-value candidate found. Nothing to watch.")
            return

        shown = candidates[:PRINT_CAP]
        for addr in shown:
            emit(f"  0x{addr:08X}  = {read_i32(addr)}")
        if len(candidates) > PRINT_CAP:
            emit(f"  ...and {len(candidates) - PRINT_CAP} more (see log)")
        for addr in candidates:
            if addr not in shown:
                lines.append(f"  0x{addr:08X}  = {read_i32(addr)}")

        emit(
            f"\n{len(candidates)} candidate(s). Watching for {WATCH_DURATION_S:.0f}s -- "
            "pick up (and optionally use) a few different items now. Ctrl+C to stop early.\n"
        )

        prev = {addr: read_i32(addr) for addr in candidates}
        confirmed = set()
        t_start = time.time()
        try:
            while time.time() - t_start < WATCH_DURATION_S:
                time.sleep(POLL_INTERVAL_S)
                if not dme.is_hooked():
                    emit("Lost hook to Dolphin. Stopping.")
                    break
                for addr in candidates:
                    cur = read_i32(addr)
                    if cur != prev[addr]:
                        elapsed = time.time() - t_start
                        was_item = prev[addr] is not None and ITEM_ID_MIN <= prev[addr] <= ITEM_ID_MAX
                        is_item = cur is not None and ITEM_ID_MIN <= cur <= ITEM_ID_MAX
                        tag = ""
                        if is_item and not was_item:
                            tag = f"  <-- CONFIRMED: now holding {item_name(cur)}!"
                            confirmed.add(addr)
                        elif was_item and not is_item:
                            tag = "  (item slot cleared)"
                        line = (
                            f"[{elapsed:6.1f}s] 0x{addr:08X} changed: {prev[addr]} ({item_name(prev[addr])}) -> "
                            f"{cur} ({item_name(cur)}){tag}"
                        )
                        emit(line)
                        prev[addr] = cur
        except KeyboardInterrupt:
            emit("\nStopped.")

        if confirmed:
            emit(f"\n{len(confirmed)} address(es) confirmed by a real item pickup this run:")
            for addr in sorted(confirmed):
                emit(f"  0x{addr:08X}")
        else:
            emit(
                "\nNo candidate was confirmed by an item pickup during this run -- "
                "did you actually grab an item while it was watching?"
            )
    finally:
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\n(Appended this run's output to {LOG_PATH})")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
