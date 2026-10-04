#!/usr/bin/env python3
"""
Finds the real "currently held item" field -- confirmed for real via
Dolphin's own built-in Cheat Search (Tools > Cheats Manager > Start New
Cheat Search), not guessed. That search converged on a single 32-bit
int (0x8124b934 in that one session) that read ~19-20 while holding no
item and dropped to a small 0-18 value matching the real in-game item
ID the instant an item was picked up (9=Star, 10=Golden Mushroom,
15=Bullet Bill all confirmed exactly against the community item-ID
table). As expected, that exact address is a per-race heap allocation
-- a fresh race immediately moved it elsewhere.

The first attempt at re-finding it automatically scanned once for the
narrow idle-value window, then passively watched for 60s and flagged
ANY address that dipped into [0, 18] as "confirmed". That produced 58
"confirmed" addresses in one run, several of them literally 4 bytes
apart from each other -- a dead giveaway of landing in a region packed
with small, frequently-changing, unrelated numbers (looks like
overlapping reads of byte/short arrays), not one real field. Passively
watching a noisy 60s window and reacting to any single dip into range
just isn't a strong enough test on its own.

This version instead replicates the actual interactive process that
worked by hand in Dolphin's Cheat Search: narrow the candidate set
round by round, alternating "did it change the way a real pickup
would" and "did it stay exactly the same while nothing happened",
exactly like alternating Equal-to-Last-Value / Not-Equal-to-Last-Value
searches. It prompts you at each step instead of guessing when to look.

Usage:
    python scripts/find_held_item.py
Get into a race and follow the prompts.
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

# Stop narrowing early once the candidate set is this small -- no point
# running more rounds than needed.
TARGET_CANDIDATES = 3
MAX_CYCLES = 4

LOG_PATH = Path(__file__).resolve().parent.parent / "held_item_log.txt"


def is_item_value(v) -> bool:
    return v is not None and ITEM_ID_MIN <= v <= ITEM_ID_MAX


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


def snapshot(addrs) -> dict:
    return {addr: read_i32(addr) for addr in addrs}


# --- Pure narrowing logic (kept separate from the interactive prompts
# below so it can be unit-tested without mocking input() or dme). ---

def keep_changed_to_item(before_val, after_val) -> bool:
    """Round that expects a real pickup: value must have changed AND
    landed on a plausible item ID."""
    return before_val != after_val and is_item_value(after_val)


def keep_unchanged(before_val, after_val) -> bool:
    """Round that expects nothing to have happened: value must be
    exactly the same both times."""
    return before_val == after_val and before_val is not None


def keep_left_item_range(before_val, after_val) -> bool:
    """Round that expects the item to have just been used: value must
    have changed AND moved OUT of the item-ID range (back to "none")."""
    return before_val != after_val and not is_item_value(after_val)


def narrow(candidates, before: dict, after: dict, keep_fn):
    return [addr for addr in candidates if keep_fn(before.get(addr), after.get(addr))]


def run_round(candidates, prompt_before: str, prompt_after: str, keep_fn, emit):
    input(prompt_before)
    before = snapshot(candidates)
    input(prompt_after)
    after = snapshot(candidates)
    kept = narrow(candidates, before, after, keep_fn)
    emit(f"  -> {len(kept)} of {len(candidates)} candidate(s) survived this round.")
    return kept, after


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

        input(
            f"\nMake sure you are NOT currently holding any item, then press Enter to scan "
            f"for int32 values in the idle window [{IDLE_MIN}, {IDLE_MAX}]..."
        )
        t0 = time.time()
        candidates = find_idle_candidates()
        emit(f"{len(candidates)} raw candidate(s) found in {time.time() - t0:.2f}s.")

        cycle = 0
        while candidates and len(candidates) > TARGET_CANDIDATES and cycle < MAX_CYCLES:
            cycle += 1
            emit(f"\n-- Cycle {cycle} ({len(candidates)} candidate(s) going in) --")

            candidates, _after = run_round(
                candidates,
                "Go pick up an item box (don't use it). Press Enter the moment you're holding something: ",
                "Keep holding it, wait a second, then press Enter: ",
                keep_changed_to_item,
                emit,
            )
            if not candidates:
                break

            candidates, _after = run_round(
                candidates,
                "Still holding it, don't touch anything. Press Enter in a couple seconds: ",
                "Keep waiting a couple more seconds, then press Enter again: ",
                keep_unchanged,
                emit,
            )
            if not candidates:
                break

            candidates, _after = run_round(
                candidates,
                "Now USE the item (press B). Press Enter right after you use it: ",
                "Press Enter again (just confirming it's settled): ",
                keep_left_item_range,
                emit,
            )

        if not candidates:
            emit("\nEvery candidate was eliminated -- none of them behaved like a real item slot. See the notes above for where they dropped out.")
            return

        final = snapshot(candidates)
        emit(f"\n{len(candidates)} candidate(s) survived {cycle} cycle(s):")
        for addr in candidates:
            emit(f"  0x{addr:08X}  current value = {final[addr]} ({item_name(final[addr])})")

        if len(candidates) == 1:
            emit(f"\nThis is almost certainly it: 0x{candidates[0]:08X}")
        else:
            emit(
                "\nStill more than one -- run this again, or keep cycling, to narrow further. "
                "A real pickup/use round should keep shrinking this list."
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
