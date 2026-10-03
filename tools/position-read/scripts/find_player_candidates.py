#!/usr/bin/env python3
"""
Finds the real PlayerSub10 object (mkw-structures player.h -- holds
starTimer/shockTimer/MegaTimer/boost.multiplier, never before located
this session) using a VALUE-based structural fingerprint, after the
first version of this script (a PURE POINTER-shape fingerprint) turned
out to be far too weak for this game's actual memory.

What went wrong with v1: it required Player's first 7 words (all
pointers per mkw-structures) to simultaneously land in the valid MEM1/
MEM2 range. Naively, requiring 7 independent ~2%-probability pointer
checks should produce well under 1 false positive across ~22 million
candidate positions -- instead, a real run found 82,741 "structural
candidates". Real game memory is NOT uniformly random: C++ vtables,
scene graphs, and arrays-of-pointers mean valid-looking pointers cluster
densely almost everywhere, so "N consecutive valid pointers" is a much
weaker filter here than the same math would suggest against random
noise. (This is the same lesson, from a different direction, as every
passive VALUE scan this session drowning in noise -- MKW's memory is
just unusually dense with things that incidentally look structured.)

This version fingerprints PlayerSub10 directly by VALUE instead, the
same style of check that already works for Raceinfo (which also mixes
a couple of pointer fields with value constraints, not pointers alone):
  int16_t starTimer   @ +0x18A,  must be a small plausible frame count
  int16_t shockTimer  @ +0x18C,  ditto
  int16_t MegaTimer   @ +0x194,  ditto
  float   multiplier  @ +0x120,  must be a plausible boost multiplier
Four independent, narrow VALUE constraints (not "is this 2% of address
space") compound down to something real coincidence essentially can't
produce by chance, the same way Raceinfo's stage/bool/pointer mix does.
Also restricts the scan to the heap-likely portion of MEM1 (0x81000000+)
plus MEM2, skipping the lower MEM1 range where code/static data (and
most of those dense vtable tables) actually live -- PlayerSub10 is a
per-race heap allocation, not a static.

Usage:
    python scripts/find_player_candidates.py
Get into a race. Finds PlayerSub10-shaped candidates once (should be a
small handful, not thousands), prints each, then live-watches their
star/shock/mega/multiplier fields for WATCH_DURATION_S seconds -- use a
star, mushroom, mega mushroom, lightning, or bullet bill during that
window and watch for which candidate (if any) changes. Also reverse-
scans for anything currently pointing at the local player's already-
reliable RaceinfoPlayer address, as a separate, cheap cross-check.
Results append to player_candidates_log.txt.
"""
import os
import struct
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

# mkw-structures player.h, relative to PlayerSub10's own base.
OFF_STAR_TIMER = 0x18A
OFF_SHOCK_TIMER = 0x18C
OFF_MEGA_TIMER = 0x194
OFF_BOOST_MULTIPLIER = 0x120  # boost (+0x110) . multiplier (+0x10)

# PlayerSub10 is at least this big (covers up to MegaTimer + 2 bytes).
PLAYERSUB10_MIN_SIZE = OFF_MEGA_TIMER + 2

# A real frame-countdown timer: 0 most of the time (not currently
# affected), up to a generous ceiling well above the longest real
# effect (star/mega, ~480-600 frames at 60fps). Same reasoning as
# find_boost_timers.py's PEAK_MAX.
TIMER_MIN, TIMER_MAX = 0, 700

# A plausible boost speed multiplier. 1.0 = no boost; real boosts are a
# 20-40% increase per the MKW TAS wiki, so this is deliberately wider
# than that on both sides to tolerate an uninitialized-but-plausible
# value.
MULT_MIN, MULT_MAX = 0.3, 5.0

# Skip the lower portion of MEM1 (code/static data, where v1's pointer-
# density explosion came from) -- PlayerSub10 is a per-race heap
# allocation, so it can only ever live here or in MEM2.
HEAP_REGIONS = [
    (0x81000000, 0x81800000),  # MEM1 heap-likely portion
    (0x90000000, 0x94000000),  # MEM2
]

