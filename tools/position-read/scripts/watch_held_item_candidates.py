#!/usr/bin/env python3
"""
Find the real held-item address by looking for a SUSTAINED, UNCHANGED
value in the item range -- a third rewrite, after both earlier approaches
failed in live testing and the second one needed precise Enter-keypress
timing that turned out to be impractical to do while actually playing.

History of what's failed so far:
  1. find_itemhandler_by_diff.py: one before/after snapshot pair, 9-12s
     apart. "Confirmed" an address across three runs with three different
     target items -- but it turned out to fire on almost every poll tick
     regardless of what was happening on screen. A two-point diff can't
     tell "real, rarely-changing held item" apart from "coincidentally
     landed on the right value because it's noisy", and that coincidence
     lining up 3 times wasn't as unlikely as it looked.
  2. This file's first version: continuous watching, scored by "fewest
     total changes", no concept of WHEN a real event happened. Hopeless:
     apparently a huge fraction of all 88MB of MEM1+MEM2 changes within
     even a few seconds of normal gameplay, and with 19 valid item ids
     out of 256 possible byte values, pure chance guarantees a massive
     number of addresses pass through the item range sooner or later. A
     7.3-SECOND run produced 528,032 "candidates" and an 1.8GB log file.
  3. This file's second version: same idea, but correlated against
     real-time Enter-keypress marks (press Enter the instant you pick up
     or use an item). This fixed the noise-flood problem structurally,
     but asking for frame-accurate keypresses while actually driving and
     playing turned out to not be a reasonable ask.

This version needs no marking at all -- it uses a property of the real
held-item state itself: once you pick something up, the byte should sit
on that EXACT value, completely unchanged, until you use or throw it --
which in practice means SECONDS, not milliseconds. Coincidental noise
(audio, physics, textures) churns through values constantly and
essentially never freezes on one specific byte for that long by accident.
So instead of asking "did this address ever touch the item range" (which
is true for hundreds of thousands of addresses), this asks "did this
address change INTO the item range and then stay COMPLETELY STILL for at
least MIN_STREAK_S seconds" -- a far rarer, far stronger signal, and one
that falls directly out of just playing normally and not insta-using
every item the instant you get it.

Usage:
    python scripts/watch_held_item_candidates.py
Get into a race (sitting in last place with nothing to do but grab items
is ideal -- no need to actually race while this runs). Just play: when
you pick up an item, hold onto it for a couple of SECONDS before using or
throwing it, then grab another, and repeat a few times if you can. No
keys to press, no precise timing -- just don't instant-use everything.
Runs for WATCH_DURATION_S seconds, or Ctrl+C to stop early and still see
results so far. Results append to item_watch_log.txt (capped in length
this time, so it can't repeat the 1.8GB blowup from version 2 above).
"""

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

try:
    import dolphin_memory_engine as dme
