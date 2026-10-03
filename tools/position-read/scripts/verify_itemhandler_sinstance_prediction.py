#!/usr/bin/env python3
"""Tests a PREDICTED static address for ITEMHandler::sInstance, computed
from a documented relocation offset rather than guessed outright.

Where this number comes from: mkw-structures (github.com/SeekyCt/mkw-
structures, the same reverse-engineering source this project already
cites for RaceinfoPlayer/ITEMPacket field layouts) documents:
  Raceinfo::sInstance    = 0x809BD730
  ITEMHandler::sInstance = 0x809C20F8
Those don't match this build/revision directly -- we already empirically
confirmed the real Raceinfo::sInstance for THIS game (RMCE01) is
0x809B8F70, not 0x809BD730. The gap between those two numbers is a fixed
delta (-0x47C0): if that gap is a uniform relocation between whatever
revision mkw-structures documented and this one (plausible -- it's the
kind of shift a different build/link order would apply uniformly to a
whole data section), the SAME delta applied to the documented ITEMHandler
address predicts:
  0x809C20F8 + (-0x47C0) = 0x809BD938
That's a grounded guess, not a confirmed address -- hence this script
exists to test it empirically (shape-check it, then live-decode the
local player's held item against it) rather than trusting it outright
and wiring it into auto_track_race.py.

Usage: python3 verify_itemhandler_sinstance_prediction.py
Run it anytime (menu or in a race) -- it reports the shape-check result
immediately. If that passes, it then live-prints the local player's held
item the same way verify_itemhandler_candidate.py does, so you can play
a race and compare directly. If it fails, it also shows what the
published (uncorrected) address and both raw pointer reads look like, to
help figure out why.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

PUBLISHED_ITEMHANDLER_SINSTANCE_ADDR = 0x809C20F8  # mkw-structures, unmodified -- known not to check out directly
PUBLISHED_RACEINFO_SINSTANCE_ADDR = 0x809BD730      # mkw-structures, unmodified
CONFIRMED_RACEINFO_SINSTANCE_ADDR = 0x809B8F70      # empirically confirmed for this build earlier this session
RELOCATION_DELTA = CONFIRMED_RACEINFO_SINSTANCE_ADDR - PUBLISHED_RACEINFO_SINSTANCE_ADDR
PREDICTED_ITEMHANDLER_SINSTANCE_ADDR = PUBLISHED_ITEMHANDLER_SINSTANCE_ADDR + RELOCATION_DELTA

POLL_INTERVAL_S = 0.2


def decode(value) -> str:
    if value is None:
        return "?"
    if atr.HELD_ITEM_MIN <= value <= atr.HELD_ITEM_MAX:
        return atr.item_name(value)
    if value == 0x14:
        return "(no item)"
    return f"0x{value:02X}"


def _describe_pointer(label: str, addr: int) -> None:
    val = atr.read_ptr(addr)
    if val is None:
        print(f"  {label} (0x{addr:08X}): couldn't read")
        return
    in_range = 0x80000000 <= val < 0x81800000 or 0x90000000 <= val < 0x94000000
    print(f"  {label} (0x{addr:08X}) -> 0x{val:08X}  (in MEM1/MEM2 range: {in_range})")


SHAPE_RETRY_ATTEMPTS = 10
SHAPE_RETRY_INTERVAL_S = 1.0


def _retry_shape_check(addr: int) -> bool:
    """A single failed shape check could be a genuinely wrong address, or
    just an unlucky instant (e.g. read right as something was mid-update,
    or before all 12 recvPackets slots have ever been touched this race).
    Retries a few times before concluding either way, instead of judging
    the prediction off one snapshot."""
    for attempt in range(1, SHAPE_RETRY_ATTEMPTS + 1):
        if atr._itemhandler_shape_ok(addr):
            print(f"  shape check passed on attempt {attempt}/{SHAPE_RETRY_ATTEMPTS}")
            return True
        time.sleep(SHAPE_RETRY_INTERVAL_S)
    return False


def _dump_raw_recv_packets(addr: int) -> None:
    """Prints every one of the 12 recvPackets slots decoded, so a shape-
    check failure can be diagnosed by eye (which specific slot/field is
    out of range) instead of just reported as a yes/no."""
    try:
        buf = dme.read_bytes(
            addr + atr.ITEMHANDLER_OFF_RECV_PACKETS,
            atr.ITEMPACKET_SIZE * atr.ITEMHANDLER_RECV_PACKET_COUNT,
        )
    except Exception as e:
        print(f"  couldn't read recvPackets at 0x{addr:08X}: {e}")
        return
    print(f"  raw recvPackets[12] at 0x{addr:08X} (+0x{atr.ITEMHANDLER_OFF_RECV_PACKETS:X}):")
    for i in range(atr.ITEMHANDLER_RECV_PACKET_COUNT):
        base = i * atr.ITEMPACKET_SIZE
        timer = buf[base + atr.ITEMPACKET_OFF_TIMER]
        item_box = buf[base + atr.ITEMPACKET_OFF_ITEM_BOX]
        item_tail = buf[base + atr.ITEMPACKET_OFF_ITEM_TAIL]
        mode = buf[base + atr.ITEMPACKET_OFF_MODE]
        flags = []
        if item_box > atr.ITEM_OR_EMPTY_MAX:
            flags.append("item_box OUT OF RANGE")
        if item_tail > atr.ITEM_OR_EMPTY_MAX:
            flags.append("item_tail OUT OF RANGE")
        if mode > atr.ITEMPACKET_MODE_MAX:
            flags.append("mode OUT OF RANGE")
        flag_str = f"  <-- {', '.join(flags)}" if flags else ""
        print(
            f"    [{i:2d}] timer=0x{timer:02X} item_box={decode(item_box)} (0x{item_box:02X}) "
            f"item_tail={decode(item_tail)} (0x{item_tail:02X}) mode=0x{mode:02X}{flag_str}"
        )


def main() -> None:
    atr.hook_with_retry()

    print(f"Relocation delta from confirmed Raceinfo::sInstance: {RELOCATION_DELTA:+#x}")
    print(f"Predicted ITEMHandler::sInstance: 0x{PREDICTED_ITEMHANDLER_SINSTANCE_ADDR:08X}\n")

    target = atr.read_ptr(PREDICTED_ITEMHANDLER_SINSTANCE_ADDR)
    in_range = target is not None and (
        0x80000000 <= target < 0x81800000 or 0x90000000 <= target < 0x94000000
    )

    if not in_range:
        print("Prediction did NOT resolve to an in-range pointer. Diagnostic reads:")
        _describe_pointer("predicted ITEMHandler::sInstance", PREDICTED_ITEMHANDLER_SINSTANCE_ADDR)
        _describe_pointer("published (uncorrected) ITEMHandler::sInstance", PUBLISHED_ITEMHANDLER_SINSTANCE_ADDR)
        _describe_pointer("confirmed Raceinfo::sInstance (sanity check -- should already be known-good)", CONFIRMED_RACEINFO_SINSTANCE_ADDR)
        return

    print(f"Predicted address resolves to 0x{target:08X} (in range) -- checking shape, retrying for up to {SHAPE_RETRY_ATTEMPTS}s if it doesn't pass immediately...")
    shape_ok = _retry_shape_check(target)

    if not shape_ok:
        print(f"\nShape check never passed in {SHAPE_RETRY_ATTEMPTS} attempts. Raw data for manual inspection:")
        _dump_raw_recv_packets(target)
        return

    print(f"Prediction PASSED the shape check -- ITEMHandler::sInstance (0x{PREDICTED_ITEMHANDLER_SINSTANCE_ADDR:08X}) -> 0x{target:08X}\n")

    raceinfo_addr = atr.try_fast_path()
    if raceinfo_addr is None:
        print("Not in a race yet (shape check can pass outside a race too, if the object is already constructed).")
        print("Get into a race and re-run this to see live item tracking against your own pickups.")
        return

    player_addr = atr.get_local_player_addr(raceinfo_addr)
    player_id = dme.read_byte(player_addr + atr.PLAYER_OFF_ID)
    print(f"In a race. Local player id = {player_id}. Watching live -- play normally, Ctrl+C to stop.\n")

    prev_tail = None
    prev_box = None
    start = time.time()
    while True:
        if not dme.is_hooked():
            print("Lost hook to Dolphin. Exiting.")
            return
        # Re-resolve the ITEMHandler address every poll (cheap: one pointer
        # read) rather than trusting `target` for the rest of the race --
        # if this really is the permanent static slot (the whole point of
        # this prediction, unlike every heap-based candidate tried before),
        # it should resolve to the SAME address every time anyway, and if
        # it ever doesn't, that's itself useful information to see live.
        live_target = atr.read_ptr(PREDICTED_ITEMHANDLER_SINSTANCE_ADDR)
        if live_target is None:
            time.sleep(1.0)
            continue
        packet = atr.read_item_packet(live_target, player_id)
        if packet is None:
            time.sleep(1.0)
            continue
        tail = packet[atr.ITEMPACKET_OFF_ITEM_TAIL]
        box = packet[atr.ITEMPACKET_OFF_ITEM_BOX]
        if tail != prev_tail or box != prev_box:
            elapsed = time.time() - start
            print(
                f"[{elapsed:6.1f}s] item_tail: {decode(prev_tail)} -> {decode(tail)}   "
                f"item_box: {decode(prev_box)} -> {decode(box)}   (ITEMHandler @ 0x{live_target:08X})",
                flush=True,
            )
            prev_tail = tail
            prev_box = box
        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