WATCH_DURATION_S = 60.0
POLL_INTERVAL_S = 0.2

LOG_PATH = Path(__file__).resolve().parent.parent / "player_candidates_log.txt"


def _read_i16_field_stride4(arr: np.ndarray, offset: int, n: int) -> np.ndarray:
    """Big-endian signed int16 values at byte offset `offset`, `offset+4`,
    `offset+8`, ... (candidate positions are 4-byte-aligned, so a field
    at a fixed relative offset is also 4 bytes apart between candidates)."""
    hi = arr[offset : offset + 4 * n : 4].astype(np.int32)
    lo = arr[offset + 1 : offset + 1 + 4 * n : 4].astype(np.int32)
    length = min(len(hi), len(lo))
    vals = (hi[:length] << 8) | lo[:length]
    return np.where(vals >= 0x8000, vals - 0x10000, vals)


def _read_f32_field_stride4(arr: np.ndarray, offset: int, n: int) -> np.ndarray:
    """Big-endian float32 values at the same stride-4 candidate positions."""
    raw = arr[offset : offset + 4 * n]
    usable = (len(raw) // 4) * 4
    if usable <= 0:
        return np.array([], dtype=np.float32)
    return np.frombuffer(raw[:usable].tobytes(), dtype=">f4")


def scan_region_for_playersub10_shape(start: int, end: int):
    """One vectorized pass over [start, end) for 4-byte-aligned addresses
    where starTimer/shockTimer/MegaTimer/boost.multiplier ALL look
    plausible simultaneously -- see module docstring for why this value-
    based fingerprint replaced the original pointer-density one."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return []
    arr = np.frombuffer(buf, dtype=np.uint8)
    n = (len(arr) - PLAYERSUB10_MIN_SIZE) // 4 + 1
    if n <= 0:
        return []

    star_vals = _read_i16_field_stride4(arr, OFF_STAR_TIMER, n)
    shock_vals = _read_i16_field_stride4(arr, OFF_SHOCK_TIMER, n)
    mega_vals = _read_i16_field_stride4(arr, OFF_MEGA_TIMER, n)
    mult_vals = _read_f32_field_stride4(arr, OFF_BOOST_MULTIPLIER, n)
    length = min(len(star_vals), len(shock_vals), len(mega_vals), len(mult_vals))
    star_vals, shock_vals, mega_vals, mult_vals = (
        star_vals[:length],
        shock_vals[:length],
        mega_vals[:length],
        mult_vals[:length],
    )

    mask = (
        (star_vals >= TIMER_MIN) & (star_vals <= TIMER_MAX)
        & (shock_vals >= TIMER_MIN) & (shock_vals <= TIMER_MAX)
        & (mega_vals >= TIMER_MIN) & (mega_vals <= TIMER_MAX)
        & (mult_vals >= MULT_MIN) & (mult_vals <= MULT_MAX)
    )
    idxs = np.nonzero(mask)[0]
    return [int(start + i * 4) for i in idxs]


def find_playersub10_candidates():
    found = []
    for start, end in HEAP_REGIONS:
        found.extend(scan_region_for_playersub10_shape(start, end))
    return found


def field_addrs(playersub10_addr: int) -> dict:
    return {
        "star_timer": playersub10_addr + OFF_STAR_TIMER,
        "shock_timer": playersub10_addr + OFF_SHOCK_TIMER,
        "mega_timer": playersub10_addr + OFF_MEGA_TIMER,
        "boost_multiplier": playersub10_addr + OFF_BOOST_MULTIPLIER,
    }


def _read_i16(addr: int):
    try:
        return int.from_bytes(dme.read_bytes(addr, 2), byteorder="big", signed=True)
    except Exception:
        return None


def _read_f32(addr: int):
    try:
        return struct.unpack(">f", dme.read_bytes(addr, 4))[0]
    except Exception:
        return None


def snapshot_candidate(fields: dict):
    return {
        "star_timer": _read_i16(fields["star_timer"]),
        "shock_timer": _read_i16(fields["shock_timer"]),
        "mega_timer": _read_i16(fields["mega_timer"]),
        "boost_multiplier": _read_f32(fields["boost_multiplier"]),
    }


def main() -> None:
    atr.hook_with_retry()
    raceinfo_addr = atr.try_fast_path()
    if raceinfo_addr is None:
        print("Raceinfo fast path didn't check out -- are you actually in a race right now?")
        found, _t, _c, _nr = atr.find_raceinfo_candidates()
        if not found:
            raise SystemExit("No Raceinfo candidate found.")
        raceinfo_addr = found[0]
    print(f"Raceinfo -> 0x{raceinfo_addr:08X}")

    rip_addr = atr.get_local_player_addr(raceinfo_addr)
    print(f"Local player's RaceinfoPlayer -> 0x{rip_addr:08X}" if rip_addr else "Couldn't resolve local RaceinfoPlayer.")

    lines = [f"\n=== player-candidate run at {time.strftime('%Y-%m-%d %H:%M:%S')} ==="]
    lines.append(f"Raceinfo=0x{raceinfo_addr:08X} RaceinfoPlayer=0x{rip_addr:08X}" if rip_addr else "Raceinfo found, RaceinfoPlayer unresolved")

    if rip_addr is not None:
        print("\nReverse-scanning for anything that currently points AT the local RaceinfoPlayer address...")
        cross_refs = atr.find_sinstance_candidates(rip_addr)
        if cross_refs:
            msg = f"{len(cross_refs)} location(s) currently point at RaceinfoPlayer (0x{rip_addr:08X}):"
            print(msg)
            lines.append(msg)
            for addr in cross_refs:
                line = f"  0x{addr:08X} -> 0x{rip_addr:08X}"
                print(line)
                lines.append(line)
        else:
            msg = "Nothing currently points at RaceinfoPlayer."
            print(msg)
            lines.append(msg)

    print(
        "\nScanning the heap-likely regions for PlayerSub10-shaped objects "
        "(star/shock/mega timers + boost multiplier all plausible at once)..."
    )
    t0 = time.time()
    candidates = find_playersub10_candidates()
    print(f"{len(candidates)} candidate(s) found in {time.time() - t0:.2f}s.")
    lines.append(f"{len(candidates)} PlayerSub10-shaped candidate(s) found")

    resolved = {}
    for addr in candidates:
        fields = field_addrs(addr)
        snap = snapshot_candidate(fields)
        resolved[addr] = fields
        line = (
            f"  0x{addr:08X}  star={snap['star_timer']} shock={snap['shock_timer']} "
            f"mega={snap['mega_timer']} boost.multiplier={snap['boost_multiplier']}"
        )
        print(line)
        lines.append(line)

    if not resolved:
        msg = "\nNo PlayerSub10-shaped candidate found. Nothing to watch."
        print(msg)
        lines.append(msg)
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        return

    print(
        f"\n{len(resolved)} candidate(s). Watching their star/shock/mega/boost.multiplier fields for "
        f"{WATCH_DURATION_S:.0f}s -- use a star, mushroom, mega mushroom, lightning, or bullet bill now "
        "and watch for a change. Ctrl+C to stop early.\n"
    )

    prev = {addr: snapshot_candidate(fields) for addr, fields in resolved.items()}
    t_start = time.time()
    try:
        while time.time() - t_start < WATCH_DURATION_S:
            time.sleep(POLL_INTERVAL_S)
            if not dme.is_hooked():
                print("Lost hook to Dolphin. Stopping.")
                break
            for addr, fields in resolved.items():
                cur = snapshot_candidate(fields)
                if cur != prev[addr]:
                    elapsed = time.time() - t_start
                    line = f"[{elapsed:6.1f}s] 0x{addr:08X} changed: {prev[addr]} -> {cur}"
                    print(line, flush=True)
                    lines.append(line)
                    prev[addr] = cur
    except KeyboardInterrupt:
        print("\nStopped.")

    with open(LOG_PATH, "a") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\nAppended this run's results to {LOG_PATH}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
