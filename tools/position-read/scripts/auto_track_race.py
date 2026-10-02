"""
Autonomous race-position tracker.

Unlike probe_position.py, this doesn't need a confirmed Raceinfo::sInstance
address and doesn't need anyone to say "race started" / "race ended".

Earlier versions of this script tried to find "the" live player struct by
scanning for a single address whose (position, currentLap, maxLap) looked
plausible, then confirming it by watching it change. That approach had a
fatal flaw live testing exposed: in a race with up to 12 racers, every
single racer -- you and every CPU -- has an identical-looking struct with
equally valid position/lap/maxLap values. There is no way to tell your own
struct apart from a CPU's by its values alone, so a "looks plausible and
changes" scan can just as easily lock onto an opponent, and whichever one
it grabs will occasionally sit still for a few seconds (stuck on a wall,
hit by an item) and get mistaken for the race having ended.

This version finds the actual Raceinfo.players[] *array* instead of
guessing at one struct: every racer's struct sits in memory as one block,
back to back at a constant stride. That pattern of N evenly-spaced,
simultaneously-plausible addresses is essentially impossible for unrelated
memory to produce by coincidence, so once found, it's a high-confidence
structural match rather than a numeric guess -- and the first (lowest
address) slot in that array is the local player, so there's no more
racer-selection ambiguity. See find_player_array() below.

Once locked on, it polls that address until the struct stops looking valid
(torn down between races, or lap counter ticks past maxLap -- MKW's
finish-line tell) and prints the last position it saw as that race's final
result. It also remembers that address and tries it again first on the
next race before doing a full rescan, since MKW's allocator tends to reuse
the same array location race after race; full rescans are the fallback,
not the steady state. Then it goes back to watching for the next race.
Repeat forever.

This sidesteps the whole "find the NTSC-U sInstance address" problem from
probe_position.py / README.md Step 1 -- we never need the static pointer,
only the live array, which this finds fresh every race.

IMPORTANT -- this must run with your Mac's own, native Python, not through
any sandboxed/remote shell: it talks directly to Dolphin's real process
memory via dolphin-memory-engine, which only works from a process actually
running on your Mac. See README.md's "Autonomous tracking" section for the
one-time native-venv setup if you haven't done it yet.

Usage:
    python scripts/auto_track_race.py
Ctrl+C to stop.
"""

import sys
import time

try:
    import numpy as np
