#!/usr/bin/env python3
"""Fully automatic version of item_snapshot_diff.py -- no manual Enter
presses, no copy-pasting a hex address into a second script.

Why this exists: the manual two-script workflow (item_snapshot_diff.py's
round-based diff, then copying its surviving candidate's address into
verify_itemhandler_candidate.py) requires exact timing and a hex-address
round-trip under time pressure during a race. It also turned out the
candidates it's hunting for are per-race heap addresses (confirmed:
Raceinfo's own logged address changed between two item_snapshot_diff.py
sessions in the same Dolphin boot), so any delay between finding a
candidate and testing it risks it going stale.

This script removes the manual steps instead of asking for more careful
manual timing:
  - Auto-detects when you're in a race (same Raceinfo fast-path/scan logic
    auto_track_race.py already uses).
  - Automatically takes a full MEM1+MEM2 snapshot every SNAPSHOT_INTERVAL_S
    seconds -- no Enter presses. You just play normally.
  - Diffs each snapshot against the previous one with the same
    shape-based ITEMHandler filter from item_snapshot_diff.py, recording
    every shape-passing candidate's item_tail value over time.
  - Stops automatically when the race finishes (same STATE_FINISHING flag
    the position tracker already uses), or on Ctrl+C.
  - Ranks candidates by how many DISTINCT plausible items they showed
    over the whole race, not by "changed in literally every round" (the
    manual tool's AND-based intersection breaks here, since an automatic
    timer will often land on quiet stretches with no pickup at all).
    Separately flags candidates whose value changed but only ever to the
    exact same thing every time -- the signature we already confirmed
    this session belongs to an unrelated periodic array (most likely
    in-flight shell/banana projectile objects), not a real per-player
    item.

Usage: python3 auto_item_finder.py
Just start it before or during a race and play normally. Everything is
also written to auto_item_finder_log.txt next to this script.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402
import item_snapshot_diff as isd  # noqa: E402

dme = atr.dme
np = atr.np

LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auto_item_finder_log.txt")
SNAPSHOT_INTERVAL_S = 4.0
MIN_APPEARANCES_TO_REPORT = 2  # ignore one-off single-change flukes in the final ranking


def log(f, msg: str) -> None:
    print(msg, flush=True)
    f.write(msg + "\n")
    f.flush()


def wait_for_race(f):
    """Blocks until a race is detected, reusing the exact same discovery
    path as auto_track_race.py (fast path first, full scan fallback) --
    nothing new or unverified here."""
    log(f, "Waiting for a race (start Dolphin and get into a race -- this checks automatically)...")
    while True:
        raceinfo_addr = atr.try_fast_path()
        if raceinfo_addr is not None:
            return raceinfo_addr
        candidates, _t, _c, _nr = atr.find_raceinfo_candidates()
        if candidates:
            return candidates[0]
        time.sleep(0.5)


def value_at(snapshot, addr: int, offset: int):
    """Looks up the byte at addr+offset within whichever region of
    `snapshot` (a list of (start, end, arr) from item_snapshot_diff.take_
    snapshot) contains it. Returns None if addr+offset isn't in any
    captured region or the region failed to read."""
    for start, end, arr in snapshot:
        if arr is None:
            continue
        if start <= addr < end:
            local = addr - start + offset
            if 0 <= local < len(arr):
                return int(arr[local])
    return None


def record_history(f, prev_snapshot, cur_snapshot, player_id: int, item_tail_off: int, history: dict, elapsed: float):
    """Same shape+change-to-plausible-item test as item_snapshot_diff.
    diff_round, but instead of a single round's plausible set, appends
    every plausible change to a per-address running history so the final
    report can rank by value DIVERSITY rather than "changed every round"
    (which doesn't hold for an automatic timer -- quiet stretches with no
    pickup are normal and shouldn't disqualify the real address)."""
    n_total = 0
    for (start, end, arr_before), (_s2, _e2, arr_after) in zip(prev_snapshot, cur_snapshot):
        if arr_before is None or arr_after is None:
            continue
        mask, n = isd.shape_mask(arr_before)
        if n == 0:
            continue
        hits = np.nonzero(mask)[0]
        if len(hits) == 0:
            continue
        idx_tail = hits * 4 + item_tail_off
        before_tail = arr_before[idx_tail]
        after_tail = arr_after[idx_tail]
        changed = before_tail != after_tail
        plausible = changed & (after_tail >= atr.HELD_ITEM_MIN) & (after_tail <= atr.HELD_ITEM_MAX)
        plausible_idx = np.nonzero(plausible)[0]
        n_total += len(plausible_idx)
        for j in plausible_idx:
            # addr is the candidate's ITEMHANDLER BASE address (same
            # convention as item_snapshot_diff.diff_round) -- NOT the
            # item_tail byte's own address. To read item_tail live,
            # read_item_packet(addr, player_id) adds the right offsets
            # itself; don't subtract item_tail_off from this again.
            addr = int(start + hits[j] * 4)
            before_val = int(before_tail[j])
            after_val = int(after_tail[j])
            history.setdefault(addr, []).append((elapsed, before_val, after_val))
    return n_total


def print_report(f, history: dict, item_tail_off: int):
    if not history:
        log(f, "No candidates ever showed a plausible item change during this capture.")
        return

    ranked = []
    noise = []
    for addr, entries in history.items():
        if len(entries) < MIN_APPEARANCES_TO_REPORT:
            continue
        # The noise signature confirmed this session (0x803417A4 etc. in
        # the manual run) is the exact same (before, after) PAIR repeating
        # every single time -- not just a single after-value, since a
        # cyclic/periodic process sampled finely enough can show up as
        # a FEW alternating after-values while still being the same fixed
        # cycle, not a real item pickup. Distinct PAIRS is the sharper test.
        distinct_pairs = sorted(set((b, a) for _t, b, a in entries))
        distinct_after = sorted(set(a for _t, _b, a in entries))
        if len(distinct_pairs) == 1:
            noise.append((addr, entries))
        else:
            ranked.append((addr, entries, distinct_pairs, distinct_after))

    ranked.sort(key=lambda row: len(row[3]), reverse=True)

    log(f, "\n=== promising candidates (showed more than one distinct plausible item) ===")
    if not ranked:
        log(f, "  none -- every repeat offender only ever showed the exact same transition every time (see noise list below).")
    for addr, entries, distinct_pairs, distinct_after in ranked:
        values_desc = ", ".join(f"{t:.1f}s:{isd.decode(a)}" for t, _b, a in entries)
        log(f, f"  0x{addr:08X}  (this IS the ItemHandler base -- pass it straight to verify_itemhandler_candidate.py) -- {len(distinct_after)} distinct value(s), {len(entries)} change(s)")
        log(f, f"    {values_desc}")

    log(f, f"\n=== likely noise (same exact transition every time, {len(noise)} address(es)) ===")
    log(f, "  (collapsed -- this is the signature of an unrelated periodic array, e.g. shell/banana projectiles, not a real per-player item)")
    for addr, entries in sorted(noise, key=lambda row: -len(row[1]))[:10]:
        _t0, b0, a0 = entries[0]
        log(f, f"  0x{addr:08X}: {len(entries)}x always {isd.decode(b0)} -> {isd.decode(a0)}")
    if len(noise) > 10:
        log(f, f"  ... and {len(noise) - 10} more")


def main() -> None:
    atr.hook_with_retry()
    with open(LOG_PATH, "a") as f:
        log(f, f"\n=== auto_item_finder session started {time.strftime('%Y-%m-%d %H:%M:%S')} ===")

        raceinfo_addr = wait_for_race(f)
        player_addr = atr.get_local_player_addr(raceinfo_addr)
        player_id = dme.read_byte(player_addr + atr.PLAYER_OFF_ID)
        item_tail_off = atr.ITEMHANDLER_OFF_RECV_PACKETS + player_id * atr.ITEMPACKET_SIZE + atr.ITEMPACKET_OFF_ITEM_TAIL
        log(f, f"In a race. Raceinfo -> 0x{raceinfo_addr:08X}, player id = {player_id}.")
        log(f, f"Capturing a snapshot every {SNAPSHOT_INTERVAL_S:.0f}s automatically until the race ends. Just play normally.\n")

        history = {}
        prev_snapshot = isd.take_snapshot()
        t0 = time.time()
        round_num = 0

        try:
            while True:
                if not dme.is_hooked():
                    log(f, "Lost hook to Dolphin.")
                    break
                flags = dme.read_word(player_addr + atr.PLAYER_OFF_STATE_FLAGS)
                if flags is not None and flags & atr.STATE_FINISHING:
                    log(f, "Race finished -- stopping capture.")
                    break
                time.sleep(SNAPSHOT_INTERVAL_S)
                round_num += 1
                elapsed = time.time() - t0
                cur_snapshot = isd.take_snapshot()
                n_this_round = record_history(f, prev_snapshot, cur_snapshot, player_id, item_tail_off, history, elapsed)
                log(f, f"[{elapsed:6.1f}s] snapshot {round_num}: {n_this_round} plausible change(s) this interval, {len(history)} address(es) tracked so far")
                prev_snapshot = cur_snapshot
        except KeyboardInterrupt:
            log(f, "\nStopped by Ctrl+C -- showing whatever was captured so far.")

        print_report(f, history, item_tail_off)


if __name__ == "__main__":
    main()
