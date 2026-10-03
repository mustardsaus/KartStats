#!/usr/bin/env python3
"""Manual before/after memory diff for finding the real ITEMHandler address,
after three fully-automated approaches all failed against real Dolphin RAM
(see auto_track_race.py's long comment blocks above PLAYER_ITEM_SCAN_SIZE,
ITEMHANDLER_SINSTANCE_ADDR, and POINTER_TARGET_SCAN_SIZE for the full history:
direct player-struct scan, published ITEMHandler address, content-shape scan
alone, and pointer-chase from the player struct all came up empty or too
ambiguous).

This combines the two ideas still standing after that: the existing
shape-based ITEMHandler content scan (narrows "all of RAM" down to
"memory that's ITEMHandler-recvPackets-shaped", already built and tested in
auto_track_race.py) PLUS a controlled before/after diff keyed to a real,
known item pickup (instead of trusting shape alone, which produced 100,000+
ambiguous candidates against real RAM on its own).

Usage: you play normally. For each item you grab:
  1. Press Enter here right before you grab it.
  2. Go grab it in Dolphin.
  3. Press Enter here again right after (aim for within ~5 seconds -- the
     window isn't hard-enforced, just reported, since a slightly-long gap
     still gives usable data, just with slightly more chance of unrelated
     noise).
Repeat for as many items as you want (a handful of rounds is enough to
start narrowing things down), then type 'q' instead of starting a new round
to see the final summary.

Every round's output -- and the running intersection across rounds -- is
also written to item_snapshot_log.txt (next to this script) as it happens,
so it survives even if the terminal scrolls past it.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402 -- needs the sys.path fix-up above

np = atr.np
dme = atr.dme

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "item_snapshot_log.txt")
WARN_WINDOW_S = 5.0


def log(f, msg: str) -> None:
    print(msg, flush=True)
    f.write(msg + "\n")
    f.flush()


def read_region(start: int, end: int):
    """Full-region read as one numpy byte array, or None on failure."""
    try:
        return np.frombuffer(dme.read_bytes(start, end - start), dtype=np.uint8)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return None


def shape_mask(arr):
    """Same vectorized ITEMHandler-recvPackets shape filter as
    auto_track_race.scan_region_for_itemhandler, factored out to run against
    an already-fetched array (we need the SAME array for both the shape
    check and the item_tail diff, and we need it for both the before and
    after snapshot) instead of re-reading from Dolphin each time. Returns a
    boolean mask over 4-byte-aligned candidate positions (index i means
    candidate base address = region_start + i*4)."""
    block_size = atr.ITEMHANDLER_OFF_RECV_PACKETS + atr.ITEMPACKET_SIZE * atr.ITEMHANDLER_RECV_PACKET_COUNT
    n = (len(arr) - block_size) // 4 + 1
    if n <= 0:
        return np.zeros(0, dtype=bool), 0

    mask = np.ones(n, dtype=bool)
    any_nonzero = np.zeros(n, dtype=bool)
    timer_min = np.full(n, 255, dtype=np.uint8)
    timer_max = np.zeros(n, dtype=np.uint8)
    for i in range(atr.ITEMHANDLER_RECV_PACKET_COUNT):
        base = atr.ITEMHANDLER_OFF_RECV_PACKETS + i * atr.ITEMPACKET_SIZE
        timer = atr._read_u8_field(arr, base + atr.ITEMPACKET_OFF_TIMER, n)
        item_box = atr._read_u8_field(arr, base + atr.ITEMPACKET_OFF_ITEM_BOX, n)
        item_tail = atr._read_u8_field(arr, base + atr.ITEMPACKET_OFF_ITEM_TAIL, n)
        mode = atr._read_u8_field(arr, base + atr.ITEMPACKET_OFF_MODE, n)
        L = min(len(timer), len(item_box), len(item_tail), len(mode), len(mask))
        mask = mask[:L] & (item_box[:L] <= atr.ITEM_OR_EMPTY_MAX) & (item_tail[:L] <= atr.ITEM_OR_EMPTY_MAX) & (mode[:L] <= atr.ITEMPACKET_MODE_MAX)
        any_nonzero = any_nonzero[:L] | (item_box[:L] != 0) | (item_tail[:L] != 0) | (mode[:L] != 0)
        timer_min = np.minimum(timer_min[:L], timer[:L])
        timer_max = np.maximum(timer_max[:L], timer[:L])

    L = len(mask)
    spread = timer_max[:L].astype(np.int16) - timer_min[:L].astype(np.int16)
    spread = np.minimum(spread, 256 - spread)
    mask &= any_nonzero[:L] & (spread <= atr.TIMER_CLUSTER_MAX_SPREAD)
    return mask, n


def find_player_id(f) -> int:
    raceinfo_addr = atr.try_fast_path()
    if raceinfo_addr is None:
        log(f, "Fast path for Raceinfo didn't check out -- falling back to a full scan (this is slower; make sure you're actually in a race).")
        candidates, _timing, _counts, _no_random = atr.find_raceinfo_candidates()
        if not candidates:
            raise SystemExit("No Raceinfo candidate found. Are you in a race right now?")
        raceinfo_addr = candidates[0]
    player_addr = atr.get_local_player_addr(raceinfo_addr)
    if player_addr is None:
        raise SystemExit("Found Raceinfo but couldn't get the local player's address.")
    player_id = dme.read_byte(player_addr + atr.PLAYER_OFF_ID)
    log(f, f"Raceinfo -> 0x{raceinfo_addr:08X}, local player -> 0x{player_addr:08X}, player id = {player_id}")
    return player_id


def take_snapshot():
    return [(start, end, read_region(start, end)) for start, end in atr.REGIONS]


def decode(value: int) -> str:
    if atr.HELD_ITEM_MIN <= value <= atr.HELD_ITEM_MAX:
        return atr.item_name(value)
    if value == 0x14:
        return "(no item)"
    return f"0x{value:02X}"


def diff_round(f, before, after, player_id: int, running_intersection):
    """Runs the shape filter against `before` (the snapshot taken right
    before the pickup), then checks which of those candidates' item_tail
    byte -- at this specific player's recvPackets index -- actually changed
    to a plausible real item id (0x00-0x12, not just "still packet-shaped")
    between before and after. Returns the set of candidate addresses that
    were plausible this round, and updates running_intersection in place."""
    item_tail_off = atr.ITEMHANDLER_OFF_RECV_PACKETS + player_id * atr.ITEMPACKET_SIZE + atr.ITEMPACKET_OFF_ITEM_TAIL
    item_box_off = atr.ITEMHANDLER_OFF_RECV_PACKETS + player_id * atr.ITEMPACKET_SIZE + atr.ITEMPACKET_OFF_ITEM_BOX

    round_plausible = set()
    for (start, end, arr_before), (_s2, _e2, arr_after) in zip(before, after):
        if arr_before is None or arr_after is None:
            continue
        mask, n = shape_mask(arr_before)
        if n == 0:
            continue
        hits = np.nonzero(mask)[0]
        if len(hits) == 0:
            log(f, f"  0x{start:08X}-0x{end:08X}: 0 ITEMHandler-shaped candidates")
            continue

        idx_tail = hits * 4 + item_tail_off
        idx_box = hits * 4 + item_box_off
        # shape_mask already guarantees idx_tail/idx_box < len(arr_before)
        # for every hit (they're inside the same recvPackets block the mask
        # was computed over), and arr_after is the same region so same size.
        before_tail = arr_before[idx_tail]
        after_tail = arr_after[idx_tail]
        before_box = arr_before[idx_box]
        after_box = arr_after[idx_box]

        changed = before_tail != after_tail
        plausible = changed & (after_tail >= atr.HELD_ITEM_MIN) & (after_tail <= atr.HELD_ITEM_MAX)
        n_changed = int(np.count_nonzero(changed))
        n_plausible = int(np.count_nonzero(plausible))
        log(
            f,
            f"  0x{start:08X}-0x{end:08X}: {len(hits)} ITEMHandler-shaped candidate(s), "
            f"{n_changed} changed item_tail, {n_plausible} changed to a plausible item",
        )

        plausible_idx = np.nonzero(plausible)[0]
        for j in plausible_idx:
            addr = int(start + hits[j] * 4)
            log(
                f,
                f"    0x{addr:08X}: item_tail {decode(int(before_tail[j]))} -> {decode(int(after_tail[j]))}"
                f"  (item_box {decode(int(before_box[j]))} -> {decode(int(after_box[j]))})",
            )
            round_plausible.add(addr)

    if running_intersection[0] is None:
        running_intersection[0] = round_plausible
    else:
        running_intersection[0] &= round_plausible
    return round_plausible


def main() -> None:
    atr.hook_with_retry()
    with open(LOG_PATH, "a") as f:
        log(f, f"\n=== item_snapshot_diff session started {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
        log(
            f,
            "For each item: press Enter right before grabbing it, grab it, "
            "then press Enter again (aim for within ~5s). Type 'q' at a prompt "
            "instead of Enter when you're done, to see the final summary.\n",
        )

        player_id = find_player_id(f)
        running_intersection = [None]  # list so diff_round can mutate by reference
        round_num = 0

        while True:
            round_num += 1
            raw = input(f"[round {round_num}] Press Enter right before grabbing an item (or 'q' to stop): ")
            if raw.strip().lower() == "q":
                break
            log(f, f"[round {round_num}] taking BEFORE snapshot...")
            t_before = time.time()
            before = take_snapshot()
            log(f, f"[round {round_num}] BEFORE captured in {time.time() - t_before:.2f}s. Go grab the item now.")

            raw = input(f"[round {round_num}] Press Enter right after grabbing it (or 'q' to stop): ")
            if raw.strip().lower() == "q":
                break
            t_mark = time.time()
            window = t_mark - t_before
            log(f, f"[round {round_num}] taking AFTER snapshot... (elapsed since BEFORE: {window:.1f}s)")
            if window > WARN_WINDOW_S:
                log(f, f"[round {round_num}] note: that was over the {WARN_WINDOW_S:.0f}s target window -- still usable, just more room for unrelated noise.")
            after = take_snapshot()
            log(f, f"[round {round_num}] AFTER captured.")

            round_plausible = diff_round(f, before, after, player_id, running_intersection)
            log(f, f"[round {round_num}] plausible candidate(s) this round: {len(round_plausible)}")
            log(f, f"[round {round_num}] running intersection across all rounds so far: {len(running_intersection[0])}")
            for addr in sorted(running_intersection[0]):
                log(f, f"    0x{addr:08X}")
            log(f, "")

        log(f, "=== final summary ===")
        if running_intersection[0] is None:
            log(f, "No rounds completed.")
        elif not running_intersection[0]:
            log(f, "The intersection is empty -- no single address stayed plausible across every round. "
                   "(If some rounds had 0 plausible candidates, that round's noise wiped out anything real too "
                   "-- worth re-running with tighter timing.)")
        else:
            log(f, f"{len(running_intersection[0])} address(es) stayed plausible across every round:")
            for addr in sorted(running_intersection[0]):
                log(f, f"  0x{addr:08X}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
