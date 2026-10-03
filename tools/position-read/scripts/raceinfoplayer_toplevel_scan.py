#!/usr/bin/env python3
"""
Both prior strategies for finding the local player's Player/PlayerSub10
object have now failed on real data:

  - find_player_candidates.py's value-range scan found 28,480 "shaped"
    candidates, and the follow-up temporal-stability filter only
    eliminated 8 of them (28,472 remained) -- because star=0/shock=0/
    mega=0/multiplier=1.0 (the idle defaults) is actually one of the
    MOST common byte patterns in this game's entire heap, not a rare
    one: zeroed timers and identity-scale (1.0) floats are the default
    state of an enormous number of unrelated structures. A filter that
    rewards "never changes" also keeps every one of those permanently-
    static defaults, since they never change either.
  - The reverse-pointer scan for "what points at RaceinfoPlayer"
    (rip_addr) found exactly ONE hit -- but it was just Raceinfo's own
    already-known players[] array slot (players_ptr + 0), not a new
    path to Player. Nothing else in all of MEM1+MEM2 points at
    RaceinfoPlayer, so Player evidently doesn't hold a raw pointer TO
    RaceinfoPlayer (if it did, that scan would have found it too).

This script tries the relationship in the other direction instead: does
RaceinfoPlayer hold a pointer FORWARD to its own Player object? rip_addr
is about as trustworthy an anchor as exists in this project (it's the
end of the same proven Raceinfo->players[]->RaceinfoPlayer chain that
position tracking already relies on), so rather than scanning all of
memory, this just dumps RaceinfoPlayer's own first DUMP_WORD_COUNT
fields, and for every one that looks like a valid MEM1/MEM2 pointer,
tries to chain-resolve it as Player->playerSub->playerSub10 and checks
whether the resulting star/shock/mega/multiplier fields look plausible.
Bounded, cheap, and specific to the local player -- no mass scanning.

Usage:
    python scripts/raceinfoplayer_toplevel_scan.py
Get into a race first.
"""
import os
import struct
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

DUMP_WORD_COUNT = 48  # covers RaceinfoPlayer+0x0 .. +0xBC
NESTED_DUMP_WORD_COUNT = 24  # how far into a standout MEM2 pointer to look

LOG_PATH = Path(__file__).resolve().parent.parent / "raceinfoplayer_toplevel_scan_log.txt"

# mkw-structures Player/PlayerSub chain (same offsets already used
# elsewhere in this project).
PLAYER_OFF_PLAYERSUB = 0x10
PLAYERSUB_OFF_PLAYERSUB10 = 0xC

# PlayerSub10 fields, relative to its own base (player.h).
OFF_STAR_TIMER = 0x18A
OFF_SHOCK_TIMER = 0x18C
OFF_MEGA_TIMER = 0x194
OFF_BOOST_MULTIPLIER = 0x120

TIMER_MIN, TIMER_MAX = 0, 700
MULT_MIN, MULT_MAX = 0.3, 5.0


def is_valid_ptr(v) -> bool:
    if v is None:
        return False
    return (0x80000000 <= v < 0x81800000) or (0x90000000 <= v < 0x94000000)


def is_mem2_ptr(v) -> bool:
    """MEM2 pointers are the interesting outliers among RaceinfoPlayer's
    top-level fields: every real run so far has shown 8-9 MEM1 pointers
    that are all just nearby sibling-RaceinfoPlayer/vtable/resource-
    string addresses a few hundred bytes from RaceinfoPlayer itself, and
    then exactly ONE MEM2 pointer that doesn't fit that pattern at all.
    MEM2 is where most per-race heap allocations (unlike the mostly-
    static lower MEM1 region) actually live, so it's worth a closer,
    one-level-deeper look regardless of whether the naive Player offset
    chain-resolved."""
    return v is not None and 0x90000000 <= v < 0x94000000


def read_u32(addr: int):
    try:
        return dme.read_word(addr)
    except Exception:
        return None


def read_i16(addr: int):
    try:
        return int.from_bytes(dme.read_bytes(addr, 2), byteorder="big", signed=True)
    except Exception:
        return None


def read_f32(addr: int):
    try:
        return struct.unpack(">f", dme.read_bytes(addr, 4))[0]
    except Exception:
        return None


def dump_words(base: int, count: int):
    """Returns [(offset, raw_value_or_None, is_ptr)] for `count` 4-byte
    words starting at `base`."""
    out = []
    for i in range(count):
        v = read_u32(base + i * 4)
        out.append((i * 4, v, is_valid_ptr(v)))
    return out


