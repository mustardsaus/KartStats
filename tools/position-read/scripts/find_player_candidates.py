#!/usr/bin/env python3
"""
Finds the real Player object(s) (mkw-structures player.h -- the per-kart
physics/input object, never before located this session) using the SAME
proven technique that pinned down Raceinfo::sInstance's real address
earlier in this project: a strong STRUCTURAL fingerprint plus a reverse-
pointer-scan against something already reliably found, instead of yet
another passive full-RAM behavioral scan.

Why the pivot: every full-RAM PASSIVE scan tried this session -- the
item byte directly (auto_item_finder.py), a sustained-unchanged streak
(watch_held_item_candidates.py), a monotonic frame-countdown
(find_boost_timers.py) -- has drowned in false positives no matter how
the filter got tuned. A real 60s run with one real star use still came
back with 2,300+ coincidental partial matches even after tightening the
peak range and adding a warmup window. ~44 million candidate addresses
and MKW's memory being full of other things that ease/decay/sit still
makes passive content-scanning fundamentally unreliable here.

What actually DID work, much earlier in this project: Raceinfo::sInstance
was found via scan_region_for_raceinfo (auto_track_race.py) -- a
STRUCTURAL shape check requiring several pointer-shaped fields to all be
valid simultaneously, which is a vastly stronger fingerprint than any
single value range (a real pointer lands in ~2% of the 32-bit address
space; requiring several independent ones to agree compounds that down
to something coincidental memory essentially never produces).

Per mkw-structures player.h, the Player class's first 0x1c bytes
(offsets 0x0, 0x4, 0x8, 0xc, 0x10, 0x14, 0x18) are ALL pointers:
playerPointers, two undocumented pointers, the vtable, playerSub,
params, and one more undocumented pointer. Requiring all SEVEN to be
simultaneously valid MEM1/MEM2 pointers is an even stronger version of
the same fingerprint that worked for Raceinfo (which only needed 3-4).

For each surviving candidate, this derives (by actually dereferencing
the documented pointer chain, not guessing a fixed address) playerSub10
via playerSub+0x10 -> playerSub10+0xc, and from there the exact
addresses of starTimer (+0x18A), shockTimer (+0x18C), MegaTimer (+0x194),
and boost.multiplier (+0x120) -- the same fields find_boost_timers.py
was blindly scanning all of RAM for. Because the candidate pool here is
tiny (structurally filtered first), watching just these specific,
derived addresses for a real item-use event should finally have a
fighting chance against the noise that buried the blind scan.

Separately, also reverse-scans for anything in memory that currently
points AT the local player's already-reliable RaceinfoPlayer address
(reusing auto_track_race.py's find_sinstance_candidates, built for
exactly this kind of exact-value pointer search) -- testing whether
Player and RaceinfoPlayer cross-reference each other directly, which
would be an even more direct bridge than the structural scan alone.

Usage:
    python scripts/find_player_candidates.py
Get into a race. Finds Player-shaped candidates once, prints each with
its derived boost/timer addresses, then live-watches those specific
addresses for WATCH_DURATION_S seconds -- use a star, mushroom, mega
mushroom, lightning, or bullet bill during that window and watch for
which candidate (if any) changes. Results append to player_candidates_log.txt.
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

# mkw-structures player.h: Player's first 7 words are all pointers.
PLAYER_SHAPE_WORDS = 7  # offsets 0x0, 0x4, 0x8, 0xc, 0x10, 0x14, 0x18
PLAYER_OFF_PLAYER_SUB = 0x10
PLAYERSUB_OFF_PLAYERSUB10 = 0xC
PLAYERSUB10_OFF_STAR_TIMER = 0x18A
PLAYERSUB10_OFF_SHOCK_TIMER = 0x18C
PLAYERSUB10_OFF_MEGA_TIMER = 0x194
PLAYERSUB10_OFF_BOOST_MULTIPLIER = 0x120  # boost (+0x110) . multiplier (+0x10)

WATCH_DURATION_S = 60.0
POLL_INTERVAL_S = 0.2

LOG_PATH = Path(__file__).resolve().parent.parent / "player_candidates_log.txt"


def scan_region_for_player_shape(start: int, end: int):
    """One vectorized pass over [start, end) for 4-byte-aligned addresses
    where 7 CONSECUTIVE words are all simultaneously valid MEM1/MEM2
    pointers -- see module docstring for why this is such a strong
    fingerprint. Reuses auto_track_race.py's own helpers so this follows
    the exact same proven pattern as scan_region_for_raceinfo."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return []
    arr = np.frombuffer(buf, dtype=np.uint8)
    n_words = len(arr) // 4
    if n_words < PLAYER_SHAPE_WORDS:
        return []
    words = atr._read_u32_field(arr, 0, n_words)
    mask = atr._in_valid_range(words)
    n_positions = len(mask) - (PLAYER_SHAPE_WORDS - 1)
    if n_positions <= 0:
        return []
    combined = mask[:n_positions].copy()
    for k in range(1, PLAYER_SHAPE_WORDS):
        combined &= mask[k : k + n_positions]
    idxs = np.nonzero(combined)[0]
    return [int(start + i * 4) for i in idxs]


