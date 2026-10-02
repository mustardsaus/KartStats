"""
Autonomous race-position tracker -- rewritten around the real struct layout.

Earlier versions tried to find "a live player struct" by scanning for
numbers that merely looked plausible (position 1-12, lap/maxLap in range).
That approach had a fatal flaw live testing kept exposing: up to 12 racers
all have identical-looking structs, there's no actual "race over" flag
being checked (just a guess from the lap counter), and every heuristic
meant to patch that -- requiring movement, requiring evenly-spaced arrays,
waiting out freezes -- either reacted too slowly or found new ways to
misfire.

The real fix is to stop guessing and use the actual fields the game uses,
documented by the MKW reverse-engineering community at
https://github.com/SeekyCt/mkw-structures (raceinfo.h):

  - Raceinfo is a SINGLE global object (not one of many look-alikes) with
    a `stage` field: 0 = intro camera, 1 = countdown, 2 = race. This is
    the real "race in progress" signal.
  - RaceinfoPlayer (one per racer, reached via Raceinfo.players[i]) has a
    `stateFlags` bitfield at offset 0x38, where bit 0x20 means "finishing
    the race". This is the real finish signal -- not a guess from the lap
    counter ticking past maxLap.

Because Raceinfo is a singleton, it can be found with a much stricter
fingerprint than any per-player struct: several pointer fields that must
all point into valid emulated-RAM ranges, plus a couple of small-int/bool
fields, all at once. That combination is effectively impossible for
unrelated memory to produce by coincidence -- see find_raceinfo() below.
And because it's a singleton that exists for the whole Dolphin session,
it only has to be found ONCE, not re-scanned every race: no more chasing
a reallocated struct, no more racer-identity ambiguity, no more guessing
when a race ends.

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

# --- Raceinfo (the one global object), from raceinfo.h ---------------------
RACEINFO_OFF_RANDOM1 = 0x4
RACEINFO_OFF_RANDOM2 = 0x8
RACEINFO_OFF_PLAYERS = 0xC          # RaceinfoPlayer** -- pointer to an array of pointers
RACEINFO_OFF_STAGE = 0x28           # uint32: 0 = intro camera, 1 = countdown, 2 = race
RACEINFO_OFF_CAN_COUNTDOWN_START = 0x2C  # bool
RACEINFO_OFF_CUTSCENE_MODE = 0x2D        # bool
RACEINFO_SIZE = 0x4C

# --- RaceinfoPlayer (one per racer), from raceinfo.h ------------------------
PLAYER_OFF_ID = 0x8
PLAYER_OFF_POSITION = 0x20          # uint8_t, 1 = 1st place
PLAYER_OFF_CURRENT_LAP = 0x24       # uint16_t
PLAYER_OFF_MAX_LAP = 0x26           # uint8_t
PLAYER_OFF_STATE_FLAGS = 0x38       # uint32_t bit flags (see below)

STATE_IN_RACE = 0x1
STATE_END_RACE_CAMERA = 0x2
STATE_WRONG_WAY = 0x4
STATE_DC = 0x10
STATE_FINISHING = 0x20              # the real "crossed the finish line" signal
STATE_COMING_LAST_ANIM = 0x40

POINTER_SIZE = 4  # 32-bit PowerPC target
PLAYER_SLOT_INDEX = 0  # players[0] is the local player in single-player

# Wii has two RAM pools; Raceinfo (and the structs it points to) could land
# in either.
REGIONS = [
    (0x80000000, 0x81800000),  # MEM1, 24MB
    (0x90000000, 0x94000000),  # MEM2, 64MB
]

POLL_INTERVAL_S = 0.3
STALE_READS_TO_GIVE_UP = 8  # ~2.4s of bad reads -- treat the hook/pointer as gone
RESCAN_INTERVAL_S = 2.0     # how often to retry finding Raceinfo if not found yet


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


def _in_valid_range(vals):
    return ((vals >= 0x80000000) & (vals < 0x81800000)) | ((vals >= 0x90000000) & (vals < 0x94000000))


def _read_u32_field(arr, offset, n):
    b0 = arr[offset : offset + 4 * n : 4].astype(np.uint32)
    b1 = arr[offset + 1 : offset + 1 + 4 * n : 4].astype(np.uint32)
    b2 = arr[offset + 2 : offset + 2 + 4 * n : 4].astype(np.uint32)
    b3 = arr[offset + 3 : offset + 3 + 4 * n : 4].astype(np.uint32)
    L = min(len(b0), len(b1), len(b2), len(b3))
    return (b0[:L] << 24) | (b1[:L] << 16) | (b2[:L] << 8) | b3[:L]


def _read_u8_field(arr, offset, n):
    return arr[offset : offset + 4 * n : 4]


def scan_region_for_raceinfo(start: int, end: int):
    """One vectorized pass over [start, end) for 4-byte-aligned addresses
    that look like the Raceinfo singleton: several pointer fields that all
    have to land in valid emulated-RAM ranges at once, plus stage being a
    small known value and two bytes that have to look like bools. Several
    independent pointer fields agreeing is a much stronger fingerprint than
    any single struct's data values, because it's not just "these numbers
    are in a plausible range" -- it's "these four unrelated-looking memory
    locations all happen to be valid pointers simultaneously", which
    unrelated/coincidental memory essentially never produces."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return []

    arr = np.frombuffer(buf, dtype=np.uint8)
    n = (len(arr) - RACEINFO_SIZE) // 4 + 1
    if n <= 0:
        return []

    stage_vals = _read_u32_field(arr, RACEINFO_OFF_STAGE, n)
    random1_vals = _read_u32_field(arr, RACEINFO_OFF_RANDOM1, n)
    random2_vals = _read_u32_field(arr, RACEINFO_OFF_RANDOM2, n)
    players_vals = _read_u32_field(arr, RACEINFO_OFF_PLAYERS, n)
    L = min(len(stage_vals), len(random1_vals), len(random2_vals), len(players_vals))
    stage_vals, random1_vals, random2_vals, players_vals = (
        stage_vals[:L],
        random1_vals[:L],
        random2_vals[:L],
        players_vals[:L],
    )

    cds_vals = _read_u8_field(arr, RACEINFO_OFF_CAN_COUNTDOWN_START, n)[:L]
    cutscene_vals = _read_u8_field(arr, RACEINFO_OFF_CUTSCENE_MODE, n)[:L]

    mask = (
        (stage_vals <= 2)
        & _in_valid_range(random1_vals)
        & _in_valid_range(random2_vals)
        & _in_valid_range(players_vals)
        & (cds_vals <= 1)
        & (cutscene_vals <= 1)
    )
    idxs = np.nonzero(mask)[0]
    return [int(start + i * 4) for i in idxs]


