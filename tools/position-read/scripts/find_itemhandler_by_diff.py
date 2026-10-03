#!/usr/bin/env python3
"""
Find the real address holding your single-player held-item state by direct
before/after memory diffing around one real, known pickup -- instead of
guessing a byte-shape and hoping it's unique.

Why this exists: auto_track_race.py's structural scan for ITEMHandler
(scan all of RAM for 14 back-to-back records that look like
item_box<=0x14, mode<=7, tail_mode in a small set, ack<=1, pad==0, then
require the bytes to actually change over ~1.2s, then prefer heap-likely
addresses) has now failed FIVE separate live tests in a row, each a
different way:
  1. hung for minutes (an unconstrained all-zero match flooded the verify
     step)
  2. found a static address deep in the Wii's OS-reserved memory
  3. found 0 candidates at all
  4. found a "heap-plausible, genuinely live" candidate (0x810F5E60) that
     still read constant Green Shell the whole race
  5. found a DIFFERENT "heap-plausible, genuinely live" candidate
     (0x810EE7A0) that ALSO still read constant Green Shell the whole race

(4) and (5) are the real signal: even passing every heuristic we've added
-- right shape, genuinely changing, in the same heap neighborhood as
Raceinfo's own object -- still isn't finding the real thing. The
byte-range shape filter just isn't a specific enough fingerprint; MKW's
heap apparently has other dynamically-changing objects that coincidentally
fit it too. Adding more heuristics on top of the same weak filter isn't
going to fix that.

This sidesteps the guessing problem entirely, the same way
Raceinfo::sInstance was ultimately pinned down: get one concrete,
known-true data point, then look for EXACTLY that, instead of hoping a
generic shape is unique. The known-true data point here is you telling
this script which item you're about to pick up and when.

Usage:
    python scripts/find_itemhandler_by_diff.py
Follow the prompts. It snapshots all of memory right before you grab a
specific item, snapshots again right after, and reports every address
whose byte changed to exactly that item's ID -- the real address should
be in that (hopefully short) list. Run it 2-3 times with DIFFERENT items
and look for the one address that shows up as an exact match every single
time -- that recurrence across different runs, with different target
values each time, is a much stronger confirmation than any one run alone.
Each run's result is also appended to item_diff_log.txt so you don't have
to keep the terminal scrollback around to compare them.
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

# Same neighborhood Raceinfo's own heap object has landed in across every
# race logged so far -- used only to SORT the results so the most likely
# real hit surfaces first, never to exclude anything.
HEAP_LIKELY_START = 0x81000000

ITEM_NAMES = {
    0x00: "green shell", 0x01: "red shell", 0x02: "banana", 0x03: "fake item box",
    0x04: "mushroom", 0x05: "triple mushroom", 0x06: "bob-omb", 0x07: "spiny shell",
    0x08: "lightning", 0x09: "star", 0x0A: "golden mushroom", 0x0B: "mega mushroom",
    0x0C: "blooper", 0x0D: "pow block", 0x0E: "thundercloud", 0x0F: "bullet bill",
    0x10: "triple green shell", 0x11: "triple red shell", 0x12: "triple banana",
}

LOG_PATH = Path(__file__).resolve().parent.parent / "item_diff_log.txt"


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
    """Reads all of REGIONS right now. Returns {start: bytes or None}."""
    out = {}
    for start, end in REGIONS:
        try:
            out[start] = dme.read_bytes(start, end - start)
        except Exception as exc:
            print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
            out[start] = None
    return out


def prompt_item_id() -> int:
    print("\nWhich item did you just pick up? Type its name (e.g. 'mushroom', 'green shell',")
    print("'star', 'banana', 'triple mushroom', ...), or its hex id if you already know it:")
    while True:
        raw = input("> ").strip().lower()
        if not raw:
            continue
        if raw.startswith("0x"):
            try:
                return int(raw, 16)
            except ValueError:
                pass
        for item_id, name in ITEM_NAMES.items():
            if raw == name or raw == name.replace(" ", "") or raw in name or name in raw:
                return item_id
        print("  Didn't recognize that -- try again, or type a hex id like 0x09 for star.")


def diff_regions(before, after, target_id):
    """Returns (exact, all_changes). exact: every address whose byte
    changed FROM something else TO precisely target_id. all_changes: every
    single byte that changed at all, for the fallback dump if exact is
    empty (which would mean the plain 0x00-0x12 enum assumption itself is
    wrong, not just the address)."""
    exact = []
    all_changes = []
    for start, _end in REGIONS:
        b0, b1 = before.get(start), after.get(start)
        if b0 is None or b1 is None or len(b0) != len(b1):
            continue
        arr0 = np.frombuffer(b0, dtype=np.uint8)
        arr1 = np.frombuffer(b1, dtype=np.uint8)
        diff_idx = np.nonzero(arr0 != arr1)[0]
        for i in diff_idx:
            addr = start + int(i)
            before_val, after_val = int(arr0[i]), int(arr1[i])
            all_changes.append((addr, before_val, after_val))
            if after_val == target_id:
                exact.append((addr, before_val, after_val))
    return exact, all_changes


def _sorted_by_heap_likely(entries):
    return sorted(entries, key=lambda e: (e[0] < HEAP_LIKELY_START, e[0]))


def main() -> None:
    hook_with_retry()
    print(
        "This finds the real address holding your held item by diffing a full memory\n"
        "snapshot from right before you pick one up against one from right after --\n"
        "no shape-guessing, just a direct before/after compare against a real pickup.\n"
        "\n"
        "For a clean first test: make sure you currently have NO item, then pick up a\n"
        "single (non-triple) item box. Be as fast as you can between the two prompts\n"
        "below -- the shorter that gap, the less unrelated memory churn (physics,\n"
        "camera, audio, ...) gets mixed into the diff.\n"
    )
    input("Get into a race, make sure you have no item, then press Enter right before you grab one... ")
    print("Snapshotting 'before'...")
    t0 = time.time()
    before = snapshot()

    input("Now grab it, and press Enter the INSTANT you have it... ")
    print("Snapshotting 'after'...")
    after = snapshot()
    elapsed = time.time() - t0

    target_id = prompt_item_id()
    target_name = ITEM_NAMES.get(target_id, f"id 0x{target_id:02X}")
    print(f"\n({elapsed:.1f}s between snapshots) Looking for bytes that changed to exactly "
          f"0x{target_id:02X} ({target_name})...")

    exact, all_changes = diff_regions(before, after, target_id)
    exact = _sorted_by_heap_likely(exact)

    lines = [f"\n=== run at {time.strftime('%Y-%m-%d %H:%M:%S')} -- target: {target_name} (0x{target_id:02X}), {elapsed:.1f}s gap ==="]

    if exact:
        heap_count = sum(1 for a, _, _ in exact if a >= HEAP_LIKELY_START)
        print(f"\n{len(exact)} address(es) changed to EXACTLY the right value "
              f"({heap_count} of them heap-likely, >= 0x{HEAP_LIKELY_START:08X}):")
        lines.append(f"{len(exact)} exact match(es) ({heap_count} heap-likely):")
        shown = exact[:60]
        for addr, b, a in shown:
            tag = " [heap-likely]" if addr >= HEAP_LIKELY_START else ""
            line = f"  0x{addr:08X}: 0x{b:02X} -> 0x{a:02X}{tag}"
            print(line)
            lines.append(line)
        if len(exact) > len(shown):
            print(f"  ... and {len(exact) - len(shown)} more (see {LOG_PATH.name} for the full list)")
        for addr, b, a in exact[len(shown):]:
            lines.append(f"  0x{addr:08X}: 0x{b:02X} -> 0x{a:02X}")
        print(
            "\nRun this again with a DIFFERENT item and compare: the real address should\n"
            "be an exact match BOTH times (with a different after-value matching each\n"
            "item), while coincidental matches are unlikely to repeat."
        )
    else:
        print(f"\nNo byte changed to exactly 0x{target_id:02X}. Showing all {len(all_changes)} byte(s) "
              "that changed at all (sorted heap-likely first), in case the real encoding isn't "
              "the plain 0x00-0x12 enum assumed here:")
        lines.append(f"0 exact matches. {len(all_changes)} total byte(s) changed:")
        shown = _sorted_by_heap_likely(all_changes)[:200]
        for addr, b, a in shown:
            tag = " [heap-likely]" if addr >= HEAP_LIKELY_START else ""
            line = f"  0x{addr:08X}: 0x{b:02X} -> 0x{a:02X}{tag}"
            print(line)
            lines.append(line)
        if len(all_changes) > len(shown):
            print(f"  ... and {len(all_changes) - len(shown)} more (full list in {LOG_PATH.name})")
        for addr, b, a in _sorted_by_heap_likely(all_changes)[len(shown):]:
            lines.append(f"  0x{addr:08X}: 0x{b:02X} -> 0x{a:02X}")

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
