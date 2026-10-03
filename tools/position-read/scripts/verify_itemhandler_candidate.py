#!/usr/bin/env python3
"""Live-watch the strongest candidate ItemHandler address found by
item_snapshot_diff.py's 5-round intersection: 0x8034155C
(ItemHandler base 0x8034153A + recvPackets[player_id].item_tail, for
player id 0).

That address stood out from the other 6 survivors in the intersection
because it showed a DIFFERENT, plausible item every round (Lightning,
Triple Mushroom, Golden Mushroom, Bullet Bill, Lightning) while the other
6 showed the exact same transition every single round regardless of what
was picked up -- a signature of an unrelated periodic array (almost
certainly in-flight shell/banana projectile objects on the track), not a
real per-player signal.

This is a HEAP address from that specific play session, so it will almost
certainly be wrong after Dolphin/the game restarts. Only run this while
still in the same Dolphin session item_snapshot_diff.py was run in. If it
tracks correctly, the next step is a reverse-pointer scan (same technique
already used for Raceinfo::sInstance) to find the permanent static pointer
to this object, so it survives restarts too.

Usage: python3 verify_itemhandler_candidate.py
Prints a line every time the held item changes, live, so you can compare
it against what you actually see happening in-game. Ctrl+C to stop.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

CANDIDATE_ITEMHANDLER_ADDR = 0x8034153A  # = 0x8034155C - ITEMHANDLER_OFF_RECV_PACKETS(0x10) - ITEMPACKET_OFF_ITEM_TAIL(2), player id 0
POLL_INTERVAL_S = 0.2


def decode(value) -> str:
    if value is None:
        return "?"
    if atr.HELD_ITEM_MIN <= value <= atr.HELD_ITEM_MAX:
        return atr.item_name(value)
    if value == 0x14:
        return "(no item)"
    return f"0x{value:02X}"


def main() -> None:
    atr.hook_with_retry()
    raceinfo_addr = atr.try_fast_path()
    if raceinfo_addr is None:
        print("Raceinfo fast path didn't check out -- are you actually in a race right now?")
        candidates, _t, _c, _nr = atr.find_raceinfo_candidates()
        if not candidates:
            raise SystemExit("No Raceinfo candidate found.")
        raceinfo_addr = candidates[0]
    player_addr = atr.get_local_player_addr(raceinfo_addr)
    player_id = dme.read_byte(player_addr + atr.PLAYER_OFF_ID)
    print(f"Local player id = {player_id}. Watching candidate ItemHandler @ 0x{CANDIDATE_ITEMHANDLER_ADDR:08X}.")
    print("Play normally -- I'll print a line every time this address's item_tail changes. Ctrl+C to stop.\n")

    start = time.time()
    prev_tail = None
    prev_box = None
    while True:
        if not dme.is_hooked():
            print("Lost hook to Dolphin. Exiting.")
            return
        packet = atr.read_item_packet(CANDIDATE_ITEMHANDLER_ADDR, player_id)
        if packet is None:
            print("  (couldn't read -- candidate address may no longer be valid, e.g. Dolphin/game restarted)")
            time.sleep(1.0)
            continue
        tail = packet[atr.ITEMPACKET_OFF_ITEM_TAIL]
        box = packet[atr.ITEMPACKET_OFF_ITEM_BOX]
        if tail != prev_tail or box != prev_box:
            elapsed = time.time() - start
            print(f"[{elapsed:6.1f}s] item_tail: {decode(prev_tail)} -> {decode(tail)}   item_box: {decode(prev_box)} -> {decode(box)}", flush=True)
            prev_tail = tail
            prev_box = box
        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
