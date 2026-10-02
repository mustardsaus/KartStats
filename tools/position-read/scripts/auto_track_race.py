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
unrelated memory to produce by coincidence -- see find_raceinfo_candidates()
below.
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

# --- Racedata settings (the chosen course/cup/lap-count for the race) ------
# A SEPARATE singleton from Raceinfo -- racedata.h has no course/track field
# anywhere in Raceinfo/RaceinfoPlayer, it lives in Racedata's nested
# RacedataSettings struct instead. No pointer connects the two, so this
# needs its own independent memory scan rather than an offset off the
# Raceinfo address we already have.
RACEDATA_OFF_COURSE_ID = 0x0        # uint32 -- see TRACK_NAMES below
RACEDATA_OFF_ENGINE_CLASS = 0x4     # uint32, small enum (50cc/100cc/150cc/mirror)
RACEDATA_OFF_GAMEMODE = 0x8         # uint32, small enum
RACEDATA_OFF_CPU_MODE = 0x14        # uint32, small enum
RACEDATA_OFF_ITEM_MODE = 0x18       # uint32, small enum
RACEDATA_OFF_CUP_ID = 0x20          # uint32
RACEDATA_OFF_RACE_NUMBER = 0x24     # uint8_t, 0-3 (which race in the cup)
RACEDATA_OFF_LAP_COUNT = 0x25       # uint8_t -- always 3 for a real MKW race,
                                     # the strongest single filter here (same
                                     # role RaceinfoPlayer.maxLap played)
RACEDATA_SETTINGS_SIZE = 0x28

# Course IDs per http://wiki.tockdom.com/wiki/List_of_Identifiers#Courses
# (the same source racedata.h's own comment points to).
TRACK_NAMES = {
    0x00: "Mario Circuit", 0x01: "Moo Moo Meadows", 0x02: "Mushroom Gorge",
    0x03: "Grumble Volcano", 0x04: "Toad's Factory", 0x05: "Coconut Mall",
    0x06: "DK Summit", 0x07: "Wario's Gold Mine", 0x08: "Luigi Circuit",
    0x09: "Daisy Circuit", 0x0A: "Moonview Highway", 0x0B: "Maple Treeway",
    0x0C: "Bowser's Castle", 0x0D: "Rainbow Road", 0x0E: "Dry Dry Ruins",
    0x0F: "Koopa Cape",
    0x10: "GCN Peach Beach", 0x11: "GCN Mario Circuit", 0x12: "GCN Waluigi Stadium",
    0x13: "GCN DK Mountain", 0x14: "DS Yoshi Falls", 0x15: "DS Desert Hills",
    0x16: "DS Peach Gardens", 0x17: "DS Delfino Square", 0x18: "SNES Mario Circuit 3",
    0x19: "SNES Ghost Valley 2", 0x1A: "N64 Mario Raceway", 0x1B: "N64 Sherbet Land",
    0x1C: "N64 Bowser's Castle", 0x1D: "N64 DK's Jungle Parkway",
    0x1E: "GBA Bowser Castle 3", 0x1F: "GBA Shy Guy Beach",
    0x20: "Delfino Pier", 0x21: "Block Plaza", 0x22: "Chain Chomp Wheel",
    0x23: "Funky Stadium", 0x24: "Thwomp Desert", 0x25: "GCN Cookie Land",
    0x26: "DS Twilight House", 0x27: "SNES Battle Course 4",
    0x28: "GBA Battle Course 3", 0x29: "N64 Skyscraper",
}


def track_name(course_id: int) -> str:
    return TRACK_NAMES.get(course_id, f"unknown track (id 0x{course_id:02X})")


# Wii has two RAM pools; Raceinfo (and the structs it points to) could land
# in either.
REGIONS = [
    (0x80000000, 0x81800000),  # MEM1, 24MB
    (0x90000000, 0x94000000),  # MEM2, 64MB
]