def read_ptr(addr: int):
    try:
        return dme.read_word(addr)
    except Exception:
        return None


def read_player(player_addr: int):
    """Returns (position, currentLap, maxLap, stateFlags) or None."""
    try:
        pos = dme.read_byte(player_addr + PLAYER_OFF_POSITION)
        lap = int.from_bytes(dme.read_bytes(player_addr + PLAYER_OFF_CURRENT_LAP, 2), "big")
        maxlap = dme.read_byte(player_addr + PLAYER_OFF_MAX_LAP)
        flags = dme.read_word(player_addr + PLAYER_OFF_STATE_FLAGS)
        return pos, lap, maxlap, flags
    except Exception:
        return None


def verify_raceinfo_candidate(addr: int) -> bool:
    """Secondary, scalar check on a candidate that passed the vectorized
    pointer-shape filter: actually dereference players[] and confirm slot 0
    looks like a real player struct (small id, sane maxLap). Cheap since
    there should only be a handful of candidates to check this way."""
    players_ptr = read_ptr(addr + RACEINFO_OFF_PLAYERS)
    if players_ptr is None or not (
        0x80000000 <= players_ptr < 0x81800000 or 0x90000000 <= players_ptr < 0x94000000
    ):
        return False

    player0_ptr = read_ptr(players_ptr + PLAYER_SLOT_INDEX * POINTER_SIZE)
    if player0_ptr is None or not (
        0x80000000 <= player0_ptr < 0x81800000 or 0x90000000 <= player0_ptr < 0x94000000
    ):
        return False

    try:
        player_id = dme.read_byte(player0_ptr + PLAYER_OFF_ID)
    except Exception:
        return False
    if player_id > 11:
        return False

    player = read_player(player0_ptr)
    if player is None:
        return False
    pos, lap, maxlap, flags = player
    # maxLap is 0 before a race's settings are applied yet, or 3 (every real
    # MKW GP/VS race) once they are -- either is consistent with this really
    # being Raceinfo, just possibly caught before a race has started.
    return maxlap in (0, 3) and pos <= 12


