#!/usr/bin/env python3
"""
Find the real held-item address by correlating memory changes against
real-time markers YOU provide -- a second rewrite, after the first one
(pure "changes rarely" scoring, no event correlation) turned out to still
be hopeless.

History of what's failed so far:
  1. find_itemhandler_by_diff.py: one before/after snapshot pair, 9-12s
     apart. "Confirmed" 0x802F3A14 across three runs with three different
     target items -- but live testing showed that address fires on almost
     every poll tick regardless of what's happening on screen. A two-point
     diff over a multi-second gap can't tell "real, rarely-changing held
     item" apart from "coincidentally landed on the right value because
     it's noisy/cycling" -- and apparently that coincidence lining up 3
     separate times wasn't actually as unlikely as it looked.
  2. This file's first version: no snapshot pair, just continuous
     watching, scored by "fewest total changes". Also hopeless, for a
     more basic reason: a live race apparently has a HUGE fraction of all
     88MB of MEM1+MEM2 changing at some point within even a few seconds
     (textures, audio, physics -- everything). With 19 valid item ids out
     of 256 possible byte values (~7.4%), pure chance alone guarantees a
     massive number of addresses will pass through the item range at some
     point. Live testing confirmed it badly: a 7.3-SECOND run produced
     528,032 "candidates" and an 1.8GB log file. "Rarely changes" cannot
     distinguish real from noise when the noise floor is this dense --
     most of those 528,032 addresses only changed once too.

The actual missing ingredient isn't a smarter filter over passive
observation -- it's ground truth about WHEN a real event happened, with
enough precision to rule out the flood of unrelated coincidental matches.
This version gets that directly from you: a background thread listens for
Enter keypresses while the main loop keeps polling memory, and every
Enter press records a timestamp ("I just did something -- pickup or
use/throw, doesn't matter which"). Only memory changes that land within
MARK_WINDOW_S of an actual marked moment get kept at all -- everything
else is thrown away as it's seen, which also keeps this from blowing up
into another gigabyte-sized log. A real held-item address should then
have a change near EVERY SINGLE mark (ideally all of them), while a
coincidental false positive would have to get lucky on every single mark
to look the same -- a much harder bar to clear by chance than "changes
rarely" ever was.

Usage:
    python scripts/watch_held_item_candidates.py
Follow the prompts, then: get into a race, start the watch, and press
Enter the INSTANT you pick up an item, and again the INSTANT you use or
throw it. Keep doing that for every item you interact with -- the more
marks, the sharper the result. Nothing else needs typing before Enter,
just press it bare. Runs for WATCH_DURATION_S seconds or Ctrl+C to stop
early. Results (and a record of your marks) are appended to
item_watch_log.txt.
"""

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

# How close (in seconds) a memory change has to land to one of your Enter
# marks to count at all -- covers both your own reaction-time slop and
# this tool's own polling granularity (POLL_INTERVAL_S). Wide enough to
# not miss the real event, narrow enough that the flood of unrelated
# background noise mostly doesn't happen to fall inside every window.
MARK_WINDOW_S = 1.5

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


def _mark_listener(t_start: float, marks: list, marks_lock: threading.Lock, stop_event: threading.Event):
    """Runs in a background thread for the whole watch window: every bare
    Enter press gets timestamped (relative to t_start) and appended to
    marks. Daemon thread -- if the main thread exits first (timeout or
    Ctrl+C) this just gets dropped, no cleanup needed. input() itself
    can't be interrupted from outside once it's blocking on a read, which
    is fine here: it only ever blocks waiting for YOU to press Enter."""
    while not stop_event.is_set():
        try:
            input()
        except EOFError:
            return
        elapsed = time.time() - t_start
        with marks_lock:
            marks.append(round(elapsed, 2))
        print(f"  [marked -- {elapsed:.1f}s]", flush=True)