POLL_INTERVAL_S = 0.3
STALE_READS_TO_GIVE_UP = 8  # ~2.4s of bad reads -- treat the hook/pointer as gone
RESCAN_INTERVAL_S = 0.5     # how often to retry finding Raceinfo if not found yet -- short,
                             # so the one-time discovery scan finishes as soon as possible
                             # after a race's settings load, ideally before the race itself
                             # starts (start the script at the character/track-select screen,
                             # not after you're already racing, to get lap 1 too)


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


def scan_region_for_racedata_settings(start: int, end: int):
    """One vectorized pass over [start, end) for 4-byte-aligned addresses
    that look like a RacedataSettings block (the course/cup/lap-count
    chosen for the current race). Unlike Raceinfo, this struct has no
    pointers in it -- it's all small plain values -- so the fingerprint
    instead stacks several independent small-range constraints at once.
    lapCount==3 carries most of the weight (every real MKW race is exactly
    3 laps, so this is a ~1/256 coincidence for unrelated memory, the same
    role RaceinfoPlayer.maxLap played); the rest narrow it further. This is
    a newer, less load-tested fingerprint than the Raceinfo one -- expect
    to possibly need tightening after seeing it against real memory."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return []

    arr = np.frombuffer(buf, dtype=np.uint8)
    n = (len(arr) - RACEDATA_SETTINGS_SIZE) // 4 + 1
    if n <= 0:
        return []

    course_id = _read_u32_field(arr, RACEDATA_OFF_COURSE_ID, n)
    engine_class = _read_u32_field(arr, RACEDATA_OFF_ENGINE_CLASS, n)
    gamemode = _read_u32_field(arr, RACEDATA_OFF_GAMEMODE, n)
    cpu_mode = _read_u32_field(arr, RACEDATA_OFF_CPU_MODE, n)
    item_mode = _read_u32_field(arr, RACEDATA_OFF_ITEM_MODE, n)
    cup_id = _read_u32_field(arr, RACEDATA_OFF_CUP_ID, n)
    L = min(len(course_id), len(engine_class), len(gamemode), len(cpu_mode), len(item_mode), len(cup_id))
    course_id, engine_class, gamemode, cpu_mode, item_mode, cup_id = (
        course_id[:L], engine_class[:L], gamemode[:L], cpu_mode[:L], item_mode[:L], cup_id[:L],
    )
    race_number = _read_u8_field(arr, RACEDATA_OFF_RACE_NUMBER, n)[:L]
    lap_count = _read_u8_field(arr, RACEDATA_OFF_LAP_COUNT, n)[:L]

    mask = (
        (lap_count == 3)
        & (course_id <= 0x29)
        & (engine_class <= 5)
        & (gamemode <= 10)
        & (cpu_mode <= 10)
        & (item_mode <= 5)
        & (cup_id <= 0x30)
        & (race_number <= 3)
    )
    idxs = np.nonzero(mask)[0]
    return [int(start + i * 4) for i in idxs]


def find_track_name():
    """Looks up the current course fresh, every time it's called -- not
    cached. Raceinfo itself turned out not to reliably survive every
    track/cup transition despite being documented as a permanent singleton
    (see the dead-address fix a couple commits back), so there's no reason
    to assume Racedata's settings block would either. Returns a display
    string, or None if the scan found nothing or found more than one match
    (ambiguous -- better to just omit the track name for a race than
    print a wrong one)."""
    found = []
    for start, end in REGIONS:
        found.extend(scan_region_for_racedata_settings(start, end))
    if len(found) != 1:
        return None
    course_id = read_ptr(found[0] + RACEDATA_OFF_COURSE_ID)
    if course_id is None:
        return None
    return track_name(course_id)


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


def _raceinfo_snapshot(addr: int):
    """Read every field this candidate needs to agree on, in one shot, so we
    can compare two snapshots taken slightly apart in time. Returns a tuple
    or None if anything failed to read."""
    players_ptr = read_ptr(addr + RACEINFO_OFF_PLAYERS)
    if players_ptr is None or not (
        0x80000000 <= players_ptr < 0x81800000 or 0x90000000 <= players_ptr < 0x94000000
    ):
        return None

    player0_ptr = read_ptr(players_ptr + PLAYER_SLOT_INDEX * POINTER_SIZE)
    if player0_ptr is None or not (
        0x80000000 <= player0_ptr < 0x81800000 or 0x90000000 <= player0_ptr < 0x94000000
    ):
        return None

    try:
        player_id = dme.read_byte(player0_ptr + PLAYER_OFF_ID)
    except Exception:
        return None
    if player_id > 11:
        return None

    player = read_player(player0_ptr)
    if player is None:
        return None
    pos, lap, maxlap, flags = player
    return players_ptr, player0_ptr, maxlap, pos


def verify_raceinfo_candidate(addr: int) -> bool:
    """Secondary, scalar check on a candidate that passed the vectorized
    pointer-shape filter: actually dereference players[] and confirm slot 0
    looks like a real player struct, AND that the same answer holds up a
    moment later.

    Two things turned out to matter a lot here, found by grepping a real
    591-candidate false-positive run:

    1. maxLap must be EXACTLY 3, not "0 or 3". Every real MKW GP/VS race is
       exactly 3 laps, so maxLap==0 looked like a harmless extra allowance
       for "caught before race settings applied" -- but 0 is also just
       ordinary zero bytes, which are everywhere in memory. Allowing it let
       a huge, totally unrelated, uniformly-spaced array of game objects
       through (confirmed: every one of the 591 false positives had
       maxLap in {0, something-not-3}, none had maxLap==3). Dropping the
       "or 0" allowance means we simply won't find Raceinfo until a race's
       settings are actually loaded, which is fine -- we rescan periodically
       anyway (see RESCAN_INTERVAL_S), and this is the single highest-
       leverage filter available.

    2. A single read isn't enough: one false positive in that same run had
       a players[] pointer that, read again moments later, came back as
       garbage (0x00000237) -- i.e. it was ephemeral/rapidly-reused memory
       that happened to look right for one instant. Raceinfo is a real
       singleton and should read identically a fraction of a second later.
       Re-checking catches that kind of transient collision that a single
       read can't distinguish from the real thing.
    """
    snap1 = _raceinfo_snapshot(addr)
    if snap1 is None:
        return False
    players_ptr1, player0_ptr1, maxlap1, pos1 = snap1
    if maxlap1 != 3 or pos1 > 12:
        return False

    time.sleep(0.4)

    snap2 = _raceinfo_snapshot(addr)
    if snap2 is None:
        return False
    players_ptr2, player0_ptr2, maxlap2, pos2 = snap2

    # The pointers and maxLap are structural -- they should be IDENTICAL a
    # moment later for a real, stable singleton. Position is allowed to
    # change (the race is live), but must still look sane.
    if players_ptr1 != players_ptr2 or player0_ptr1 != player0_ptr2:
        return False
    if maxlap2 != 3 or pos2 > 12:
        return False
    return True


def find_raceinfo_candidates():
    """One-time structural scan for the Raceinfo singleton. Returns every
    address that matched the vectorized pointer-shape filter AND survived
    scalar verification -- usually just one, but the filter is weaker
    against real, densely-pointer-filled game memory than against random
    noise (practically every real pointer in the process IS in the valid
    MEM1/MEM2 range by construction, so any other object with a few pointer
    members in the right positions can coincidentally pass too). Returning
    all of them, with diagnostics, beats silently trusting the first one.

    Also returns (as the second element) a breakdown of how long the scan
    itself took, per region, plus how much of that was spent inside the
    scalar verify step (which includes a deliberate 0.4s sleep per
    snap1-passing raw hit -- see verify_raceinfo_candidate). Lock-on has
    twice now taken 70-85s in live testing, landing right around lap 3
    both times regardless of which race -- a suspiciously consistent
    duration that points at the scan itself being slow (reading all of
    MEM1+MEM2 through the Python bindings every attempt) rather than at
    anything about when the real object becomes valid. This timing makes
    that measurable instead of guessed at."""
    found = []
    timing = []
    for start, end in REGIONS:
        t_scan_start = time.time()
        raw_hits = scan_region_for_raceinfo(start, end)
        t_scan_done = time.time()
        for addr in raw_hits:
            if verify_raceinfo_candidate(addr):
                found.append(addr)
        t_verify_done = time.time()
        timing.append(
            (start, end, len(raw_hits), t_scan_done - t_scan_start, t_verify_done - t_scan_done)
        )
    return found, timing


def describe_candidate(addr: int) -> str:
    """One-line diagnostic dump of a Raceinfo candidate, for the terminal --
    so a wrong lock is visible immediately instead of just silence."""
    stage = read_ptr(addr + RACEINFO_OFF_STAGE)
    players_ptr = read_ptr(addr + RACEINFO_OFF_PLAYERS)
    player0_ptr = get_local_player_addr(addr)
    player = read_player(player0_ptr) if player0_ptr else None
    player_desc = f"pos={player[0]} lap={player[1]}/{player[2]} flags=0x{player[3]:X}" if player else "unreadable"
    return (
        f"0x{addr:08X}: stage={stage}  players_ptr=0x{players_ptr:08X}  "
        f"player0=0x{player0_ptr:08X}  ({player_desc})"
    )


def get_local_player_addr(raceinfo_addr: int):
    players_ptr = read_ptr(raceinfo_addr + RACEINFO_OFF_PLAYERS)
    if players_ptr is None:
        return None
    return read_ptr(players_ptr + PLAYER_SLOT_INDEX * POINTER_SIZE)


def _raceinfo_still_plausible(addr: int) -> bool:
    """Cheap recurring liveness check used while waiting *between* races
    (when we're reusing an address found for an earlier race rather than
    doing a fresh scan). The "Raceinfo is a permanent singleton" assumption
    from mkw-structures is about the game's real static sInstance -- what
    our structural scan actually finds is just whatever memory matches that
    shape, which could instead be a heap-allocated per-race object that
    gets freed or reused for something else entirely on a track/cup
    transition.

    Checks BOTH fields, not just one: live testing caught a case where the
    players pointer field kept reading as a plausible in-range value (real
    game memory is dense with valid-looking pointers almost anywhere, as
    we've seen repeatedly) while `stage` itself had clearly become garbage
    -- over two billion, nowhere near any legitimate value (0, 1, 2, or the
    post-race value 4 we've now also seen) -- because the memory had been
    reused by something else shaped differently. Checking only the pointer
    field missed that entirely and the address was treated as still alive
    forever. Requiring stage to also still be in a small, plausible range
    catches that case too."""
    stage = read_ptr(addr + RACEINFO_OFF_STAGE)
    if stage is None or not (0 <= stage <= 10):
        return False
    players_ptr = read_ptr(addr + RACEINFO_OFF_PLAYERS)
    return players_ptr is not None and (
        0x80000000 <= players_ptr < 0x81800000 or 0x90000000 <= players_ptr < 0x94000000
    )


def wait_for_race_start(raceinfo_addr: int, timeout_s: float, status_every_s: float = 3.0):
    """Wait up to timeout_s for Raceinfo.stage == 2 (actually racing, not
    the intro camera or countdown) with a sane player read. Prints the
    current stage every status_every_s so a wrong lock (stage stuck, or
    nonsense) is visible on the terminal instead of looking identical to
    "just waiting for you to start a race". Also re-checks, every tick,
    that the candidate still structurally looks like Raceinfo (see
    _raceinfo_still_plausible) -- otherwise a struct that died between
    races would look exactly like "stage stuck at 0, still waiting for the
    next race" forever. That re-check needs several CONSECUTIVE failures
    before giving up, not just one: found via live testing that a single
    bad read (likely a transient IPC hiccup, or the game briefly mid-write)
    was enough to throw away a real, correctly-identified candidate and
    force a full rescan, even though it was fine on every other read
    before and after. Returns the player address, or None on timeout / hook
    loss / several consecutive implausible reads in a row / a stage-2
    reading that never yields a sane player (pointer chain shifted -- a
    new Dolphin session)."""
    deadline = time.time() + timeout_s
    next_status = time.time()
    player_stale = 0
    implausible_streak = 0
    while time.time() < deadline:
        if not dme.is_hooked():
            return None

        stage = read_ptr(raceinfo_addr + RACEINFO_OFF_STAGE)
        if time.time() >= next_status:
            print(f"  (0x{raceinfo_addr:08X}: stage={stage})", flush=True)
            next_status = time.time() + status_every_s

        if stage == 2:
            implausible_streak = 0
            player_addr = get_local_player_addr(raceinfo_addr)
            if player_addr:
                cur = read_player(player_addr)
                if cur is not None:
                    return player_addr
            player_stale += 1
            if player_stale >= STALE_READS_TO_GIVE_UP:
                return None
        else:
            player_stale = 0
            if stage is None or not _raceinfo_still_plausible(raceinfo_addr):
                implausible_streak += 1
                if implausible_streak >= STALE_READS_TO_GIVE_UP:
                    print(
                        f"  (0x{raceinfo_addr:08X} no longer looks like Raceinfo after "
                        f"{implausible_streak} reads in a row -- it likely didn't survive "
                        "the track/cup transition; rescanning)",
                        flush=True,
                    )
                    return None
            else:
                implausible_streak = 0
        time.sleep(POLL_INTERVAL_S)
    return None


def wait_for_any_race_start(candidates, timeout_s: float, status_every_s: float = 3.0):
    """Like wait_for_race_start, but watches every still-plausible candidate
    on every poll tick, instead of giving each one its own serial timeout
    window one at a time.

    Found via live testing: even after the strict maxLap==3 filter, a
    handful of already-verified look-alikes can still coexist with the
    real Raceinfo (the structural filter is strong but not perfect against
    real, noisy game memory -- see verify_raceinfo_candidate's docstring).
    Trying them one at a time for up to 15s each meant the real one didn't
    get its turn until every candidate ahead of it in the list had each
    burned their full window -- with enough residual look-alikes, that ate
    up multiple laps of real race time before ever locking on, every
    single race (since the underlying object doesn't survive between
    races -- see _raceinfo_still_plausible -- a fresh batch of candidates,
    in a possibly different order, shows up every time).

    Checking every candidate on every tick removes that multiplier
    entirely: lock-on time is bounded by how fast the real race actually
    reaches stage 2, not by how many look-alikes happen to rank ahead of
    it.

    A candidate is only dropped after several CONSECUTIVE bad reads, not
    one: found via live testing that a single real, correctly-identified
    candidate (stage=0, sane pos/lap, maxLap=3 -- caught at a menu, before
    the race itself had started) got thrown away after one single bad
    plausibility read -- likely a transient IPC hiccup, or the game
    briefly mid-write -- forcing a full rescan for no real reason. Returns
    (raceinfo_addr, player_addr), or (None, None) on timeout / hook loss /
    every candidate going implausible for several reads running."""
    deadline = time.time() + timeout_s
    next_status = time.time()
    player_stale = {addr: 0 for addr in candidates}       # consecutive bad-player-read count
    implausible_streak = {addr: 0 for addr in candidates}  # consecutive implausible-read count
    alive = set(candidates)
    while time.time() < deadline:
        if not dme.is_hooked():
            return None, None

        show_status = time.time() >= next_status
        if show_status:
            next_status = time.time() + status_every_s

        for addr in list(alive):
            stage = read_ptr(addr + RACEINFO_OFF_STAGE)
            if show_status:
                print(f"  (0x{addr:08X}: stage={stage})", flush=True)

            if stage == 2:
                implausible_streak[addr] = 0
                player_addr = get_local_player_addr(addr)
                cur = read_player(player_addr) if player_addr else None
                if cur is not None:
                    return addr, player_addr
                player_stale[addr] += 1
                if player_stale[addr] >= STALE_READS_TO_GIVE_UP:
                    alive.discard(addr)
            else:
                player_stale[addr] = 0
                if stage is None or not _raceinfo_still_plausible(addr):
                    implausible_streak[addr] += 1
                    if implausible_streak[addr] >= STALE_READS_TO_GIVE_UP:
                        alive.discard(addr)
                else:
                    implausible_streak[addr] = 0

        if not alive:
            return None, None
        time.sleep(POLL_INTERVAL_S)
    return None, None


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
        if last is not None:
            if pos != last[0]:
                verb = "overtake -- now in" if pos < last[0] else "overtaken -- dropped to"
                print(
                    f"[race {race_num}] {verb} position {pos}  (was {last[0]}, lap {lap}/{maxlap})",
                    flush=True,
                )
            elif lap != last[1]:
                print(f"[race {race_num}] lap {lap}/{maxlap}  (position {pos})", flush=True)
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
    next_search_log = 0.0
    while True:
        if not dme.is_hooked():
            print("Lost hook to Dolphin. Exiting.")
            return

        if raceinfo_addr is None:
            # Rescanning every RESCAN_INTERVAL_S (0.5s) so lock-on happens as
            # soon as a race's settings load -- including if you start this
            # before you've even picked a race, straight from the menus.
            # Logging that search itself only every 5s, not every retry, so
            # sitting in menus for a few minutes doesn't flood the terminal
            # with hundreds of identical "looking" lines. Printing the last
            # scan's timing breakdown alongside it -- see find_raceinfo_candidates'
            # docstring for why: lock-on has taken 70-85s twice in live
            # testing and this measures exactly where that time goes
            # instead of guessing.
            candidates, timing = find_raceinfo_candidates()
            if time.time() >= next_search_log:
                breakdown = "; ".join(
                    f"0x{start:08X}-0x{end:08X}: {n_hits} raw hit(s), "
                    f"scan {scan_s:.2f}s, verify {verify_s:.2f}s"
                    for start, end, n_hits, scan_s, verify_s in timing
                )
                print(f"Looking for Raceinfo... [{breakdown}]", flush=True)
                next_search_log = time.time() + 5.0
            if not candidates:
                time.sleep(RESCAN_INTERVAL_S)
                continue

            print(f"Found {len(candidates)} candidate(s):", flush=True)
            for addr in candidates:
                print(f"  {describe_candidate(addr)}", flush=True)

            # The structural filter is far more selective against random
            # noise than against real, densely-pointer-filled game memory
            # (practically every real pointer in the process IS in-range by
            # construction), so more than one candidate can pass. Watch all
            # of them at once (see wait_for_any_race_start) rather than
            # trying each for its own timeout window in sequence -- that
            # way, whichever one is real gets confirmed as soon as the race
            # itself starts, regardless of how many look-alikes are ahead
            # of it in the list.
            found_addr, found_player_addr = wait_for_any_race_start(candidates, timeout_s=9e9)
            if not dme.is_hooked():
                return
            if found_player_addr is None:
                print("None of these reached a real race; rescanning.\n", flush=True)
                continue
            raceinfo_addr = found_addr
            player_addr = found_player_addr
            print(f"Confirmed -- 0x{raceinfo_addr:08X} reached stage 2 with a real player read.\n", flush=True)
        else:
            player_addr = wait_for_race_start(raceinfo_addr, timeout_s=9e9)
            if player_addr is None:
                # Either Dolphin's gone, or this address stopped making sense
                # (new session) -- drop it and look again from scratch.
                if dme.is_hooked():
                    raceinfo_addr = None
                continue

        race_num += 1
        track = find_track_name()
        print(
            f"[race {race_num}] track: {track}" if track else f"[race {race_num}] track: (couldn't identify it)",
            flush=True,
        )
        result, reason = track_until_race_ends(raceinfo_addr, player_addr, race_num)
        if result is None:
            print(f"[race {race_num}] lost it before getting a solid reading; resuming.\n", flush=True)
            continue

        pos, lap, maxlap = result
        print(
            f"[race {race_num}] FINAL POSITION: {pos}  "
            f"(lap {lap}/{maxlap}, {track or 'unknown track'}, ended via {reason})\n",
            flush=True,
        )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
