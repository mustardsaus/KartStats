#!/usr/bin/env python3
"""
Find the real held-item address by watching ALL of RAM continuously over a
longer window, instead of diffing just two snapshots -- a direct response
to find_itemhandler_by_diff.py's result turning out to be wrong.

That tool's two-point before/after diff (one snapshot right before a
pickup, one right after, ~9-12s apart in the three test runs) found an
address, 0x802F3A14, that changed to the exact right item id in all three
runs. That looked like strong confirmation, but live testing showed it's
actually some fast-changing byte that flips on almost every single poll
tick regardless of what's happening on screen -- it cycled through nearly
every item in the enum within one race. A two-point diff over a многоsecond
gap can't tell "this is the real held-item state" apart from "this
happened to be a noisy/cycling byte that landed on the right value at the
instant we happened to look" -- and with thousands of noisy bytes in RAM,
that coincidence is a lot more likely than it sounds, especially across a
gap (9-12 seconds in the three test runs) long enough for a cycling
counter to pass through many values.

The fix: watch, don't snapshot-twice. This polls all of MEM1+MEM2
continuously for a while and tracks, for every address that ever shows a
value inside the real item range (0x00-0x12), its FULL history of changes
across the whole window -- not just one before/after pair. A real
held-item byte should change rarely (a handful of times -- once per
pickup, once per use) and sit still in between for whole seconds at a
time. A coincidentally-matching noisy byte will show up with dozens or
hundreds of changes in the same window. Sorting candidates by "fewest
total changes" puts the real one (if it shows up at all) at or near the
top, and the noise at the bottom where it's obviously disqualified by eye.

Usage:
    python scripts/watch_held_item_candidates.py
Follow the prompts. For a clean test: once it says it's watching, play
deliberately and SLOWLY -- pick up one item, hold it for a few seconds
WITHOUT using it, then use/throw it, wait a few seconds with no item, then
pick up a DIFFERENT item, and repeat 2-3 times. Long, clearly-separated
pauses between actions are what let a real signal stand out from noise in
the results. Runs for WATCH_DURATION_S seconds (Ctrl+C to stop early and
still see results so far). Results are also appended to
item_watch_log.txt.
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

WATCH_DURATION_S = 45.0

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
        "This watches ALL of RAM continuously (not just a before/after pair) and tracks\n"
        "every address that shows a plausible item id, scored by how OFTEN it changes --\n"
        "a real held-item byte should barely move; a noisy false positive will change\n"
        "constantly regardless of what you're actually doing.\n"
        "\n"
        f"Once it starts, you'll have about {WATCH_DURATION_S:.0f} seconds. Play SLOWLY and\n"
        "deliberately: pick up one item, hold it a few seconds WITHOUT using it, then\n"
        "use/throw it, wait a few seconds with no item, then pick up a DIFFERENT item --\n"
        "repeat that 2-3 times if you can. Long, clearly separated pauses between actions\n"
        "make the real signal obvious against the noise. Ctrl+C any time to stop early and\n"
        "still see the results so far.\n"
    )
    input("Press Enter when you're in a race and ready to start... ")

    tracked = {}  # addr -> [(elapsed_s, value), ...] -- only addresses that have ever
                  # shown a value in [ITEM_MIN, ITEM_MAX] get tracked at all
    t_start = time.time()
    prev = snapshot()
    ticks = 0

    try:
        while time.time() - t_start < WATCH_DURATION_S:
            time.sleep(0.4)
            cur = snapshot()
            elapsed = time.time() - t_start
            for start, _end in REGIONS:
                a0, a1 = prev.get(start), cur.get(start)
                if a0 is None or a1 is None or len(a0) != len(a1):
                    continue
                diff_idx = np.nonzero(a0 != a1)[0]
                for i in diff_idx:
                    addr = start + int(i)
                    new_val = int(a1[i])
                    if addr in tracked:
                        tracked[addr].append((round(elapsed, 1), new_val))
                    elif ITEM_MIN <= new_val <= ITEM_MAX:
                        tracked[addr] = [(round(elapsed, 1), new_val)]
            prev = cur
            ticks += 1
            print(f"  ...watching, {elapsed:.0f}s elapsed, {ticks} tick(s), "
                  f"{len(tracked)} address(es) seen in range so far", end="\r", flush=True)
    except KeyboardInterrupt:
        print()

    elapsed_total = time.time() - t_start
    print(f"\n\nWatched for {elapsed_total:.1f}s across {ticks} tick(s).")

    candidates = sorted(tracked.items(), key=lambda kv: len(kv[1]))

    lines = [f"\n=== watch run at {time.strftime('%Y-%m-%d %H:%M:%S')} -- {elapsed_total:.1f}s, {ticks} tick(s) ==="]

    if not candidates:
        msg = "No address ever showed a value in the real item range at all during this window."
        print(msg)
        lines.append(msg)
    else:
        print(
            f"\n{len(candidates)} address(es) showed a plausible item value at some point, "
            "sorted by FEWEST total changes first (most likely real) to most (most likely noise):\n"
        )
        lines.append(f"{len(candidates)} candidate(s), sorted by fewest changes first:")
        for addr, hist in candidates[:40]:
            tag = " [heap-likely]" if addr >= HEAP_LIKELY_START else ""
            hist_desc = ", ".join(
                f"{t}s:{ITEM_NAMES.get(v, f'0x{v:02X}')}" for t, v in hist[:12]
            )
            more = f" (+{len(hist) - 12} more)" if len(hist) > 12 else ""
            line = f"  0x{addr:08X}{tag}  -- {len(hist)} change(s) total -- {hist_desc}{more}"
            print(line)
            lines.append(line)
        if len(candidates) > 40:
            print(f"  ... and {len(candidates) - 40} more (full list in {LOG_PATH.name})")
        for addr, hist in candidates[40:]:
            hist_desc = ", ".join(f"{t}s:{ITEM_NAMES.get(v, f'0x{v:02X}')}" for t, v in hist)
            lines.append(f"  0x{addr:08X}  -- {len(hist)} change(s) total -- {hist_desc}")

        print(
            "\nA real held-item address should have roughly 2 changes per item you actually\n"
            "picked up and used (one for the pickup, one for the use/throw), with its\n"
            "timestamps lining up with when you actually did those things. Anything with\n"
            "dozens of changes packed into this short a window is noise, not your held item."
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