def chain_check(player_candidate: int) -> dict:
    """Tries Player(player_candidate)->playerSub->playerSub10 and
    ALWAYS returns a diagnostic dict, even on failure -- unlike a plain
    pass/fail, this lets a failed chain still be printed and inspected
    (which stage it died at, what the garbage value actually was)
    instead of silently vanishing, the same way raceinfo_toplevel_scan.py
    falls back to a raw dump instead of just saying "nothing matched"."""
    player_sub = read_u32(player_candidate + PLAYER_OFF_PLAYERSUB)
    if not is_valid_ptr(player_sub):
        return {"stage": "no_player_sub", "player_sub": player_sub, "plausible": False}

    player_sub10 = read_u32(player_sub + PLAYERSUB_OFF_PLAYERSUB10)
    if not is_valid_ptr(player_sub10):
        return {
            "stage": "no_player_sub10",
            "player_sub": player_sub,
            "player_sub10": player_sub10,
            "plausible": False,
        }

    star = read_i16(player_sub10 + OFF_STAR_TIMER)
    shock = read_i16(player_sub10 + OFF_SHOCK_TIMER)
    mega = read_i16(player_sub10 + OFF_MEGA_TIMER)
    mult = read_f32(player_sub10 + OFF_BOOST_MULTIPLIER)
    if None in (star, shock, mega, mult):
        return {
            "stage": "unreadable_fields",
            "player_sub": player_sub,
            "player_sub10": player_sub10,
            "plausible": False,
        }

    plausible = (
        TIMER_MIN <= star <= TIMER_MAX
        and TIMER_MIN <= shock <= TIMER_MAX
        and TIMER_MIN <= mega <= TIMER_MAX
        and MULT_MIN <= mult <= MULT_MAX
    )
    return {
        "stage": "ok" if plausible else "implausible_values",
        "player_sub": player_sub,
        "player_sub10": player_sub10,
        "star": star,
        "shock": shock,
        "mega": mega,
        "mult": mult,
        "plausible": plausible,
    }


def main() -> None:
    lines = [f"\n=== raceinfoplayer-toplevel-scan run at {time.strftime('%Y-%m-%d %H:%M:%S')} ==="]

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

        rip_addr = atr.get_local_player_addr(raceinfo_addr)
        if rip_addr is None:
            emit("Couldn't resolve local RaceinfoPlayer -- can't anchor this scan.")
            return
        emit(f"Local player's RaceinfoPlayer -> 0x{rip_addr:08X}")

        emit(f"\nDumping RaceinfoPlayer's first {DUMP_WORD_COUNT} words, checking each as a possible Player pointer...\n")
        words = dump_words(rip_addr, DUMP_WORD_COUNT)

        hits = []
        for offset, value, is_ptr in words:
            if not is_ptr:
                emit(f"  +0x{offset:02X}: 0x{value:08X} (valid ptr: False)")
                continue

            result = chain_check(value)
            stage = result["stage"]
            if stage == "ok":
                emit(
                    f"  +0x{offset:02X}: 0x{value:08X} (valid ptr: True)  "
                    f"<-- chain-resolves to a plausible Player/PlayerSub10!"
                )
                hits.append((offset, value, result))
            elif stage == "no_player_sub":
                emit(
                    f"  +0x{offset:02X}: 0x{value:08X} (valid ptr: True)  "
                    f"-- +0x10 (playerSub?) = 0x{result['player_sub']:08X}, not a valid pointer"
                )
            elif stage == "no_player_sub10":
                emit(
                    f"  +0x{offset:02X}: 0x{value:08X} (valid ptr: True)  "
                    f"-- playerSub=0x{result['player_sub']:08X}, but +0xC (playerSub10?) = "
                    f"0x{result['player_sub10']:08X}, not a valid pointer"
                )
            elif stage == "unreadable_fields":
                emit(
                    f"  +0x{offset:02X}: 0x{value:08X} (valid ptr: True)  "
                    f"-- playerSub=0x{result['player_sub']:08X}, playerSub10=0x{result['player_sub10']:08X}, "
                    f"but couldn't read its star/shock/mega/mult fields"
                )
            else:  # implausible_values
                emit(
                    f"  +0x{offset:02X}: 0x{value:08X} (valid ptr: True)  "
                    f"-- chains to playerSub10=0x{result['player_sub10']:08X} but values look wrong: "
                    f"star={result['star']} shock={result['shock']} mega={result['mega']} mult={result['mult']}"
                )

            if is_mem2_ptr(value):
                emit(
                    f"    -- 0x{value:08X} is a MEM2 pointer (everything else above is MEM1), "
                    f"dumping its own first {NESTED_DUMP_WORD_COUNT} words for a closer look:"
                )
                for n_offset, n_value, n_is_ptr in dump_words(value, NESTED_DUMP_WORD_COUNT):
                    emit(f"      +0x{n_offset:02X}: 0x{n_value:08X} (valid ptr: {n_is_ptr})")

        if not hits:
            emit(
                "\nNo top-level field of RaceinfoPlayer chain-resolved to a plausible "
                "Player/PlayerSub10 (see the per-field notes above for where each one "
                "failed). Either RaceinfoPlayer doesn't hold a forward pointer to "
                "Player within the first "
                f"0x{DUMP_WORD_COUNT * 4:X} bytes, or the Player/PlayerSub offsets "
                "need rechecking."
            )
            return

        emit(f"\n{len(hits)} candidate field(s) chain-resolved plausibly:")
        for offset, value, result in hits:
            emit(
                f"  RaceinfoPlayer+0x{offset:02X} (0x{value:08X}) -> playerSub=0x{result['player_sub']:08X} "
                f"-> playerSub10=0x{result['player_sub10']:08X}  "
                f"star={result['star']} shock={result['shock']} mega={result['mega']} mult={result['mult']}"
            )
        emit(
            "\nIf exactly one candidate above looks right, use a star/mushroom/bullet "
            "bill/etc. now and re-run this script -- its star/shock/mega/mult should "
            "change while the others (if any) stay put."
        )
    finally:
        # Always append whatever this run produced -- even a partial run
        # (hook failure, no Raceinfo found, Ctrl+C) -- instead of only
        # writing out on a full clean finish.
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\n(Appended this run's output to {LOG_PATH})")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
