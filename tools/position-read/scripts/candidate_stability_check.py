#!/usr/bin/env python3
"""Cheap, decisive pre-screening for ItemHandler candidates, before burning
a whole race live-watching any one of them.

Why this exists: live-watching 0x8034155C (the address that topped TWO
separate auto_item_finder.py rankings) proved it was never the real held
item -- it changed on nearly every single 0.2s poll, cycling through
almost every item in the game, DURING THE PRE-RACE COUNTDOWN, before the
race had even started and before anyone could possibly be holding
anything. A real held-item byte has to sit frozen (ideally at "(no item)")
until the race actually gives the player something to hold. That's a much
cheaper, more decisive test than comparing a whole race against what you
remember picking up: it takes maybe 15 seconds, right at the start of a
race, instead of a full lap.

This script applies that exact test to a batch of leftover candidates
from past auto_item_finder.py runs in one race -- the ones that showed
widely-SPACED changes (tens of seconds apart) rather than 0x8034155C's
constant churn, so they were never directly disproven, just buried under
0x8034155C's spuriously-high "diversity" ranking. Anything that so much as
flickers during this window gets flagged -- same signature that busted
0x8034155C -- so we stop wasting whole races on addresses doomed from the
first few seconds.

Usage: python3 candidate_stability_check.py [addr1_hex addr2_hex ...]
  With no arguments, screens the built-in DEFAULT_CANDIDATES list (every
  address that showed up in a "promising" auto_item_finder.py report so
  far, across every race run this session, minus 0x8034155C which is
  already disproven by direct live-watch).
Start it right as you're getting into a race -- the countdown is exactly
the window we want to catch. Results print after SCREEN_WINDOW_S seconds
and the process exits; no need to Ctrl+C.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

# Every address that showed up in a "promising" bucket across every
# auto_item_finder.py run this session, minus 0x8034155C -- that one is
# excluded on purpose: a direct live-watch (not just indirect ranking)
# already proved it changes on nearly every poll before a race even
# starts, so there's nothing left to screen for it.
DEFAULT_CANDIDATES = [
    0x9011D7AC, 0x90123AAC, 0x9011FB0C, 0x802F6924, 0x802FFE74,
    0x901233AC, 0x90119F0C, 0x901197EC, 0x9012020C, 0x90121E6C,
    0x9011A60C, 0x901182AC, 0x9012104C,
]

SCREEN_WINDOW_S = 15.0
POLL_INTERVAL_S = 0.15


def decode(value) -> str:
    if value is None:
        return "?"
    if atr.HELD_ITEM_MIN <= value <= atr.HELD_ITEM_MAX:
        return atr.item_name(value)
    if value == 0x14:
        return "(no item)"
    return f"0x{value:02X}"


def screen_candidates(candidates, player_id: int, window_s: float, poll_interval_s: float, sleep_fn=time.sleep, time_fn=time.time, read_fn=None):
    """Polls every candidate's item_tail at poll_interval_s for window_s
    seconds, counting how many times each one changes. Kept separate from
    main() so it can be driven by a synthetic clock/reader in tests
    instead of real Dolphin reads and real sleeps."""
    if read_fn is None:
        read_fn = lambda addr: atr.read_item_packet(addr, player_id)  # noqa: E731

    last_val = {}
    change_count = {addr: 0 for addr in candidates}
    for addr in candidates:
        packet = read_fn(addr)
        last_val[addr] = packet[atr.ITEMPACKET_OFF_ITEM_TAIL] if packet is not None else None

    start = time_fn()
    while time_fn() - start < window_s:
        sleep_fn(poll_interval_s)
        for addr in candidates:
            packet = read_fn(addr)
            val = packet[atr.ITEMPACKET_OFF_ITEM_TAIL] if packet is not None else None
            if val != last_val[addr]:
                change_count[addr] += 1
                last_val[addr] = val
    return change_count


def main() -> None:
    candidates = [int(a, 16) for a in sys.argv[1:]] if len(sys.argv) > 1 else list(DEFAULT_CANDIDATES)

    atr.hook_with_retry()
    raceinfo_addr = atr.try_fast_path()
    if raceinfo_addr is None:
        print("Raceinfo fast path didn't check out -- are you actually getting into a race right now?")
        found, _t, _c, _nr = atr.find_raceinfo_candidates()
        if not found:
            raise SystemExit("No Raceinfo candidate found.")
        raceinfo_addr = found[0]
    player_addr = atr.get_local_player_addr(raceinfo_addr)
    player_id = dme.read_byte(player_addr + atr.PLAYER_OFF_ID)

    print(f"Local player id = {player_id}. Screening {len(candidates)} candidate(s) for {SCREEN_WINDOW_S:.0f}s.")
    print("This window should cover the pre-race countdown -- a real held-item byte must stay frozen")
    print("the whole time, since nobody can be holding an item before the race starts. Any candidate")
    print("that changes here has the same signature that already disproved 0x8034155C.\n")

    change_count = screen_candidates(candidates, player_id, SCREEN_WINDOW_S, POLL_INTERVAL_S)

    frozen = sorted(addr for addr, n in change_count.items() if n == 0)
    flickered = sorted(((addr, n) for addr, n in change_count.items() if n > 0), key=lambda row: row[1])

    print("=== frozen the whole window (still worth a full live-watch test) ===")
    if not frozen:
        print("  none -- every candidate changed during the pre-race window. None of these are promising as-is.")
    for addr in frozen:
        print(f"  0x{addr:08X}")

    print(f"\n=== changed during the pre-race window ({len(flickered)} address(es), same disqualifying signature as 0x8034155C) ===")
    for addr, n in flickered:
        print(f"  0x{addr:08X}: {n} change(s) in {SCREEN_WINDOW_S:.0f}s -- discard")


if __name__ == "__main__":
    main()
