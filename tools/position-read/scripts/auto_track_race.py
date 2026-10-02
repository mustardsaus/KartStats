"""
Autonomous race-position tracker.

Unlike probe_position.py, this doesn't need a confirmed Raceinfo::sInstance
address and doesn't need anyone to say "race started" / "race ended". It
finds the live player struct itself by scanning Dolphin's emulated RAM for
bytes that look like a real (position, currentLap, maxLap) triple -- see
RaceinfoPlayer in https://github.com/SeekyCt/mkw-structures (raceinfo.h) --
then confirms the match over a few quick re-checks (a real struct's maxLap
never changes mid-race and its lap never goes backwards, and something
about it -- position or lap -- actually has to move; a coincidental match
on static memory never does). Once locked on, it polls that address until
the struct stops looking valid (torn down between races, or lap counter
ticks past maxLap -- MKW's finish-line tell) and prints the last position
it saw as that race's final result. It also remembers that address and
tries it again first on the next race before doing a full rescan, since
MKW's allocator tends to reuse the same struct slot race after race; full
rescans are the fallback, not the steady state. Then it goes back to
watching for the next race. Repeat forever.

This sidesteps the whole "find the NTSC-U sInstance address" problem from
probe_position.py / README.md Step 1 -- we never need the static pointer,
only the live struct, which this finds fresh every race.

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
MAXLAP_MIN, MAXLAP_MAX = 2, 9        # real races are 3 laps; a "1-lap race" is never real, just noise

NARROW_ROUNDS = 5
NARROW_INTERVAL_S = 1.2
POLL_INTERVAL_S = 0.3
STALE_READS_TO_GIVE_UP = 4  # ~1.2s of bad reads = struct's gone
FROZEN_POLLS_TO_FINISH = 10  # ~3s of a completely unchanged reading on the last lap
RELOCK_TIMEOUT_S = 8.0  # how long to wait on a previously-seen address before falling back to a full rescan


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


def find_live_struct():
    """Scan, then narrow across a few re-checks, keeping only candidates
    whose maxLap never changes and whose lap never goes backwards, then
    require the lap to have actually ticked forward at least once before
    locking on. Returns a locked address, or None if nothing both survived
    the narrowing and demonstrably moved (so the caller should just rescan
    rather than lock onto a static, coincidentally-plausible address)."""
    candidates = scan_all_regions()
    if not candidates:
        return None

    history = {addr: [vals] for addr, vals in candidates.items()}
    for _ in range(NARROW_ROUNDS):
        time.sleep(NARROW_INTERVAL_S)
        survivors = {}
        for addr, hist in history.items():
            cur = read_one(addr)
            if cur is None:
                continue
            pos, lap, maxlap = cur
            first_maxlap = hist[0][2]
            last_lap = hist[-1][1]
            if (
                POSITION_MIN <= pos <= POSITION_MAX
                and maxlap == first_maxlap
                and lap >= last_lap
                and lap <= maxlap + 1
            ):
                survivors[addr] = hist + [cur]
        history = survivors
        if not history:
            return None
        if len(history) == 1:
            break

    if not history:
        return None
    # Require *something* to have actually moved -- a static, coincidentally
    # plausible address (unrelated memory that happens to read as a
    # valid-looking triple) trivially survives the "non-decreasing lap,
    # unchanged maxLap" checks above by never changing at all. Real race
    # state moves. Lap only ticks over once every 20-90s, far longer than
    # this narrowing window, so require it OR a position change instead --
    # position swaps happen constantly mid-race (overtakes) and almost never
    # for truly static memory. If nothing moved yet, don't guess -- return
    # None so the caller rescans rather than locking onto noise.
    def moved(hist):
        first_pos = hist[0][0]
        if any(v[0] != first_pos for v in hist[1:]):
            return True
        return hist[-1][1] > hist[0][1]

    moving = [a for a, h in history.items() if moved(h)]
    return moving[0] if moving else None


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

    Three ways a race is considered over:
      - "finished": currentLap ticks past maxLap -- the tell for actually
        crossing the finish line, per raceinfo.h.
      - "struct_gone": reads stop looking valid at all (torn down between
        races).
      - "frozen_on_last_lap": the reading stops changing at all, for a few
        seconds, while already on the last lap -- covers games/tracks where
        the results/podium screen keeps the struct alive with frozen final
        values instead of tearing it down or ticking the lap counter over.
    """
    last_valid = None
    stale_reads = 0
    frozen_streak = 0

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

            if last_valid is not None and cur == last_valid:
                frozen_streak += 1
                if cur[1] >= cur[2] and frozen_streak >= FROZEN_POLLS_TO_FINISH:
                    return cur, "frozen_on_last_lap"
            else:
                frozen_streak = 0
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
            addr = find_live_struct()
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