def main() -> None:
    hook_with_retry()
    print(
        "This correlates memory changes against real markers YOU provide, instead of\n"
        "guessing from passive behavior alone (two earlier attempts at that both failed --\n"
        "see this file's docstring for why).\n"
        "\n"
        f"Once it starts, you'll have about {WATCH_DURATION_S:.0f} seconds. Press Enter (just\n"
        "Enter, nothing else) the INSTANT you pick up an item, and again the INSTANT you\n"
        "use or throw it. Do that for every item you interact with -- more marks sharpen\n"
        "the result. Ctrl+C any time to stop early and still see results so far.\n"
    )
    input("Press Enter when you're in a race and ready to start the clock... ")

    marks = []
    marks_lock = threading.Lock()
    stop_event = threading.Event()
    t_start = time.time()

    listener = threading.Thread(target=_mark_listener, args=(t_start, marks, marks_lock, stop_event), daemon=True)
    listener.start()

    # addr -> list of (elapsed_s, value) -- only ever grows for a change that
    # landed within MARK_WINDOW_S of a mark that existed by the time of that
    # change; everything else is discarded on the spot, which is what keeps
    # this from repeating the 528,000-candidate/1.8GB blowup of the last
    # version.
    tracked = {}
    prev = snapshot()
    ticks = 0

    try:
        while time.time() - t_start < WATCH_DURATION_S:
            time.sleep(POLL_INTERVAL_S)
            cur = snapshot()
            elapsed = time.time() - t_start
            with marks_lock:
                recent_marks = [m for m in marks if elapsed - MARK_WINDOW_S <= m <= elapsed + MARK_WINDOW_S]
            if recent_marks:
                for start, _end in REGIONS:
                    a0, a1 = prev.get(start), cur.get(start)
                    if a0 is None or a1 is None or len(a0) != len(a1):
                        continue
                    diff_idx = np.nonzero(a0 != a1)[0]
                    for i in diff_idx:
                        new_val = int(a1[i])
                        if ITEM_MIN <= new_val <= ITEM_MAX:
                            addr = start + int(i)
                            tracked.setdefault(addr, []).append((round(elapsed, 2), new_val))
            prev = cur
            ticks += 1
            with marks_lock:
                mark_count = len(marks)
            print(f"  ...watching, {elapsed:.0f}s elapsed, {ticks} tick(s), {mark_count} mark(s), "
                  f"{len(tracked)} candidate(s) so far", end="\r", flush=True)
    except KeyboardInterrupt:
        print()

    stop_event.set()
    elapsed_total = time.time() - t_start
    with marks_lock:
        final_marks = list(marks)
    print(f"\n\nWatched for {elapsed_total:.1f}s across {ticks} tick(s), {len(final_marks)} mark(s): "
          f"{', '.join(f'{m}s' for m in final_marks) or '(none -- you never pressed Enter, so nothing could be correlated)'}")

    def match_count(hist):
        """How many of this address's own changes land within MARK_WINDOW_S
        of SOME mark -- should equal len(hist) for a real candidate, since
        every entry in hist already passed that test once at collection
        time; recomputed here mainly to rank by, now that we also know the
        FINAL mark list (a change collected using an early, incomplete view
        of `marks` still used the real-time list at that moment, so this is
        consistent, just re-derived for sorting clarity)."""
        return sum(1 for t, _v in hist if any(abs(t - m) <= MARK_WINDOW_S for m in final_marks))

    candidates = []
    for addr, hist in tracked.items():
        hist.sort()
        matched = match_count(hist)
        candidates.append((addr, hist, matched))
    # Best first: matches the most marks, with the fewest leftover/extra
    # changes beyond that (a real address should have #changes ~= #marks;
    # one with far more than len(final_marks) is picking up extra noise
    # that merely happens to also fall inside a mark window).
    candidates.sort(key=lambda c: (-c[2], len(c[1])))

    lines = [
        f"\n=== watch run at {time.strftime('%Y-%m-%d %H:%M:%S')} -- {elapsed_total:.1f}s, {ticks} tick(s) ===",
        f"marks: {final_marks}",
    ]

    if not final_marks:
        msg = "No marks recorded -- press Enter during the watch next time so changes can be correlated."
        print(msg)
        lines.append(msg)
    elif not candidates:
        msg = "No address changed to a plausible item value near any mark. Try a longer MARK_WINDOW_S, or check item ids aren't 0x00-0x12 after all."
        print(msg)
        lines.append(msg)
    else:
        print(
            f"\n{len(candidates)} address(es) changed near at least one mark, best match first "
            f"(you made {len(final_marks)} mark(s) -- a real address should be close to matching ALL of them):\n"
        )
        lines.append(f"{len(candidates)} candidate(s), best match first (target: {len(final_marks)} marks):")
        for addr, hist, matched in candidates[:30]:
            tag = " [heap-likely]" if addr >= HEAP_LIKELY_START else ""
            hist_desc = ", ".join(f"{t}s:{ITEM_NAMES.get(v, f'0x{v:02X}')}" for t, v in hist[:15])
            more = f" (+{len(hist) - 15} more)" if len(hist) > 15 else ""
            line = (
                f"  0x{addr:08X}{tag}  -- matched {matched}/{len(final_marks)} mark(s), "
                f"{len(hist)} change(s) total -- {hist_desc}{more}"
            )
            print(line)
            lines.append(line)
        if len(candidates) > 30:
            print(f"  ... and {len(candidates) - 30} more (full list in {LOG_PATH.name})")
        for addr, hist, matched in candidates[30:]:
            hist_desc = ", ".join(f"{t}s:{ITEM_NAMES.get(v, f'0x{v:02X}')}" for t, v in hist)
            lines.append(
                f"  0x{addr:08X}  -- matched {matched}/{len(final_marks)} mark(s), "
                f"{len(hist)} change(s) total -- {hist_desc}"
            )
        print(
            "\nLook for an address matching ALL or nearly all of your marks, with a change\n"
            "count close to the number of marks (not far more) -- that's the strongest\n"
            "candidate. If nothing matches all of them, the top few are still worth trying\n"
            "directly before assuming this needs another rework."
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
