#!/usr/bin/env python3
"""Chases pointers OFF Raceinfo ITSELF (not RaceinfoPlayer) that have never
been checked before, looking for the held item.

Why this is different from every previous pointer-chase attempt this
session: those all scanned the PLAYER sub-struct's own memory window for
pointer-looking slots (auto_track_race.py's find_pointer_offsets /
read_pointer_target_window machinery) -- 16 of them, exhaustively, and
every single target turned out to be Timer/ControllerHolder-shaped noise,
confirmed from a real race log. That's consistent with the documented
architecture: RaceinfoPlayer structurally doesn't reference the item
system at all.

But Raceinfo (the OUTER object, not the per-player sub-struct) has its own
top-level fields per the mkw-structures docs, three of which have never
been read by any tool in this project: gamemodeData, timerManager, and
kmg. The other top-level fields (random1, random2, players, stage,
canCountdownStart, cutSceneMode) are all already in active use elsewhere
in auto_track_race.py and are known NOT to be it.

The advantage over every static-address guess tried so far (0x8034155C,
the stability-screened 0x9011xxxx/0x9012xxxx cluster, 0x802F6924/
0x802FFE74, the computed ITEMHandler::sInstance delta prediction -- all
disproven by direct testing): Raceinfo itself is something this project
already reliably re-finds every single race (fast path first, full
structural scan as fallback -- this part has never failed all session),
so chasing pointers off it doesn't require guessing a fixed address that
might not hold across races; it's chased fresh, from an already-trusted
root, every time this runs.

Usage: python3 raceinfo_toplevel_scan.py
Run it while in a race. For each of the three untested fields, prints
the pointer value, whether it's in a valid range, and whether it passes
the ITEMHandler shape check. If none pass immediately, retries each for
a few seconds (same reasoning as verify_itemhandler_sinstance_prediction.
py: a real object can briefly fail the shape check in an all-zero or
mid-update state), then dumps raw recvPackets-shaped data for whichever
one looks closest, so a near-miss can be diagnosed instead of discarded.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

# Confirmed against the documented Raceinfo layout: vtable at 0x00, then
# random1/random2/players/stage/canCountdownStart/cutSceneMode (all
# already defined in auto_track_race.py and used elsewhere) line up
# exactly, which is why these three derived offsets are trusted enough to
# test directly rather than needing their own separate verification pass.
RACEINFO_OFF_GAMEMODE_DATA = 0x10   # void* -- type depends on game mode, per setupGamemodeData()
RACEINFO_OFF_TIMER_MANAGER = 0x14   # TimerManager*
RACEINFO_OFF_KMG = 0x3C             # KMGHolder* -- course/track data, probably not it, checked anyway for completeness

CANDIDATES = {
    "gamemodeData": RACEINFO_OFF_GAMEMODE_DATA,
    "timerManager": RACEINFO_OFF_TIMER_MANAGER,
    "kmg": RACEINFO_OFF_KMG,
}

RETRY_ATTEMPTS = 8
RETRY_INTERVAL_S = 1.0


def decode(value) -> str:
    if value is None:
        return "?"
    if atr.HELD_ITEM_MIN <= value <= atr.HELD_ITEM_MAX:
        return atr.item_name(value)
    if value == 0x14:
        return "(no item)"
    return f"0x{value:02X}"


def _dump_raw_recv_packets(addr: int) -> None:
    try:
        buf = dme.read_bytes(
            addr + atr.ITEMHANDLER_OFF_RECV_PACKETS,
            atr.ITEMPACKET_SIZE * atr.ITEMHANDLER_RECV_PACKET_COUNT,
        )
    except Exception as e:
        print(f"    couldn't read recvPackets at 0x{addr:08X}: {e}")
        return
    for i in range(atr.ITEMHANDLER_RECV_PACKET_COUNT):
        base = i * atr.ITEMPACKET_SIZE
        timer = buf[base + atr.ITEMPACKET_OFF_TIMER]
        item_box = buf[base + atr.ITEMPACKET_OFF_ITEM_BOX]
        item_tail = buf[base + atr.ITEMPACKET_OFF_ITEM_TAIL]
        mode = buf[base + atr.ITEMPACKET_OFF_MODE]
        print(
            f"      [{i:2d}] timer=0x{timer:02X} item_box={decode(item_box)} (0x{item_box:02X}) "
            f"item_tail={decode(item_tail)} (0x{item_tail:02X}) mode=0x{mode:02X}"
        )


def main() -> None:
    atr.hook_with_retry()
    raceinfo_addr = atr.try_fast_path()
    if raceinfo_addr is None:
        print("Raceinfo fast path didn't check out -- are you actually in a race right now?")
        found, _t, _c, _nr = atr.find_raceinfo_candidates()
        if not found:
            raise SystemExit("No Raceinfo candidate found.")
        raceinfo_addr = found[0]
    print(f"Raceinfo -> 0x{raceinfo_addr:08X}\n")

    targets = {}
    for name, off in CANDIDATES.items():
        val = atr.read_ptr(raceinfo_addr + off)
        in_range = val is not None and (0x80000000 <= val < 0x81800000 or 0x90000000 <= val < 0x94000000)
        print(f"{name} (Raceinfo+0x{off:X}) -> {'0x%08X' % val if val is not None else '?'}  (in range: {in_range})")
        if in_range:
            targets[name] = val

    if not targets:
        print("\nNone of the three resolved to an in-range pointer. Nothing further to check.")
        return

    print(f"\nChecking shape for each in-range target, retrying up to {RETRY_ATTEMPTS}s if needed...")
    passed = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        for name, addr in targets.items():
            if atr._itemhandler_shape_ok(addr):
                passed = (name, addr)
                break
        if passed:
            break
        time.sleep(RETRY_INTERVAL_S)

    if passed:
        name, addr = passed
        print(f"\n{name} PASSED the shape check -- 0x{addr:08X} looks like a real ITEMHandler-shaped object.")
        print("Raw recvPackets[12]:")
        _dump_raw_recv_packets(addr)
        print(f"\nTo live-watch it: python3 verify_itemhandler_candidate.py 0x{addr:08X}")
        return

    print(f"\nNone passed the shape check after {RETRY_ATTEMPTS}s. Raw data for each, for manual inspection:")
    for name, addr in targets.items():
        print(f"  {name} (0x{addr:08X}):")
        _dump_raw_recv_packets(addr)


if __name__ == "__main__":
    main()
