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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

DUMP_WORD_COUNT = 48  # covers RaceinfoPlayer+0x0 .. +0xBC

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


def chain_check(player_candidate: int):
    """Tries Player(player_candidate)->playerSub->playerSub10 and
    returns a dict of the resolved fields if every step along the way
    looks structurally sane, else None."""
    player_sub = read_u32(player_candidate + PLAYER_OFF_PLAYERSUB)
    if not is_valid_ptr(player_sub):
        return None
    player_sub10 = read_u32(player_sub + PLAYERSUB_OFF_PLAYERSUB10)
    if not is_valid_ptr(player_sub10):
        return None

    star = read_i16(player_sub10 + OFF_STAR_TIMER)
    shock = read_i16(player_sub10 + OFF_SHOCK_TIMER)
    mega = read_i16(player_sub10 + OFF_MEGA_TIMER)
    mult = read_f32(player_sub10 + OFF_BOOST_MULTIPLIER)
    if None in (star, shock, mega, mult):
        return None

    plausible = (
        TIMER_MIN <= star <= TIMER_MAX
        and TIMER_MIN <= shock <= TIMER_MAX
        and TIMER_MIN <= mega <= TIMER_MAX
        and MULT_MIN <= mult <= MULT_MAX
    )
    return {
        "player_sub": player_sub,
        "player_sub10": player_sub10,
        "star": star,
        "shock": shock,
        "mega": mega,
        "mult": mult,
        "plausible": plausible,
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
    if rip_addr is None:
        raise SystemExit("Couldn't resolve local RaceinfoPlayer -- can't anchor this scan.")
    print(f"Local player's RaceinfoPlayer -> 0x{rip_addr:08X}")

    print(f"\nDumping RaceinfoPlayer's first {DUMP_WORD_COUNT} words, checking each as a possible Player pointer...\n")
    words = dump_words(rip_addr, DUMP_WORD_COUNT)

    hits = []
    for offset, value, is_ptr in words:
        marker = ""
        result = None
        if is_ptr:
            result = chain_check(value)
            if result is not None and result["plausible"]:
                marker = "  <-- chain-resolves to a plausible Player/PlayerSub10!"
                hits.append((offset, value, result))
        print(f"  +0x{offset:02X}: 0x{value:08X} (valid ptr: {is_ptr}){marker}")

    if not hits:
        print(
            "\nNo top-level field of RaceinfoPlayer chain-resolved to a plausible "
            "Player/PlayerSub10. Either RaceinfoPlayer doesn't hold a forward "
            "pointer to Player within the first "
            f"0x{DUMP_WORD_COUNT * 4:X} bytes, or the Player/PlayerSub offsets "
            "need rechecking."
        )
        return

    print(f"\n{len(hits)} candidate field(s) chain-resolved plausibly:")
    for offset, value, result in hits:
        print(
            f"  RaceinfoPlayer+0x{offset:02X} (0x{value:08X}) -> playerSub=0x{result['player_sub']:08X} "
            f"-> playerSub10=0x{result['player_sub10']:08X}  "
            f"star={result['star']} shock={result['shock']} mega={result['mega']} mult={result['mult']}"
        )
    print(
        "\nIf exactly one candidate above looks right, use a star/mushroom/bullet "
        "bill/etc. now and re-run this script -- its star/shock/mega/mult should "
        "change while the others (if any) stay put."
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