except ImportError:
    print(
        "dolphin_memory_engine isn't installed. From tools/position-read, run:\n"
        "  python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

REGIONS = [
    (0x80000000, 0x81800000),  # MEM1, 24MB
    (0x90000000, 0x94000000),  # MEM2, 64MB
]

HEAP_LIKELY_START = 0x81000000

WATCH_DURATION_S = 60.0
POLL_INTERVAL_S = 0.4

# How long (in seconds) a value has to sit completely unchanged after
# transitioning into the item range to count as "sustained" rather than a
# coincidental blip. 2 seconds is well beyond what a single frame of
# incidental churn would produce, but short enough that even a quick
# "grab it, glance at it, use it" still gets caught.
MIN_STREAK_S = 2.0
MIN_STREAK_TICKS = max(1, round(MIN_STREAK_S / POLL_INTERVAL_S))

# Cap how much this prints/logs, however many addresses qualify -- direct
# response to version 2 of this file writing a 1.8GB log from an unbounded
# candidate list. This filter should already produce far fewer hits, but
# capped defensively regardless.
MAX_REPORTED = 60

ITEM_NAMES = {
    0x00: "green shell", 0x01: "red shell", 0x02: "banana", 0x03: "fake item box",
    0x04: "mushroom", 0x05: "triple mushroom", 0x06: "bob-omb", 0x07: "spiny shell",
    0x08: "lightning", 0x09: "star", 0x0A: "golden mushroom", 0x0B: "mega mushroom",
    0x0C: "blooper", 0x0D: "pow block", 0x0E: "thundercloud", 0x0F: "bullet bill",
    0x10: "triple green shell", 0x11: "triple red shell", 0x12: "triple banana",
}
ITEM_MIN, ITEM_MAX = 0x00, 0x12

LOG_PATH = Path(__file__).resolve().parent.parent / "item_watch_log.txt"


def hook_with_retry(timeout_s: float = 30.0) -> None:
    print("Hooking into Dolphin...")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        dme.hook()
        if dme.is_hooked():
            print("Hooked.\n")
            return
        time.sleep(1)
    print("Could not hook into Dolphin. Is it running with a game loaded?", file=sys.stderr)
    sys.exit(1)


def snapshot():
    """Reads all of REGIONS right now. Returns {start: np.uint8 array or None}."""
    out = {}
    for start, end in REGIONS:
        try:
            out[start] = np.frombuffer(dme.read_bytes(start, end - start), dtype=np.uint8)
        except Exception as exc:
            print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
            out[start] = None
    return out


def main() -> None:
    hook_with_retry()
    print(
        "This looks for an address that changes INTO the item range and then sits\n"
        "COMPLETELY UNCHANGED for a couple of seconds -- what holding a real item\n"
        "actually looks like. No keys to press, no precise timing needed.\n"
        "\n"
        f"Once it starts, you'll have about {WATCH_DURATION_S:.0f} seconds. Just play: when you\n"
        "pick up an item, hold onto it for a couple of SECONDS before using or throwing\n"
        "it (instead of insta-using it), then grab another and repeat a few times if you\n"
        "can. Sitting in last place with nothing else to do is fine -- you don't need to\n"
        "actually race while this runs. Ctrl+C any time to stop early and still see\n"
        "results so far.\n"
    )
    input("Press Enter when you're in a race and ready to start the clock... ")

    t_start = time.time()
    prev = snapshot()
    ticks = 0

    # addr -> (value, start_tick) for an address CURRENTLY sitting on an
    # in-range value since start_tick, not yet having changed away from it.
    active = {}
    # Completed sustained streaks: (addr, value, start_tick, end_tick).
    completed = []

    def maybe_complete(addr, value, start_tick, end_tick):
        if end_tick - start_tick >= MIN_STREAK_TICKS and len(completed) < MAX_REPORTED * 4:
            completed.append((addr, value, start_tick, end_tick))

    try:
        while time.time() - t_start < WATCH_DURATION_S:
            time.sleep(POLL_INTERVAL_S)
            cur = snapshot()
            ticks += 1
            for start, _end in REGIONS:
                a0, a1 = prev.get(start), cur.get(start)
                if a0 is None or a1 is None or len(a0) != len(a1):
                    continue
                diff_idx = np.nonzero(a0 != a1)[0]
                for i in diff_idx:
                    addr = start + int(i)
                    new_val = int(a1[i])
                    if addr in active:
                        old_val, start_tick = active.pop(addr)
                        maybe_complete(addr, old_val, start_tick, ticks)
                    if ITEM_MIN <= new_val <= ITEM_MAX:
                        active[addr] = (new_val, ticks)
            prev = cur
            print(f"  ...watching, {ticks * POLL_INTERVAL_S:.0f}s elapsed, {ticks} tick(s), "
                  f"{len(active)} address(es) currently sitting in range, "
                  f"{len(completed)} sustained streak(s) so far", end="\r", flush=True)
    except KeyboardInterrupt:
        print()

    elapsed_total = time.time() - t_start
    # Anything still active at the end that's already been sitting still
    # long enough also counts -- you may just not have used that last item
    # yet before time ran out.
    for addr, (value, start_tick) in active.items():
        maybe_complete(addr, value, start_tick, ticks)

    print(f"\n\nWatched for {elapsed_total:.1f}s across {ticks} tick(s) "
          f"(~{POLL_INTERVAL_S:.1f}s/tick, {MIN_STREAK_TICKS} ticks = sustained).")

    lines = [f"\n=== watch run at {time.strftime('%Y-%m-%d %H:%M:%S')} -- {elapsed_total:.1f}s, {ticks} tick(s) ==="]

    if not completed:
        msg = (
            f"No address sat unchanged in the item range for {MIN_STREAK_S:.0f}+ seconds. "
            "Try holding an item for longer before using it, or increase MIN_STREAK_S if "
            "you were already doing that."
        )
        print(msg)
        lines.append(msg)
    else:
        completed.sort(key=lambda c: -(c[3] - c[2]))  # longest streak first
        print(f"\n{len(completed)} sustained streak(s) found, longest first:\n")
        lines.append(f"{len(completed)} sustained streak(s), longest first:")
        for addr, value, start_tick, end_tick in completed[:MAX_REPORTED]:
            tag = " [heap-likely]" if addr >= HEAP_LIKELY_START else ""
            duration = (end_tick - start_tick) * POLL_INTERVAL_S
            name = ITEM_NAMES.get(value, f"0x{value:02X}")
            line = (
                f"  0x{addr:08X}{tag}  -- held {name} for {duration:.1f}s "
                f"(ticks {start_tick}-{end_tick}, ~{start_tick * POLL_INTERVAL_S:.0f}s-"
                f"{end_tick * POLL_INTERVAL_S:.0f}s into the run)"
            )
            print(line)
            lines.append(line)
        if len(completed) > MAX_REPORTED:
            print(f"  ... and {len(completed) - MAX_REPORTED} more, not shown (also not logged, to keep this file small)")
            lines.append(f"  ... and {len(completed) - MAX_REPORTED} more, not shown")
        print(
            "\nThe address with the longest sustained hold, especially if its timing roughly\n"
            "matches when you actually held something that long, is the strongest candidate.\n"
            "If the SAME address shows up with a long streak across more than one run, that's\n"
            "even stronger confirmation."
        )

    try:
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\nAppended this run's results to {LOG_PATH}")
    except Exception as exc:
        print(f"\n(couldn't write {LOG_PATH}: {exc})")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
