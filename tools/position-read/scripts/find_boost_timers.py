#!/usr/bin/env python3
"""
Finds real PlayerSub10 boost-timer addresses (star/shock/mega) by their
BEHAVIOR -- a monotonic frame-countdown from a fresh peak down to zero --
instead of chasing the documented PlayerHolder::sInstance pointer chain,
which (like Raceinfo::sInstance and ITEMHandler::sInstance before it) is
not trusted to match this build's real addresses without empirical
verification first.

Why this exists -- the user's own idea: every attempt so far has gone
straight at the held-item byte itself (static addresses, pointer chases,
content shape-scans, sustained-streak watching) and WHATEVER THE RIGHT
ANSWER TURNS OUT TO BE, it has to be read by something that also *acts*
on it -- specifically, picking up a mushroom/star/mega mushroom/lightning
makes the kart visibly faster or does something else physical. If we can
reliably find THAT effect in memory, its exact trigger moment becomes a
precise, automatic, zero-guesswork timestamp for "an item was just
consumed" -- far better than a human's Enter keypress (version 2,
imprecise) or hoping a byte just happens to sit still long enough
(version 3, swamped with coincidental noise). That timestamp can then
drive a tight before/after diff (a future script) to catch whatever ELSE
changes on that exact tick, including -- very plausibly -- the real
item-consumption byte itself.

Where the field names/offsets below come from: mkw-structures'
player.h (the same reverse-engineering source already cited throughout
this project for RaceinfoPlayer/ITEMPacket). It documents, inside
PlayerSub10 (reached from Player via playerSub+0x10 -> playerSub10+0xc,
a chain never tested this session):
  int16_t starTimer   @ PlayerSub10+0x18A  -- Star invincibility
  int16_t shockTimer  @ PlayerSub10+0x18C  -- Lightning/TC/Zapper shock
  int16_t MegaTimer   @ PlayerSub10+0x194  -- Mega Mushroom
  PlayerBoost boost   @ PlayerSub10+0x110  -- mushroom/MT/trick boosts
    float multiplier  @ boost+0x10 (so PlayerSub10+0x120)

Rather than trust the documented PlayerHolder::sInstance pointer chain
(0x809c18f8, published -- per this project's established pattern with
Raceinfo and ITEMHandler, likely NOT this build's real address), this
scans ALL of RAM directly for the BEHAVIOR a real frame-counter timer
has: it jumps up to a fresh peak, then decreases EVERY single poll,
never increasing, until it hits zero, all within a plausible total
duration for the shortest (shock, ~3s) to longest (star/mega, ~8-10s)
of these effects. That's an extremely specific pattern -- a real
monotonic multi-second countdown essentially never happens by chance in
unrelated memory, unlike a single byte landing in a narrow enum range
(which is exactly what doomed every item-byte attempt so far).

Once a candidate is found, it's cross-checked against the documented
PlayerSub10 layout: if this really is starTimer, then
candidate_addr - 0x18A should be PlayerSub10's base, which means
candidate_addr - 0x18A + 0x120 should currently hold a plausible boost
multiplier float (roughly 0.5-3.0) -- a second, independent structural
signature that coincidental noise is very unlikely to also satisfy.

Usage:
    python scripts/find_boost_timers.py
Get into a race. Just play, and use a star, lightning, or mega mushroom
if you get the chance (mushrooms work too but their boost is short and
noisier to isolate -- star/mega/shock are the cleanest signal). No
precise timing needed. Runs for WATCH_DURATION_S seconds, then asks you
to roughly recall when you used each one (same no-pressure recall as
watch_held_item_candidates.py). Results append to boost_timer_log.txt.
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
POLL_INTERVAL_S = 0.2

# A fresh timer has to jump to at least this value to count as "armed" --
# high enough to reject small incidental blips, low enough to still catch
# the shortest real effect (shock, roughly 3s of frames).
PEAK_MIN = 15

# A completed countdown's total duration must fall in this window to be
# reported. Shock is the shortest real effect here (~3s); star/mega run
# longer (~8-10s). Generous on both ends since we're sampling, not
# frame-perfect.
MIN_DURATION_S = 0.4
MAX_DURATION_S = 15.0

RETENTION_CAP = 20000
PRINT_CAP = 80
LOG_CAP = 3000
MARK_TOLERANCE_S = 2.5

# mkw-structures player.h: PlayerSub10's starTimer/shockTimer/MegaTimer
# and PlayerBoost.multiplier, all relative to a candidate starTimer-like
# address (treated as the "base" for this cross-check regardless of
# which specific timer we actually found -- see _structural_tag).
OFF_STAR_FROM_STAR = 0x0
OFF_SHOCK_FROM_STAR = 0x2
OFF_MEGA_FROM_STAR = 0xA
OFF_BOOST_MULTIPLIER_FROM_STAR = 0x120 - 0x18A  # = -0x6A

LOG_PATH = Path(__file__).resolve().parent.parent / "boost_timer_log.txt"


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
    """Reads all of REGIONS right now as big-endian int16 arrays (2-byte
    aligned, matching how a real int16_t struct field is laid out on the
    Wii's PowerPC/big-endian memory). Returns {start: np.int16 array or
    None}."""
    out = {}
    for start, end in REGIONS:
        try:
            raw = dme.read_bytes(start, end - start)
            out[start] = np.frombuffer(raw, dtype=">i2").astype(np.int32)
        except Exception as exc:
            print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
            out[start] = None
    return out


def _read_i16(addr: int):
    try:
        return int.from_bytes(dme.read_bytes(addr, 2), byteorder="big", signed=True)
    except Exception:
        return None


def _read_f32(addr: int):
    try:
        import struct
        return struct.unpack(">f", dme.read_bytes(addr, 4))[0]
    except Exception:
        return None


def structural_tag(star_candidate_addr: int) -> str:
    """Cross-checks the documented PlayerSub10 constellation around a
    candidate, TREATING IT AS IF IT WERE starTimer regardless of which
    timer actually triggered the detection (shock/mega candidates are
    offset accordingly by the caller before calling this). Informational
    only -- never used to exclude a candidate, since this build's real
    offsets might not exactly match the documented ones (same caveat
    that bit the ITEMHandler::sInstance relocation-delta prediction)."""
    shock = _read_i16(star_candidate_addr + OFF_SHOCK_FROM_STAR)
    mega = _read_i16(star_candidate_addr + OFF_MEGA_FROM_STAR)
    mult = _read_f32(star_candidate_addr + OFF_BOOST_MULTIPLIER_FROM_STAR)
    bits = []
    if shock is not None and -2 <= shock <= 2000:
        bits.append(f"shock-offset plausible (0x{shock & 0xFFFF:04X})")
    if mega is not None and -2 <= mega <= 2000:
        bits.append(f"mega-offset plausible (0x{mega & 0xFFFF:04X})")
    if mult is not None and 0.3 <= mult <= 5.0:
        bits.append(f"boost.multiplier offset plausible ({mult:.2f})")
    return "; ".join(bits) if bits else "no nearby fields looked plausible"


def prompt_boost_marks() -> list:
    print(
        "\nRoughly when did you use a star, lightning, mega mushroom, or mushroom this run?\n"
        "Ballpark seconds into the run, comma-separated (e.g. '6, 14.5'). Enter to skip."
    )
    raw = input("> ").strip()
    if not raw:
        return []
    marks = []
    for piece in raw.replace(",", " ").split():
        try:
            marks.append(float(piece))
        except ValueError:
            print(f"  (ignoring '{piece}', not a number)")
    return marks


def matched_marks_for(start_s: float, end_s: float, marks: list) -> list:
    lo, hi = start_s - MARK_TOLERANCE_S, end_s + MARK_TOLERANCE_S
    return [m for m in marks if lo <= m <= hi]


def aggregate_matches_by_address(completed: list, marks: list) -> list:
    """Same reasoning as watch_held_item_candidates.py's version: union
    the marks matched across ALL of an address's completed countdowns,
    not just one at a time, since a real timer fires once per use, not
    once continuously."""
    by_addr = {}
    for addr, peak, start_tick, end_tick in completed:
        by_addr.setdefault(addr, []).append((peak, start_tick, end_tick))
    results = []
    for addr, streaks in by_addr.items():
        matched = set()
        per_streak_hits = []
        for peak, start_tick, end_tick in streaks:
            start_s, end_s = start_tick * POLL_INTERVAL_S, end_tick * POLL_INTERVAL_S
            hits = matched_marks_for(start_s, end_s, marks)
            if hits:
                matched.update(hits)
                per_streak_hits.append((peak, start_tick, end_tick, hits))
        if matched:
            longest_s = max((et - st) * POLL_INTERVAL_S for _p, st, et in streaks)
            results.append((addr, matched, per_streak_hits, longest_s))
    results.sort(key=lambda r: (-len(r[1]), -len(r[2]), -r[3]))
    return results


def process_transition(active: dict, addr: int, old_val: int, new_val: int, tick: int, on_complete) -> None:
    """Applies one address's old->new value transition to the countdown
    state machine. Pulled out of main()'s loop so the state machine
    itself -- the part that actually decides what counts as a real
    countdown -- can be unit-tested with plain ints, no numpy/dme/sleep
    mocking required.

    `active` is mutated in place: addr -> (peak_value, start_tick,
    last_value) for a countdown currently in progress. `on_complete`
    is called as on_complete(addr, peak, start_tick, end_tick) when a
    countdown finishes by reaching exactly zero; the caller decides
    whether to actually keep it (duration window, retention cap)."""
    state = active.get(addr)
    if state is not None:
        peak, start_tick, last_val = state
        if new_val <= last_val and new_val >= 0:
            if new_val == 0:
                on_complete(addr, peak, start_tick, tick)
                del active[addr]
            else:
                active[addr] = (peak, start_tick, new_val)
            return
        else:
            # Went back up, or negative -- not a clean countdown. Drop
            # it, then fall through to see if THIS tick's jump re-arms
            # it as a brand new countdown.
            del active[addr]
    if new_val >= PEAK_MIN and new_val > old_val:
        active[addr] = (new_val, tick, new_val)


def main() -> None:
    hook_with_retry()
    print(
        "This looks for a real frame-countdown timer -- a value that jumps to a fresh\n"
        "peak then decreases EVERY poll, never going back up, until it hits zero. That's\n"
        "the behavioral signature of star/shock/mega-mushroom timers, and it's a far\n"
        "more specific pattern than anything tried on the item byte directly so far.\n"
        "\n"
        f"You'll have about {WATCH_DURATION_S:.0f} seconds. Just play, and use a star, lightning,\n"
        "mega mushroom, or mushroom if you get the chance -- star/mega/lightning give the\n"
        "cleanest signal since they last longer. No precise timing needed; you'll be\n"
        "asked to roughly recall when afterward. Ctrl+C any time to stop early.\n"
    )
    input("Press Enter when you're in a race and ready to start the clock... ")

    t_start = time.time()
    prev = snapshot()
    ticks = 0

    # addr -> (peak_value, start_tick, last_value) for a countdown
    # currently in progress (armed and strictly non-increasing so far).
    active = {}
    completed = []

    def maybe_complete(addr, peak, start_tick, end_tick):
        if MIN_DURATION_S <= (end_tick - start_tick) * POLL_INTERVAL_S <= MAX_DURATION_S and len(completed) < RETENTION_CAP:
            completed.append((addr, peak, start_tick, end_tick))

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
                    addr = start + int(i) * 2
                    old_val, new_val = int(a0[i]), int(a1[i])
                    process_transition(active, addr, old_val, new_val, ticks, maybe_complete)
            prev = cur
            print(f"  ...watching, {ticks * POLL_INTERVAL_S:.0f}s elapsed, {ticks} tick(s), "
                  f"{len(active)} countdown(s) in progress, "
                  f"{len(completed)} completed", end="\r", flush=True)
    except KeyboardInterrupt:
        print()

    elapsed_total = time.time() - t_start
    print(f"\n\nWatched for {elapsed_total:.1f}s across {ticks} tick(s).")
    if len(completed) >= RETENTION_CAP:
        print(f"(hit the retention cap of {RETENTION_CAP})")

    marks = prompt_boost_marks()
    lines = [f"\n=== boost-timer run at {time.strftime('%Y-%m-%d %H:%M:%S')} -- {elapsed_total:.1f}s, {ticks} tick(s), marks={marks} ==="]

    if not completed:
        msg = (
            f"No address showed a clean countdown of {MIN_DURATION_S:.1f}-{MAX_DURATION_S:.0f}s. "
            "Try using a star, lightning, or mega mushroom if you didn't get the chance."
        )
        print(msg)
        lines.append(msg)
    else:
        if marks:
            aggregated = aggregate_matches_by_address(completed, marks)
            full_matches = [r for r in aggregated if len(r[1]) == len(marks)]
            header = f"\n=== matched against your {len(marks)} reported boost time(s) (+/-{MARK_TOLERANCE_S:.1f}s) ==="
            print(header)
            lines.append(header)
            if not aggregated:
                msg = "No countdown overlapped any reported time -- see the plain list below."
                print(msg)
                lines.append(msg)
            else:
                for addr, matched, per_streak_hits, longest_s in aggregated[:PRINT_CAP]:
                    tag = " [heap-likely]" if addr >= HEAP_LIKELY_START else ""
                    all_tag = "  <-- matches ALL reported times" if len(matched) == len(marks) else ""
                    struct_info = structural_tag(addr)
                    line = (
                        f"  0x{addr:08X}{tag}  -- matched {len(matched)}/{len(marks)}: {sorted(matched)}, "
                        f"{len(per_streak_hits)} countdown(s), longest {longest_s:.1f}s{all_tag}\n"
                        f"      structural cross-check (treating this as starTimer): {struct_info}"
                    )
                    print(line)
                    lines.append(line)
                if full_matches:
                    print(f"\n{len(full_matches)} address(es) matched ALL reported times -- strongest leads.")
                else:
                    print("\nNo single address matched all reported times -- check partials above, or re-run.")

        completed.sort(key=lambda c: -(c[3] - c[2]))
        plain_header = f"\n{len(completed)} completed countdown(s) (plain duration order, longest first):"
        print(plain_header)
        lines.append(plain_header)
        for idx, (addr, peak, start_tick, end_tick) in enumerate(completed[:LOG_CAP]):
            tag = " [heap-likely]" if addr >= HEAP_LIKELY_START else ""
            duration = (end_tick - start_tick) * POLL_INTERVAL_S
            line = (
                f"  0x{addr:08X}{tag}  -- peak {peak}, {duration:.1f}s "
                f"(~{start_tick * POLL_INTERVAL_S:.0f}s-{end_tick * POLL_INTERVAL_S:.0f}s into the run)"
            )
            lines.append(line)
            if idx < PRINT_CAP:
                print(line)
        if len(completed) > PRINT_CAP:
            print(f"  ... and {len(completed) - PRINT_CAP} more, not printed (up to {LOG_CAP} saved to the log)")

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