def find_player_shape_candidates():
    found = []
    for start, end in atr.REGIONS:
        found.extend(scan_region_for_player_shape(start, end))
    return found


def derive_timer_addrs(player_addr: int):
    """Actually dereferences the documented Player -> playerSub ->
    playerSub10 chain (never guessing a fixed offset for the final
    addresses) and returns a dict of derived field addresses, or None
    if any link in the chain doesn't resolve to an in-range pointer."""
    player_sub = atr.read_ptr(player_addr + PLAYER_OFF_PLAYER_SUB)
    if player_sub is None or not (
        0x80000000 <= player_sub < 0x81800000 or 0x90000000 <= player_sub < 0x94000000
    ):
        return None
    player_sub10 = atr.read_ptr(player_sub + PLAYERSUB_OFF_PLAYERSUB10)
    if player_sub10 is None or not (
        0x80000000 <= player_sub10 < 0x81800000 or 0x90000000 <= player_sub10 < 0x94000000
    ):
        return None
    return {
        "player_sub": player_sub,
        "player_sub10": player_sub10,
        "star_timer": player_sub10 + PLAYERSUB10_OFF_STAR_TIMER,
        "shock_timer": player_sub10 + PLAYERSUB10_OFF_SHOCK_TIMER,
        "mega_timer": player_sub10 + PLAYERSUB10_OFF_MEGA_TIMER,
        "boost_multiplier": player_sub10 + PLAYERSUB10_OFF_BOOST_MULTIPLIER,
    }


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
            msg = "Nothing currently points at RaceinfoPlayer -- Player likely doesn't cross-reference it directly."
            print(msg)
            lines.append(msg)

    print("\nStructurally scanning MEM1+MEM2 for Player-shaped objects (7 consecutive valid pointers)...")
    t0 = time.time()
    shape_candidates = find_player_shape_candidates()
    print(f"{len(shape_candidates)} structural candidate(s) found in {time.time() - t0:.2f}s.")
    lines.append(f"{len(shape_candidates)} structural candidate(s) found")

    resolved = {}
    for addr in shape_candidates:
        fields = derive_timer_addrs(addr)
        if fields is None:
            continue
        snap = snapshot_candidate(fields)
        resolved[addr] = fields
        line = (
            f"  0x{addr:08X}  playerSub=0x{fields['player_sub']:08X}  playerSub10=0x{fields['player_sub10']:08X}\n"
            f"      star={snap['star_timer']} shock={snap['shock_timer']} mega={snap['mega_timer']} "
            f"boost.multiplier={snap['boost_multiplier']}"
        )
        print(line)
        lines.append(line)

    if not resolved:
        msg = "\nNo structural candidate's playerSub->playerSub10 chain resolved. Nothing to watch."
        print(msg)
        lines.append(msg)
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        return

    print(
        f"\n{len(resolved)} candidate(s) with a resolved playerSub10 chain. Watching their star/shock/mega/"
        f"boost.multiplier fields for {WATCH_DURATION_S:.0f}s -- use a star, mushroom, mega mushroom, lightning, "
        "or bullet bill now and watch for a change. Ctrl+C to stop early.\n"
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