except ImportError:
    print(
        "numpy isn't installed. From tools/position-read, with your venv active:\n"
        "  pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    import dolphin_memory_engine as dme
except ImportError:
    print(
        "dolphin_memory_engine isn't installed. From tools/position-read, run:\n"
        "  python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

# --- RaceinfoPlayer struct offsets, from raceinfo.h -----------------------
POS_OFF = 0x20      # uint8_t position, 1 = 1st place
LAP_OFF = 0x24       # uint16_t currentLap
MAXLAP_OFF = 0x26    # uint8_t maxLap
STRUCT_SCAN_END = 0x28  # bytes of struct we actually touch, for bounds math

# Wii has two RAM pools; the struct could land in either, and the earlier
# manual-scanning session's one false positive (0x91078A3D) was in MEM2 --
# good evidence real game state does live there too, so scan both.
REGIONS = [
    (0x80000000, 0x81800000),  # MEM1, 24MB
    (0x90000000, 0x94000000),  # MEM2, 64MB
]

POSITION_MIN, POSITION_MAX = 1, 12   # 1st..12th (max racers in a MKW race)
# Every GP/VS race in Mario Kart Wii is exactly 3 laps -- no exceptions. Every
# false lock seen in live testing (maxLap read as 2, 4, 8) had a maxLap that
# could never be real; being "generous" here was exactly what let noise in.
# Locking this to the one real value is the single highest-leverage filter
# in this whole script.
MAXLAP_MIN, MAXLAP_MAX = 3, 3

POLL_INTERVAL_S = 0.3
STALE_READS_TO_GIVE_UP = 8  # ~2.4s of bad reads = struct's gone (not just a one-frame hiccup)
RELOCK_TIMEOUT_S = 8.0  # how long to wait on a previously-seen address before falling back to a full rescan

# players[] array detection: how many evenly-spaced plausible structs in a
# row counts as "this has to be the real array, not coincidence", and the
# plausible range for sizeof(RaceinfoPlayer) (the stride between them).
# RaceinfoPlayer is certainly bigger than the 0x28 bytes we actually touch,
# and almost certainly nowhere near 16KB; these bounds are deliberately
# loose, they just rule out degenerate matches.
PLAYER_ARRAY_MIN_RUN = 4
PLAYER_ARRAY_STRIDE_MIN = 0x40
PLAYER_ARRAY_STRIDE_MAX = 0x4000
PLAYER_SLOT_INDEX = 0  # array index 0 is the local player in single-player


def hook_with_retry(timeout_s: float = 30.0) -> None:
    print("Hooking into Dolphin...")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        dme.hook()
        if dme.is_hooked():
            print("Hooked.\n")
            return
        time.sleep(1)
    print(
        "Could not hook into Dolphin. Checklist:\n"
        "  - Is Dolphin actually running with a game loaded (not just the menu)?\n"
        "  - Did you re-sign Dolphin with MacSetup.sh after your last update?\n"
        "    (see tools/position-read/README.md)",
        file=sys.stderr,
    )
    sys.exit(1)


def scan_region(start: int, end: int) -> dict:
    """One vectorized pass over [start, end) for 4-byte-aligned addresses
    whose (position, currentLap, maxLap) triple is at least plausible."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return {}

    arr = np.frombuffer(buf, dtype=np.uint8)
    n = (len(arr) - STRUCT_SCAN_END) // 4 + 1
    if n <= 0:
        return {}

    pos_vals = arr[POS_OFF : POS_OFF + 4 * n : 4]
    lap_hi = arr[LAP_OFF : LAP_OFF + 4 * n : 4].astype(np.uint16)
    lap_lo = arr[LAP_OFF + 1 : LAP_OFF + 1 + 4 * n : 4].astype(np.uint16)
    maxlap_vals = arr[MAXLAP_OFF : MAXLAP_OFF + 4 * n : 4]

    L = min(len(pos_vals), len(lap_hi), len(lap_lo), len(maxlap_vals))
    pos_vals, lap_hi, lap_lo, maxlap_vals = (
        pos_vals[:L],
        lap_hi[:L],
        lap_lo[:L],
        maxlap_vals[:L],
    )
    lap_vals = (lap_hi << 8) | lap_lo

    mask = (
        (pos_vals >= POSITION_MIN)
        & (pos_vals <= POSITION_MAX)
        & (maxlap_vals >= MAXLAP_MIN)
        & (maxlap_vals <= MAXLAP_MAX)
        & (lap_vals <= maxlap_vals.astype(np.uint16) + 1)
    )
    idxs = np.nonzero(mask)[0]
    return {
        int(start + i * 4): (int(pos_vals[i]), int(lap_vals[i]), int(maxlap_vals[i]))
        for i in idxs
    }


def scan_all_regions() -> dict:
    found = {}
    for start, end in REGIONS:
        found.update(scan_region(start, end))
    return found


def read_one(addr: int):
    try:
        pos = dme.read_byte(addr + POS_OFF)
        lap = int.from_bytes(dme.read_bytes(addr + LAP_OFF, 2), "big")
        maxlap = dme.read_byte(addr + MAXLAP_OFF)
        return pos, lap, maxlap
    except Exception:
        return None


def find_player_array():
    """Find the real Raceinfo.players[] array by its structure rather than
    guessing at a single address: scan for every plausible (position,
    currentLap, maxLap) triple, then look for the longest run of candidate
    addresses evenly spaced at a constant stride. A handful of racers' real
    structs sitting back to back produce exactly that pattern; scattered
    unrelated memory essentially never does by chance. Returns the lowest
    address in the longest qualifying run (array slot 0 = local player), or
    None if nothing found this pass qualifies (so the caller should just
    rescan rather than lock onto noise)."""
    candidates = scan_all_regions()
    if len(candidates) < PLAYER_ARRAY_MIN_RUN:
        return None

    addrs = sorted(candidates.keys())
    best_run = []
    cur_run = [addrs[0]]
    cur_stride = None
    for k in range(1, len(addrs)):
        d = addrs[k] - addrs[k - 1]
        if cur_stride is None or d == cur_stride:
            cur_stride = d
            cur_run.append(addrs[k])
        else:
            if (
                PLAYER_ARRAY_STRIDE_MIN <= cur_stride <= PLAYER_ARRAY_STRIDE_MAX
                and len(cur_run) > len(best_run)
            ):
                best_run = cur_run
            cur_run = [addrs[k - 1], addrs[k]]
            cur_stride = d
    if (
        cur_stride is not None
        and PLAYER_ARRAY_STRIDE_MIN <= cur_stride <= PLAYER_ARRAY_STRIDE_MAX
        and len(cur_run) > len(best_run)
    ):
        best_run = cur_run

    if len(best_run) < PLAYER_ARRAY_MIN_RUN:
        return None
    idx = PLAYER_SLOT_INDEX if PLAYER_SLOT_INDEX < len(best_run) else 0
    addr = best_run[idx]

    # Two more checks before trusting this, both cheap (a couple of extra
    # reads of one address, not another full memory scan):
    #
    # 1. If the chosen slot already reads as "finished" (lap > maxLap) the
    #    instant we find it, that's not a race in progress -- it's the
    #    previous race's result still sitting there, not yet reset because a
    #    new race hasn't actually started. Locking onto that reports a stale
    #    leftover as a brand new "race" with nothing having been played.
    #
    # 2. A brief pause, then read again: a one-off glitch (caught mid-write,
    #    a frame where this address briefly looked array-like before
    #    settling into its real contents or getting zeroed) won't still look
    #    valid a moment later. A real race's struct will. This is what
    #    caught locking onto "position 0, lap 0/0" that vanished immediately.
    cur = read_one(addr)
    if cur is None or cur[1] > cur[2]:
        return None

    time.sleep(0.3)
    cur2 = read_one(addr)
    if cur2 is None or not (POSITION_MIN <= cur2[0] <= POSITION_MAX) or cur2[2] != cur[2] or cur2[1] > cur2[2]:
        return None

    return addr


def wait_for_fresh_race_at(addr: int, timeout_s: float = RELOCK_TIMEOUT_S):
    """Watch a previously-confirmed address, waiting for it to look like the
    *start* of a new race (a valid reading with a low lap count). MKW's
    allocator reliably reuses the same struct slot race after race -- the
    live run that found this approach locked onto addresses 0x811194E0 and
    0x81117F6C on two different races, less than 0x2000 apart -- so this
    almost always beats a full rescan, and it has a nice side effect: it
    naturally waits for the actual start of the race instead of locking on
    mid-race or onto a stale frozen reading left over from the last one."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        cur = read_one(addr)
        if cur is not None:
            pos, lap, maxlap = cur
            if POSITION_MIN <= pos <= POSITION_MAX and MAXLAP_MIN <= maxlap <= MAXLAP_MAX and lap <= 1:
                return addr
        time.sleep(POLL_INTERVAL_S)
    return None


def track_until_race_ends(addr: int, race_num: int):
    """Poll one locked address until it stops looking like a live race,
    printing a line every time the position or lap actually changes (so
    there's visible life, not silence until the very end). Returns
    ((pos, lap, maxlap), reason) using the last valid reading, or
    (None, "hook_lost") if Dolphin itself went away.

    Only two ways a race is considered over:
      - "finished": currentLap ticks past maxLap -- the tell for actually
        crossing the finish line, per raceinfo.h.
      - "struct_gone": reads stop looking valid at all (torn down between
        races).

    An earlier version also declared the race over after a few seconds of
    a completely unchanged reading ("frozen on the last lap"), meant to
    cover games/tracks that keep the struct alive with frozen final values
    instead of tearing it down. Live testing showed that was actively
    harmful: position only changes when someone gets overtaken, so holding
    6th (say) for several uneventful seconds near the end of a lap is
    normal racing, not evidence the race ended -- and it chopped single
    real races into several fake ones. No fixed timeout can tell those
    apart (a dominant leader can hold position for an entire last lap), so
    it's gone; "finished" and "struct_gone" are the only signals that have
    actually proven correct.
    """
    last_valid = None
    stale_reads = 0

    first = read_one(addr)
    if first is not None:
        pos, lap, maxlap = first
        print(f"[race {race_num}] starting position: {pos}  (lap {lap}/{maxlap})", flush=True)
        last_valid = first

    while True:
        if not dme.is_hooked():
            return None, "hook_lost"

        cur = read_one(addr)
        valid = False
        if cur is not None:
            pos, lap, maxlap = cur
            valid = (
                POSITION_MIN <= pos <= POSITION_MAX
                and 0 <= lap <= maxlap + 1
                and (last_valid is None or maxlap == last_valid[2])
            )

        if valid:
            stale_reads = 0
            if cur[1] > cur[2]:  # currentLap > maxLap: crossed the finish line
                return cur, "finished"

            if last_valid is not None and (cur[0] != last_valid[0] or cur[1] != last_valid[1]):
                print(
                    f"[race {race_num}] position: {cur[0]}  (lap {cur[1]}/{cur[2]})",
                    flush=True,
                )
            last_valid = cur
        else:
            stale_reads += 1

        if stale_reads >= STALE_READS_TO_GIVE_UP:
            return last_valid, "struct_gone"

        time.sleep(POLL_INTERVAL_S)


def main() -> None:
    hook_with_retry()
    print(
        "Autonomous tracking started -- play normally. No need to tell me "
        "when a race starts or ends; I'll print each race's final position "
        "as soon as it's over. Ctrl+C to stop.\n"
    )
    race_num = 0
    last_addr = None
    while True:
        if not dme.is_hooked():
            print("Lost hook to Dolphin. Exiting.")
            return

        addr = None
        if last_addr is not None:
            addr = wait_for_fresh_race_at(last_addr)
        if addr is None:
            addr = find_player_array()
        if addr is None:
            time.sleep(1.0)
            continue

        race_num += 1
        how = "same slot as last race" if addr == last_addr else "fresh scan"
        print(f"[race {race_num}] locked onto 0x{addr:08X} ({how}) -- tracking...", flush=True)
        result, reason = track_until_race_ends(addr, race_num)
        if result is None:
            print(f"[race {race_num}] lost it before getting a solid reading; resuming scan.\n", flush=True)
            continue

        last_addr = addr
        pos, lap, maxlap = result
        print(
            f"[race {race_num}] FINAL POSITION: {pos}  "
            f"(lap {lap}/{maxlap}, ended via {reason})\n",
            flush=True,
        )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
