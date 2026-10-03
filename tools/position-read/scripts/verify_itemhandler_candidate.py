#!/usr/bin/env python3
"""Live-watch a candidate ItemHandler address found by item_snapshot_diff.py's
round intersection.

IMPORTANT -- this is a HEAP address, and we now have direct evidence
(Raceinfo's own address logged as 0x81118270 in one item_snapshot_diff run
and 0x811183B0 in the next, same Dolphin boot, different race) that these
heap objects get reallocated at a NEW address every race, not just every
Dolphin restart. So a candidate found during one race's rounds is only
valid for THAT SAME race -- run this before that race ends, not after. The
very first real-world test of the previous hardcoded default
(0x8034155C from a 5-round intersection, the one candidate that varied
plausibly every round while 6 others showed the exact same transition
regardless of pickups) came back frozen at "Green Shell" the whole race --
consistent with it being stale from the race item_snapshot_diff.py was
actually run in, not the race it was tested in.

If a candidate tracks correctly within its own race, the next step is a
reverse-pointer scan (same technique already used for Raceinfo::sInstance)
to find the permanent static pointer to this object, so it survives races
and restarts going forward.

Usage: python3 verify_itemhandler_candidate.py [itemhandler_addr_hex]
  itemhandler_addr_hex: the ItemHandler base address to watch, e.g. 0x8034153A
    (recvPackets[0].item_tail minus ITEMHANDLER_OFF_RECV_PACKETS(0x10) minus
    ITEMPACKET_OFF_ITEM_TAIL(2) -- i.e. subtract 0x12 from whatever address
    item_snapshot_diff.py printed as a surviving candidate). Defaults to the
    address from the first (already-stale) test if omitted.
Prints a line every time the held item changes, live, so you can compare
it against what you actually see happening in-game. Ctrl+C to stop.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

DEFAULT_CANDIDATE_ITEMHANDLER_ADDR = 0x8034153A  # stale -- see module docstring; pass a fresh one as argv[1]
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
    if len(sys.argv) > 1:
        candidate_addr = int(sys.argv[1], 16)
    else:
        candidate_addr = DEFAULT_CANDIDATE_ITEMHANDLER_ADDR
        print(
            f"No address given on the command line -- defaulting to 0x{candidate_addr:08X}, "
            "which is already known to be stale from a previous race. Pass a fresh address "
            "(e.g. `python3 verify_itemhandler_candidate.py 0x8034153A`) from THIS race's "
            "item_snapshot_diff.py run instead.\n"
        )

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
    print(f"Local player id = {player_id}. Watching candidate ItemHandler @ 0x{candidate_addr:08X}.")
    print("Play normally -- I'll print a line every time this address's item_tail changes. Ctrl+C to stop.\n")

    start = time.time()
    prev_tail = None
    prev_box = None
    while True:
        if not dme.is_hooked():
            print("Lost hook to Dolphin. Exiting.")
            return
        packet = atr.read_item_packet(candidate_addr, player_id)
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