def find_raceinfo():
    """One-time structural scan for the Raceinfo singleton. Returns its
    address, or None if nothing in this pass both matched the vectorized
    pointer-shape filter and survived scalar verification."""
    for start, end in REGIONS:
        for addr in scan_region_for_raceinfo(start, end):
            if verify_raceinfo_candidate(addr):
                return addr
    return None


def get_local_player_addr(raceinfo_addr: int):
    players_ptr = read_ptr(raceinfo_addr + RACEINFO_OFF_PLAYERS)
    if players_ptr is None:
        return None
    return read_ptr(players_ptr + PLAYER_SLOT_INDEX * POINTER_SIZE)


def wait_for_race_start(raceinfo_addr: int):
    """Block until Raceinfo.stage == 2 (actually racing, not the intro
    camera or countdown) and the local player's struct looks live."""
    stale = 0
    while True:
        if not dme.is_hooked():
            return None
        stage = read_ptr(raceinfo_addr + RACEINFO_OFF_STAGE)
        if stage == 2:
            player_addr = get_local_player_addr(raceinfo_addr)
            if player_addr:
                cur = read_player(player_addr)
                if cur is not None:
                    return player_addr
            stale += 1
        else:
            stale = 0
        if stale >= STALE_READS_TO_GIVE_UP:
            # stage says "race" but we can't get a sane player read -- the
            # pointer chain may have shifted (new Dolphin session). Bail out
            # to the caller so it can re-find Raceinfo from scratch.
            return None
        time.sleep(POLL_INTERVAL_S)


def track_until_race_ends(raceinfo_addr: int, player_addr: int, race_num: int):
    """Poll the local player's struct until the real finish flag
    (stateFlags & STATE_FINISHING) appears, Raceinfo.stage leaves 2 (race),
    or reads stop making sense entirely. Prints a line whenever position or
    lap changes. Returns ((pos, lap, maxlap), reason)."""
    last = None
    stale = 0

    first = read_player(player_addr)
    if first is not None:
        pos, lap, maxlap, _flags = first
        print(f"[race {race_num}] starting position: {pos}  (lap {lap}/{maxlap})", flush=True)
        last = first

    while True:
        if not dme.is_hooked():
            return (last[:3] if last else None), "hook_lost"

        cur = read_player(player_addr)
        stage = read_ptr(raceinfo_addr + RACEINFO_OFF_STAGE)

        if cur is None:
            stale += 1
            if stale >= STALE_READS_TO_GIVE_UP:
                return (last[:3] if last else None), "struct_gone"
            time.sleep(POLL_INTERVAL_S)
            continue
        stale = 0

        pos, lap, maxlap, flags = cur
        if last is not None and (pos != last[0] or lap != last[1]):
            print(f"[race {race_num}] position: {pos}  (lap {lap}/{maxlap})", flush=True)
        last = cur

        if flags & STATE_FINISHING:
            return cur[:3], "finished"
        if stage is not None and stage != 2:
            return cur[:3], "left_race_stage"

        time.sleep(POLL_INTERVAL_S)


def main() -> None:
    hook_with_retry()
    print(
        "Autonomous tracking started -- play normally. No need to tell me "
        "when a race starts or ends; I'll print each race's final position "
        "as soon as it's over. Ctrl+C to stop.\n"
    )

    raceinfo_addr = None
    race_num = 0
    while True:
        if not dme.is_hooked():
            print("Lost hook to Dolphin. Exiting.")
            return

        if raceinfo_addr is None:
            print("Looking for Raceinfo (one-time; this address stays valid all session)...", flush=True)
            raceinfo_addr = find_raceinfo()
            if raceinfo_addr is None:
                time.sleep(RESCAN_INTERVAL_S)
                continue
            print(f"Found Raceinfo at 0x{raceinfo_addr:08X}.\n", flush=True)

        player_addr = wait_for_race_start(raceinfo_addr)
        if player_addr is None:
            # Either Dolphin's gone, or this address stopped making sense
            # (new session) -- drop it and look again from scratch.
            if dme.is_hooked():
                raceinfo_addr = None
            continue

        race_num += 1
        result, reason = track_until_race_ends(raceinfo_addr, player_addr, race_num)
        if result is None:
            print(f"[race {race_num}] lost it before getting a solid reading; resuming.\n", flush=True)
            continue

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
