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

import argparse
import os
import struct
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

# KartStats live telemetry bridge (optional) -- see kartstats_bridge.py's
# module doc. Importing it is wrapped the same way numpy/dolphin_memory_engine
# are above, except a missing/broken bridge module should never block pure
# local tracking: it's not in requirements.txt, and this script must keep
# working exactly as before for anyone not using the bridge.
try:
    import kartstats_bridge as bridge
except ImportError:
    bridge = None

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

# raceinfo.h's own documented pointer fields on RaceinfoPlayer -- used by
# the pointer-chase path to label known, expected pointers (so they're easy
# to recognize and skip past) rather than mysterious ones worth chasing.
KNOWN_PLAYER_POINTER_OFFSETS = {
    0x3C: "lapFinishTimes",
    0x40: "raceFinishTime",
    0x48: "controllerHolder",
}
# RaceinfoPlayer objects are packed 0xC4 bytes apart in memory (confirmed
# across two full races -- the documented struct is only 0x54 bytes, but
# every field repeats again exactly 0xC4 bytes later, matching another
# racer's identical fields), so the player-item scan window
# (PLAYER_ITEM_SCAN_SIZE) actually contains ~3 racers' worth of structs.
# This is also used to label which "copy" a pointer-chase offset fell in.
PLAYER_STRUCT_STRIDE = 0xC4

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
RACEDATA_OFF_RACE_NUMBER = 0x24     # uint8_t, 1-4 (which race in the cup --
                                     # confirmed live and 1-indexed via
                                     # dump_known_racedata_addrs.py: the
                                     # 4th race of a cup read back as 4,
                                     # not 3, so the mask below allows up
                                     # to 4, not 3 as originally assumed)
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
TRACK_POLL_S = 0.1  # in-race polling: finer so lap/finish times are good to ~0.1s
STALE_READS_TO_GIVE_UP = 8  # ~2.4s of bad reads -- treat the hook/pointer as gone
RESCAN_INTERVAL_S = 0.5     # how often to retry finding Raceinfo if not found yet -- short,
                             # so the one-time discovery scan finishes as soon as possible
                             # after a race's settings load, ideally before the race itself
                             # starts (start the script at the character/track-select screen,
                             # not after you're already racing, to get lap 1 too)

# Raceinfo::sInstance -- the permanent static pointer slot the game itself
# keeps pointed at the current Raceinfo object, discovered empirically via
# find_sinstance_candidates()'s reverse-pointer-scan-and-intersect-across-
# races technique. Live testing confirmed it: the reverse scan converged on
# this EXACT address in two separate real races, even though the Raceinfo
# object itself landed at two different heap addresses in those same two
# races (0x8111C4D8, then 0x81119770) -- the "pointer stays put, object
# moves" signature of a real static instance pointer, not a coincidence.
# This is specific to this exact game build/region (RMCE01, NTSC-U) the
# same way PAL's published 0x809bd730 is specific to PAL -- if this ever
# stops matching (a different ISO, a romhack, a Dolphin/game update),
# try_fast_path() below fails its sanity check and the blind scan takes
# over again automatically, so nothing breaks, it just gets slow again.
SINSTANCE_ADDR = 0x809B8F70

# RaceConfig::spInstance -- the real (decompilation-confirmed) name for what
# this file was calling "Racedata". Found via the same reverse-pointer-scan-
# and-intersect technique as Raceinfo::sInstance above, with one extra step:
# RaceConfig doesn't point directly at RacedataSettings -- a PR comment on
# the actual MKW matching decompilation (github.com/doldecomp/mkw, PR #7)
# shows real source doing
#   System::RaceConfig::spInstance->mRaceScenario.mPlayers[idx].mPlayerType
#   System::RaceConfig::spInstance->mRaceScenario.mSettings.mGameMode
# i.e. mRaceScenario and mSettings are embedded BY VALUE inside RaceConfig,
# not behind their own pointers, so spInstance points at RaceConfig's own
# base address, well before the settings block, not at settings itself.
# A widened MEM1 reverse-pointer scan (looking for "what points near
# settings_addr - 0xB48", RacedataScenario.settings' already-confirmed
# relative offset) turned up this address -- notably, exactly 8 bytes
# before SINSTANCE_ADDR itself, consistent with the engine declaring its
# handful of top-level "current race" singleton pointers right next to each
# other. Confirmed live: the decoded track/character/vehicle data matched
# reality across a mid-session random track change (Grumble Volcano ->
# Wario's Gold Mine, same pointer value, object untouched -- just its
# course_id field mutated in place) AND survived a full Dolphin restart
# (object reallocated to a new MEM2 address, pointer slot unchanged) -- the
# same "pointer stays put, object moves" signature that confirmed
# SINSTANCE_ADDR above. Specific to this exact game build/region (RMCE01,
# NTSC-U), same caveat as SINSTANCE_ADDR.
RACECONFIG_SINSTANCE_ADDR = 0x809B8F68
RACECONFIG_TO_SETTINGS_OFFSET = 0x1758  # RaceConfig_base + this = RacedataSettings addr

# --- RacedataPlayer[12] (character/vehicle, read once per race) -----------
# See discover_character_vehicle.py's module doc for the full derivation
# and sourcing (mkw-structures' racedata.h) -- this reuses that same
# research now that it's been checked over several races via that script.
RACEDATA_PLAYER_STRIDE = 0xF0            # RacedataScenario.players[12] stride
PLAYERS_TO_SETTINGS_GAP = 0xB40          # RacedataScenario.settings(0xB48) - players(0x8)
RACEDATAPLAYER_OFF_VEHICLE_ID = 0x8      # uint32
RACEDATAPLAYER_OFF_CHARACTER_ID = 0xC    # uint32
RACEDATAPLAYER_VEHICLE_ID_MAX = 0x23     # 36 vehicles, 0-indexed
RACEDATAPLAYER_CHARACTER_ID_MAX = 0x2F   # generous headroom past the 24 non-Mii racers for Mii slots

# Every real MKW GP/VS race is exactly 3 laps -- used for DISPLAY only. Live
# testing (once the fast path removed the lap-3 lock-on delay and gave us
# clean lap-1 data for the first time) showed maxLap does NOT hold steady
# at a constant for the whole race despite its name: it read 1 during lap
# 1, 2 during lap 2, 3 from lap 3 onward, even once currentLap ticked to 4
# at the finish line -- it tracks something closer to "laps completed,
# capped at the true total" than "the race's configured total laps". Real
# finish detection already doesn't depend on it (STATE_FINISHING), so this
# only fixes the printed denominator ("lap 1/1" -> "lap 1/3").
STANDARD_LAP_COUNT = 3

# MKW supports up to 12 racers (local + CPU + remote combined) in a single
# race; players[] is sized for that when relevant. Used by read_all_players
# below, the multiplayer slot-mapping diagnostic.
MAX_PLAYER_SLOTS = 12
PLAYER_DUMP_INTERVAL_S = 1.0
# The all-slots dump is noisy and only useful for the one-time job of
# mapping which slot index is which real player in local split-screen --
# off by default so solo play stays quiet. Turn it on with:
#   MKW_DUMP_PLAYERS=1 python scripts/auto_track_race.py ...
DUMP_ALL_PLAYERS = bool(os.environ.get("MKW_DUMP_PLAYERS"))

# --- Held item (single player) -- player-struct-relative scan, replacing ---
# three failed whole-RAM approaches in a row (see git history): a two-point
# before/after diff "confirmed" an address (0x802F3A14) that turned out to
# fire on almost every poll tick, unrelated to real pickups; a continuous
# watch scored by "changes rarely" drowned in noise (528,032 candidates in
# 7.3 seconds, because a huge fraction of all 88MB of RAM changes within
# seconds of normal play, and pure chance alone guarantees many bytes pass
# through the 19-value item range); a version correlating against
# real-time Enter-keypress marks fixed the noise problem but needed
# frame-accurate keypresses while actually playing, which wasn't practical.
#
# The actual fix: stop searching all of RAM. Powerups are logically tied to
# a player, and PLAYER_OFF_ID/_POSITION/_CURRENT_LAP/_MAX_LAP/_STATE_FLAGS
# are all real, confirmed-correct fields on the SAME RaceinfoPlayer struct
# `player_addr` already points at every single race (found via the
# Raceinfo::sInstance fast path, never once wrong in any race logged so
# far). If the held item lives in that same struct -- or a pointer inside
# it -- the real address is somewhere in a window of a few hundred bytes
# we ALREADY have, not somewhere in 88 million bytes of RAM we don't.
#
# scan_player_item_window (used by track_until_race_ends, opt-in via
# MKW_SCAN_PLAYER_ITEM=1) logs every byte that changes anywhere in
# [player_addr, player_addr + PLAYER_ITEM_SCAN_SIZE) for the whole race.
# Because that window is tiny, logging its FULL history for the entire
# race is cheap and safe -- no risk of repeating the multi-hundred-
# thousand-candidate/gigabyte-log blowup a whole-RAM scan produced. Play
# one race, grab a few different items, then report back (in order) which
# items you actually got -- that ordered sequence is the ground truth this
# gets matched against, no live marking required.
PLAYER_ITEM_SCAN_SIZE = 0x200  # generous past the last documented field (stateFlags, 0x38)
SCAN_PLAYER_ITEM = bool(os.environ.get("MKW_SCAN_PLAYER_ITEM"))

# --- Live speed, step 1: PlayerHolder::sInstance + the PlayerSub10 chain --
# DIAGNOSTIC ONLY (gated by MKW_SCAN_PLAYER_SPEED) -- nothing here sends
# telemetry or touches the DB yet. These offsets have NOT been validated
# against this project's own live Dolphin session; they're derived from
# three independent sources that all agree with each other, which is a
# good sign but not a substitute for watching the real numbers move:
#   1. The documented retail struct layout (same community lineage as
#      raceinfo.h above): PlayerHolder::sInstance, Player.playerSub,
#      PlayerSub.playerSub10, and PlayerSub10.vehicleSpeed, with the
#      doc's own neighboring-offset comments matching this byte math
#      exactly at every anchor point checked.
#   2. The Kinoko MKW physics reimplementation (independently
#      reverse-engineered, open source) -- same field, same relative
#      offset, derived from its own doc comments.
#   3. SwareJonge/MKW-Dolphin-Speedometer, a published, working Dolphin
#      speed-overlay tool, reads this exact offset for this exact
#      purpose.
# What's NOT yet known: which PlayerHolder array index (0 or 1) is which
# on-screen player. The diagnostic print below labels both raw indices --
# accelerate one controller alone during a test race and see which number
# moves, the same "swap players" calibration already flagged as an open
# item in the War Mode plan for slot assignment.
#
# UPDATE after live testing: PLAYERHOLDER_SINSTANCE_ADDR did NOT check
# out -- reading it live produced a small, steadily-climbing value
# (0x00020006, then 0x00030006, ...), the signature of a counter/timer,
# not a pointer. So this specific documented address is wrong for this
# game build, even though it came from a normally-reliable community doc
# (the same lineage as raceinfo.h above, which HAS checked out). Rather
# than guess another address (exactly what this project keeps learning
# not to do -- see ITEMHANDLER_SINSTANCE_ADDR's and SINSTANCE_ADDR's own
# "UPDATE after live testing" comments), PLAYERSUB10_OFF_* below are kept
# (struct-internal field order is far more stable across game revisions
# than a specific global pointer slot, and three independent sources
# agreed on them, including two explicit "unknown float 0x1c"/"0x28"
# anchor comments in the retail struct doc that match this byte math
# exactly), but the chain to REACH a PlayerSub10 object is replaced with
# a structural scan of PlayerSub10's own content -- same technique
# find_itemhandler_candidates() already uses successfully, just fingerprinting
# a different struct's fields instead of chasing a wrong pointer to it.
PLAYERHOLDER_SINSTANCE_ADDR = 0x809C18F8  # PlayerHolder::sInstance (NTSC-U) -- did NOT check out, kept only as a comment/paper trail
PLAYERHOLDER_OFF_PLAYERS = 0x20           # Player** -- array of per-player pointers (unreachable without the above)
PLAYERHOLDER_PLAYER_OFF_SUB = 0x10        # Player.playerSub -> PlayerSub*
PLAYERHOLDER_SUB_OFF_SUB10 = 0x10         # PlayerSub.playerSub10 -> PlayerSub10* ("move")
PLAYERHOLDER_SUB10_OFF_SPEED = 0x20       # PlayerSub10.vehicleSpeed, f32, current speed

# --- PlayerSub10 structural scan (bypasses the broken chain above) -------
# Fields relative to a PlayerSub10 object's own base address, all f32,
# per the documented retail struct (two explicit offset-anchor comments
# -- "unknown float 0x1c" and "unknown float 0x28, maybe last speed" --
# land exactly on this byte math, independently cross-checked against
# the Kinoko reimplementation's own doc comments):
PLAYERSUB10_OFF_SPEED_MULTIPLIER = 0x10  # 50cc=0.8, 100cc=0.9, 150cc=1.0
PLAYERSUB10_OFF_BASE_SPEED = 0x14
PLAYERSUB10_OFF_SOFT_SPEED_LIMIT = 0x18
PLAYERSUB10_OFF_VEHICLE_SPEED = 0x20     # same field read_player_speed/debug_player_chain already targeted
PLAYERSUB10_OFF_LAST_SPEED = 0x24
PLAYERSUB10_OFF_HARD_SPEED_LIMIT = 0x2C  # the anchor: always exactly 120.0, or 140.0 in a Bullet Bill
PLAYERSUB10_SCAN_BLOCK_SIZE = 0x30       # through hardSpeedLimit -- acceleration/beyond not needed for the fingerprint
HARD_SPEED_LIMITS = (120.0, 140.0)
HARD_SPEED_LIMIT_TOL = 0.01
SCAN_PLAYER_SPEED = bool(os.environ.get("MKW_SCAN_PLAYER_SPEED"))

# First live test (a race with CPU racers filling the grid) found ~28 raw
# structural hits, not 2 -- most of them frozen at the exact same value
# (e.g. five different addresses all reading 0.8, seven all reading 0.7)
# across several seconds, while a cluster of ~10-11 addresses changed
# every tick and tracked an actual "player 2 overtakes" event in the
# race log. Conclusion: PlayerSub10's shape also matches a static
# per-vehicle-type KartParam table (one row per character/kart, never
# changes during a race), plus the real per-kart live objects -- one per
# racer on the grid (human AND CPU, since both use PlayerSub10). A
# liveness filter removes the static-table false positives for free:
# anything that hasn't moved by more than the epsilon across a settle
# window is a table row, not a moving kart.
PLAYERSUB10_LIVENESS_WINDOW = 6       # samples to collect before judging (~3s at 0.5s/tick)
PLAYERSUB10_LIVENESS_EPSILON = 0.5    # min (max-min) speed swing over the window to count as "live"

# --- Held item, step 2: ITEMHandler::sInstance, a documented static --------
# Race 1's direct byte-level scan above ruled out every offset in the
# player struct window itself: offsets spaced 0xC4 apart cycling through
# the whole item enum turned out to be a UI roulette-spin value (now
# explained below -- it's item_box, not item_tail), +0x20/+0x25/+0x27/+0x28
# turned out to just be PLAYER_OFF_POSITION/_CURRENT_LAP/_MAX_LAP (known
# fields) numerically overlapping the item-id range by coincidence, and a
# cluster of ~34 offsets each changed exactly once, right at a lap
# transition -- one-off memory-reuse artifacts. None of it matched the
# reported pickup sequence (Bullet Bill, Red Shell, Triple Red Shell,
# Mushroom, Fake Item Box, Mega Mushroom). So the held item isn't stored
# inline in RaceinfoPlayer.
#
# A disc extraction the user pulled via Dolphin ("DolphinKartStructure")
# turned out to be just the game's raw filesystem (boot files, the
# compiled main.dol/StaticR.rel, assets) -- no debug symbols, confirmed by
# grepping both binaries for item-related strings and finding only asset
# names (item_curr, item_next -- UI icon resources) and no .map/symbol
# files at all. But it prompted re-checking mkw-structures (the same
# community repo raceinfo.h came from, already proven correct for every
# field used above) specifically for item state, which documents a
# SEPARATE singleton class, ITEMHandler, with its own static instance
# pointer at a FIXED address -- the exact same shape as Raceinfo::sInstance
# at SINSTANCE_ADDR above:
#   ITEMHandler::sInstance == 0x809c20f8          (itemhandler.h)
#   ITEMHandler::getPlayerStoredItem(playerId)    (0x8065d21c -- a function
#                                                   literally named this)
#   recvPackets[12] at offset 0x10, 8-byte ITEMPacket structs, documented
#   as "index player id"
# and Mario Kart Wii's own network-protocol docs (tockdom wiki, the ITEM
# packet -- recvPackets is this same packet type) give ITEMPacket's byte
# layout: +0x00 timer, +0x01 item_box (the item CURRENTLY IN THE BOX --
# this is almost certainly the 0xC4-spaced roulette-spin value race 1
# found, now explained rather than just dismissed), +0x02 item_tail (the
# item actually being CARRIED -- this is the one we want), +0x03 mode,
# +0x04 tail_mode, +0x05 acknowledge, +0x06 ack_timer, +0x07 padding.
#
# So the real held item should be the byte at:
#   itemhandler_addr + ITEMHANDLER_OFF_RECV_PACKETS
#     + localPlayerId * ITEMPACKET_SIZE + ITEMPACKET_OFF_ITEM_TAIL
# This is a sourced, named target rather than a blind pointer search --
# same play-a-race-and-report-the-sequence verification as before, just
# watching this specific documented packet instead of guessing.
#
# UPDATE after live testing: ITEMHANDLER_SINSTANCE_ADDR, taken straight off
# the wiki, never resolved to anything valid across two full races (no
# "found ITEMHandler" line ever printed). That's exactly the failure mode
# Raceinfo::sInstance already taught us about: its own published PAL
# address (0x809bd730) is NOT the same as this build's real NTSC-U address
# (0x809B8F70, only found by empirically scanning this exact game/Dolphin
# session) -- static data addresses shift between regions even when struct
# OFFSETS (which only depend on the compiler, not the region) stay
# identical. mkw-structures' field offsets have been correct every time;
# its absolute addresses have no such track record for NTSC-U specifically.
#
# Rather than guess a "corrected" address (region deltas aren't guaranteed
# to be a constant across every static symbol, and guessing addresses is
# exactly what this project keeps learning not to do), find_itemhandler_addr
# below verifies CONTENT instead: it checks whether a candidate address
# actually has the right shape (12 ITEMPackets with item_box/item_tail <=
# 0x14 and mode <= 7 -- the full documented value ranges -- and at least
# one nonzero byte, to rule out blank/zeroed memory) before trusting it,
# tries the published static address first since it's free if it happens
# to be right, and falls back to a full structural scan of RAM (the same
# technique that originally found Raceinfo, before its fast path existed)
# if it isn't.
ITEMHANDLER_SINSTANCE_ADDR = 0x809C20F8
ITEMHANDLER_OFF_RECV_PACKETS = 0x10
ITEMHANDLER_RECV_PACKET_COUNT = 12
ITEM_OR_EMPTY_MAX = 0x14   # valid item ids (0x00-0x12) plus "(no item)" (0x14)
ITEM_NONE_VALUE = 0x14     # the specific "(no item)" sentinel value -- a pickup is this -> a real item id
ITEMPACKET_MODE_MAX = 7    # "activation mode: 0=no item, 1-7=handshake" per tockdom
# All 12 recvPackets share the same global race clock (timer := RACE.timer/8
# per tockdom), so real packets' timer bytes should sit close together.
# Added after a synthetic test of the scan below caught it producing
# "echo" false positives a few bytes to either side of a planted real
# block -- windows that happen to satisfy the item_box/item_tail/mode
# range checks via coincidental overlap, but have no reason to also share
# a clock value across all 12 slots the way the genuine object does.
TIMER_CLUSTER_MAX_SPREAD = 32
ITEMPACKET_SIZE = 0x8
ITEMPACKET_OFF_TIMER = 0x0
ITEMPACKET_OFF_ITEM_BOX = 0x1   # item currently sitting in the box -- visual only
ITEMPACKET_OFF_ITEM_TAIL = 0x2  # the item actually held/carried -- the real target
ITEMPACKET_OFF_MODE = 0x3
ITEMPACKET_OFF_TAIL_MODE = 0x4  # 3=hold, 4=shoot, 5=3/3, 6=2/3, 7=1/3 per tockdom
ITEMPACKET_OFF_ACK = 0x5
ITEMPACKET_OFF_ACK_TIMER = 0x6

ITEMPACKET_FIELDS = [
    ("timer", ITEMPACKET_OFF_TIMER),
    ("item_box", ITEMPACKET_OFF_ITEM_BOX),
    ("item_tail", ITEMPACKET_OFF_ITEM_TAIL),
    ("mode", ITEMPACKET_OFF_MODE),
    ("tail_mode", ITEMPACKET_OFF_TAIL_MODE),
    ("acknowledge", ITEMPACKET_OFF_ACK),
    ("ack_timer", ITEMPACKET_OFF_ACK_TIMER),
]

# "timer" is documented as "RACE.timer/8" -- a live race-clock snapshot
# re-stamped into this packet continuously for netcode sync, not something
# that only changes on a real item event. "ack_timer" ("return the timer
# value to accept item of other client") is the same clock-like shape.
# Live testing confirmed it: with these included, the tracker printed a
# line almost every single poll tick for the whole race, drowning out the
# handful of genuinely rare item_box/item_tail/mode/tail_mode/acknowledge
# changes we actually care about. Skipped entirely (not printed, not even
# logged to history) rather than just filtered from the live print, so the
# end-of-race summary doesn't balloon either.
NOISY_ITEMPACKET_FIELDS = {"timer", "ack_timer"}

# The raw player-struct window scan (PLAYER_ITEM_SCAN_SIZE) below already
# did its job in race 1 -- it's what told us the held item ISN'T stored
# inline in RaceinfoPlayer, and what turned up the roulette-spin offsets
# now explained by item_box. It still runs (offset_history feeds the
# end-of-race summary, in case the ITEMHandler path above doesn't pan out
# either), but those roulette-spin offsets alone cycle through the whole
# item enum continuously all race, which -- live-printed every tick --
# was the other big source of the output flood. Off by default now; the
# full history is still in the end-of-race summary either way.
VERBOSE_PLAYER_WINDOW = bool(os.environ.get("MKW_VERBOSE_PLAYER_WINDOW"))

# --- Held item, step 3: chase pointers out of the player struct window -----
# Both earlier approaches failed with real, logged evidence (see the long
# comment blocks above): the struct window itself only ever contained known
# fields and other racers' identical structs packed 0xC4 bytes apart
# (confirmed by exact offset math against raceinfo.h across two full
# races), and ITEMHandler either never resolves (the published static
# address is wrong for this build) or can't be disambiguated from real
# game memory's actual noise (the content scan returns 100,000+ ambiguous
# candidates against real RAM, even though it worked cleanly in synthetic
# testing -- real memory has huge zero/sparse regions a uniform-random
# test doesn't capture).
#
# This is the user's own original suggestion, revisited now that both
# more-targeted guesses have been ruled out: scan the ALREADY-100%-
# reliable player struct window for any 4-byte-aligned slot whose CURRENT
# value looks like a real pointer (lands in MEM1 or MEM2 -- the same
# fingerprint _in_valid_range already uses to help find Raceinfo itself),
# and additionally watch a window at wherever each one points. Every
# candidate address here comes from live, already-verified memory (the
# window we know is correct) rather than a guessed or published number,
# which is what makes this different from the two approaches that failed.
# Some of these pointers will be the documented, known ones (lapFinishTimes
# at 0x3C, raceFinishTime at 0x40, controllerHolder at 0x48, each for all
# ~3 racer copies visible in the window) -- expected, not interesting, and
# labeled by source offset in the summary so they're easy to recognize and
# skip over while scanning for the real one.
POINTER_TARGET_SCAN_SIZE = 0x120  # a guess at a useful per-target size, not
                                   # a claimed real object size -- same
                                   # spirit as PLAYER_ITEM_SCAN_SIZE above
MAX_TRACKED_POINTERS = 16  # defensive cap, same spirit as MAX_REPORTED in
                            # watch_held_item_candidates.py -- don't let a
                            # fluke blow up the per-tick read count
# Live-printing every change across up to 16 extra watched windows would
# repeat the exact output-flood mistake patch 47 just fixed for the other
# two paths -- history is collected silently and dumped once at race end.

# The real item enum only covers 0x00-0x12 (see ITEM_NAMES below); any byte
# outside that range isn't a plausible item id.
HELD_ITEM_MIN = 0x00
HELD_ITEM_MAX = 0x12

ITEM_NAMES = {
    0x00: "Green Shell", 0x01: "Red Shell", 0x02: "Banana", 0x03: "Fake Item Box",
    0x04: "Mushroom", 0x05: "Triple Mushroom", 0x06: "Bob-omb", 0x07: "Spiny Shell",
    0x08: "Lightning", 0x09: "Star", 0x0A: "Golden Mushroom", 0x0B: "Mega Mushroom",
    0x0C: "Blooper", 0x0D: "POW Block", 0x0E: "Thundercloud", 0x0F: "Bullet Bill",
    0x10: "Triple Green Shell", 0x11: "Triple Red Shell", 0x12: "Triple Banana",
    0x14: "(no item)",
}


def item_name(item_id: int) -> str:
    return ITEM_NAMES.get(item_id, f"unknown item (id 0x{item_id:02X})")


def read_player_item_window(player_addr: int):
    """Bulk-reads [player_addr, player_addr + PLAYER_ITEM_SCAN_SIZE) as a
    numpy byte array, or None if the read failed. One read per poll tick,
    reused by track_until_race_ends to diff against the previous tick's
    read -- piggybacking on the loop that's already polling player_addr
    for position/lap every tick anyway."""
    try:
        return np.frombuffer(dme.read_bytes(player_addr, PLAYER_ITEM_SCAN_SIZE), dtype=np.uint8)
    except Exception:
        return None


def find_pointer_offsets(window) -> list:
    """4-byte-aligned offsets in `window` (a numpy byte array, as returned
    by read_player_item_window) whose CURRENT value looks like a real
    pointer into MEM1 or MEM2 -- same fingerprint _in_valid_range already
    uses elsewhere in this file to help find Raceinfo itself."""
    n = len(window) // 4
    if n <= 0:
        return []
    vals = _read_u32_field(window, 0, n)
    hits = np.nonzero(_in_valid_range(vals))[0]
    return [int(h) * 4 for h in hits]


def read_pointer_target_window(addr: int):
    """Same idea as read_player_item_window, but for wherever a pointer
    found inside the player struct window currently points."""
    try:
        return np.frombuffer(dme.read_bytes(addr, POINTER_TARGET_SCAN_SIZE), dtype=np.uint8)
    except Exception:
        return None


def _itemhandler_shape_ok(addr: int) -> bool:
    """Reads recvPackets[12] at a candidate ITEMHandler address and checks
    it actually has the documented shape -- every player's item_box/
    item_tail <= 0x14 and mode <= 7 all at once (12 * 3 = 36 independent
    small-range constraints agreeing simultaneously, the same logic
    scan_region_for_raceinfo already relies on), all 12 timer bytes
    clustered within TIMER_CLUSTER_MAX_SPREAD of each other (they share one
    global race clock), plus at least one nonzero byte so a blank/zeroed
    region of RAM (which trivially passes every "<= N" check, and whose
    all-zero timers trivially cluster too) doesn't get trusted. Used to
    verify ANY candidate -- whether it came from the published static
    address or a fresh scan -- before relying on it."""
    try:
        buf = dme.read_bytes(
            addr + ITEMHANDLER_OFF_RECV_PACKETS, ITEMPACKET_SIZE * ITEMHANDLER_RECV_PACKET_COUNT
        )
    except Exception:
        return False
    any_nonzero = False
    timers = []
    for i in range(ITEMHANDLER_RECV_PACKET_COUNT):
        base = i * ITEMPACKET_SIZE
        timer = buf[base + ITEMPACKET_OFF_TIMER]
        item_box = buf[base + ITEMPACKET_OFF_ITEM_BOX]
        item_tail = buf[base + ITEMPACKET_OFF_ITEM_TAIL]
        mode = buf[base + ITEMPACKET_OFF_MODE]
        if item_box > ITEM_OR_EMPTY_MAX or item_tail > ITEM_OR_EMPTY_MAX or mode > ITEMPACKET_MODE_MAX:
            return False
        if item_box or item_tail or mode:
            any_nonzero = True
        timers.append(timer)
    # timer is a uint8 that wraps (RACE.timer/8 overflows every ~34s at
    # 60fps), so a raw max-min would spuriously look huge right at a wrap
    # boundary even for genuinely clustered values (e.g. 255 vs 0) -- take
    # the shorter way around the wrap instead.
    spread = max(timers) - min(timers)
    spread = min(spread, 256 - spread)
    if spread > TIMER_CLUSTER_MAX_SPREAD:
        return False
    return any_nonzero


def scan_region_for_itemhandler(start: int, end: int):
    """One vectorized pass over [start, end) for 4-byte-aligned addresses
    whose recvPackets[12] block has the documented ITEMHandler shape -- see
    _itemhandler_shape_ok's docstring for the reasoning, including the
    timer-clustering check added after a synthetic test of this exact
    function caught it otherwise reporting "echo" false positives a few
    bytes to either side of a real match. Same technique as
    scan_region_for_raceinfo, just checked with numpy across the whole
    region in one shot instead of one Python-level read per candidate."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return [], 0

    arr = np.frombuffer(buf, dtype=np.uint8)
    block_size = ITEMHANDLER_OFF_RECV_PACKETS + ITEMPACKET_SIZE * ITEMHANDLER_RECV_PACKET_COUNT
    n = (len(arr) - block_size) // 4 + 1
    if n <= 0:
        return [], 0

    mask = np.ones(n, dtype=bool)
    any_nonzero = np.zeros(n, dtype=bool)
    timer_min = np.full(n, 255, dtype=np.uint8)
    timer_max = np.zeros(n, dtype=np.uint8)
    for i in range(ITEMHANDLER_RECV_PACKET_COUNT):
        base = ITEMHANDLER_OFF_RECV_PACKETS + i * ITEMPACKET_SIZE
        timer = _read_u8_field(arr, base + ITEMPACKET_OFF_TIMER, n)
        item_box = _read_u8_field(arr, base + ITEMPACKET_OFF_ITEM_BOX, n)
        item_tail = _read_u8_field(arr, base + ITEMPACKET_OFF_ITEM_TAIL, n)
        mode = _read_u8_field(arr, base + ITEMPACKET_OFF_MODE, n)
        L = min(len(timer), len(item_box), len(item_tail), len(mode), len(mask))
        mask = mask[:L] & (item_box[:L] <= ITEM_OR_EMPTY_MAX) & (item_tail[:L] <= ITEM_OR_EMPTY_MAX) & (mode[:L] <= ITEMPACKET_MODE_MAX)
        any_nonzero = any_nonzero[:L] | (item_box[:L] != 0) | (item_tail[:L] != 0) | (mode[:L] != 0)
        timer_min = np.minimum(timer_min[:L], timer[:L])
        timer_max = np.maximum(timer_max[:L], timer[:L])

    L = len(mask)
    spread = (timer_max[:L].astype(np.int16) - timer_min[:L].astype(np.int16))
    spread = np.minimum(spread, 256 - spread)  # shorter way around the uint8 wrap
    mask &= any_nonzero[:L] & (spread <= TIMER_CLUSTER_MAX_SPREAD)

    hits = np.nonzero(mask)[0]
    return [int(start + i * 4) for i in hits], n


def find_itemhandler_candidates():
    """One-shot structural scan for the ITEMHandler object's content across
    all of RAM, bypassing ITEMHANDLER_SINSTANCE_ADDR entirely -- the same
    approach find_raceinfo_candidates() used before Raceinfo's own fast
    path was confirmed. Slower than trusting a static address, but doesn't
    require trusting (or guessing a region-corrected version of) a number
    that already failed to check out."""
    print("Looking for ITEMHandler (structural scan -- the published address didn't check out)...")
    all_candidates = []
    for start, end in REGIONS:
        t0 = time.time()
        candidates, n = scan_region_for_itemhandler(start, end)
        print(f"  0x{start:08X}-0x{end:08X}: {len(candidates)} raw hit(s) of {n} checked, {time.time() - t0:.2f}s")
        all_candidates.extend(candidates)
    return all_candidates


def find_itemhandler_addr():
    """Locates the live ITEMHandler object, verifying content shape rather
    than trusting any address blindly. Tries the published static pointer
    first (free if it happens to be right for this build), falls back to a
    full structural scan of RAM if it doesn't check out. Returns the
    address, or None if nothing conclusive was found this attempt (caller
    retries later -- recvPackets may still be all-zero early in a race)."""
    addr = read_ptr(ITEMHANDLER_SINSTANCE_ADDR)
    if addr is not None and (0x80000000 <= addr < 0x81800000 or 0x90000000 <= addr < 0x94000000):
        if _itemhandler_shape_ok(addr):
            print(f"ITEMHandler::sInstance (0x{ITEMHANDLER_SINSTANCE_ADDR:08X}) -> 0x{addr:08X} -- shape check passed")
            return addr

    candidates = find_itemhandler_candidates()
    if len(candidates) == 1:
        print(f"Found ITEMHandler at 0x{candidates[0]:08X}")
        return candidates[0]
    if len(candidates) == 0:
        print("  no candidates this attempt (recvPackets may still be all-zero -- will retry)")
    else:
        shown = ", ".join(f"0x{c:08X}" for c in candidates[:20])
        print(f"  {len(candidates)} candidates, too ambiguous to pick one: {shown}")
    return None


def read_item_packet(itemhandler_addr: int, player_id: int):
    """Reads the documented 8-byte ITEMPacket for `player_id` out of
    ITEMHandler.recvPackets[player_id] ("index player id" per
    mkw-structures' own comment). Returns the raw bytes, or None on a bad
    read."""
    try:
        return dme.read_bytes(
            itemhandler_addr + ITEMHANDLER_OFF_RECV_PACKETS + player_id * ITEMPACKET_SIZE,
            ITEMPACKET_SIZE,
        )
    except Exception:
        return None


def _decode_item_field(name: str, value: int) -> str:
    if name in ("item_box", "item_tail") and HELD_ITEM_MIN <= value <= HELD_ITEM_MAX:
        return item_name(value)
    return f"0x{value:02X}"


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


def _read_f32_field(arr, offset, n):
    """Same vectorized 4-byte-aligned-candidate windowing as
    _read_u32_field, reinterpreted as big-endian f32 -- _read_u32_field
    already reassembles the bytes MSB-first into a native uint32, so
    .view(np.float32) on that gives the correct float bit pattern
    regardless of the host machine's own endianness."""
    return _read_u32_field(arr, offset, n).view(np.float32)


def _playersub10_shape_ok(addr: int) -> bool:
    """Single-address version of scan_region_for_playersub10's fingerprint,
    for verifying one already-found candidate (mirrors
    _itemhandler_shape_ok's role for ITEMHandler)."""
    try:
        buf = dme.read_bytes(addr, PLAYERSUB10_SCAN_BLOCK_SIZE)
    except Exception:
        return False
    speed_mult = struct.unpack(">f", buf[PLAYERSUB10_OFF_SPEED_MULTIPLIER:PLAYERSUB10_OFF_SPEED_MULTIPLIER + 4])[0]
    base_speed = struct.unpack(">f", buf[PLAYERSUB10_OFF_BASE_SPEED:PLAYERSUB10_OFF_BASE_SPEED + 4])[0]
    soft_limit = struct.unpack(">f", buf[PLAYERSUB10_OFF_SOFT_SPEED_LIMIT:PLAYERSUB10_OFF_SOFT_SPEED_LIMIT + 4])[0]
    speed = struct.unpack(">f", buf[PLAYERSUB10_OFF_VEHICLE_SPEED:PLAYERSUB10_OFF_VEHICLE_SPEED + 4])[0]
    last_speed = struct.unpack(">f", buf[PLAYERSUB10_OFF_LAST_SPEED:PLAYERSUB10_OFF_LAST_SPEED + 4])[0]
    hard_limit = struct.unpack(">f", buf[PLAYERSUB10_OFF_HARD_SPEED_LIMIT:PLAYERSUB10_OFF_HARD_SPEED_LIMIT + 4])[0]
    if not any(abs(hard_limit - h) <= HARD_SPEED_LIMIT_TOL for h in HARD_SPEED_LIMITS):
        return False
    if not (0.7 <= speed_mult <= 1.05):
        return False
    if not (0.0 < base_speed <= hard_limit + 1.0):
        return False
    if not (base_speed - 1.0 <= soft_limit <= hard_limit + 1.0):
        return False
    if not (-1.0 <= speed <= hard_limit + 1.0):
        return False
    if abs(speed - last_speed) > 15.0:  # one frame's worth of change, generous for a wall hit
        return False
    return True


def scan_region_for_playersub10(start: int, end: int):
    """One vectorized pass over [start, end) for 4-byte-aligned addresses
    whose next PLAYERSUB10_SCAN_BLOCK_SIZE bytes have PlayerSub10's
    documented shape. hardSpeedLimit landing within HARD_SPEED_LIMIT_TOL
    of exactly 120.0 (or 140.0) is the real anchor here -- a random
    4-byte sequence landing that close to a specific float by chance is
    astronomically unlikely, and it has to hold at the same time as four
    more independent range/relationship checks below."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return [], 0

    arr = np.frombuffer(buf, dtype=np.uint8)
    n = (len(arr) - PLAYERSUB10_SCAN_BLOCK_SIZE) // 4 + 1
    if n <= 0:
        return [], 0

    speed_mult = _read_f32_field(arr, PLAYERSUB10_OFF_SPEED_MULTIPLIER, n)
    base_speed = _read_f32_field(arr, PLAYERSUB10_OFF_BASE_SPEED, n)
    soft_limit = _read_f32_field(arr, PLAYERSUB10_OFF_SOFT_SPEED_LIMIT, n)
    speed = _read_f32_field(arr, PLAYERSUB10_OFF_VEHICLE_SPEED, n)
    last_speed = _read_f32_field(arr, PLAYERSUB10_OFF_LAST_SPEED, n)
    hard_limit = _read_f32_field(arr, PLAYERSUB10_OFF_HARD_SPEED_LIMIT, n)
    L = min(len(speed_mult), len(base_speed), len(soft_limit), len(speed), len(last_speed), len(hard_limit))
    speed_mult, base_speed, soft_limit, speed, last_speed, hard_limit = (
        speed_mult[:L], base_speed[:L], soft_limit[:L], speed[:L], last_speed[:L], hard_limit[:L]
    )

    # NaN-safe: a hard_limit that's NaN (garbage bytes) must compare False
    # against every threshold below, not raise/warn -- np.errstate silences
    # the "invalid value" warnings that garbage float comparisons trigger.
    with np.errstate(invalid="ignore"):
        hard_limit_ok = np.zeros(L, dtype=bool)
        for h in HARD_SPEED_LIMITS:
            hard_limit_ok |= np.abs(hard_limit - h) <= HARD_SPEED_LIMIT_TOL
        mask = (
            hard_limit_ok
            & (speed_mult >= 0.7) & (speed_mult <= 1.05)
            & (base_speed > 0.0) & (base_speed <= hard_limit + 1.0)
            & (soft_limit >= base_speed - 1.0) & (soft_limit <= hard_limit + 1.0)
            & (speed >= -1.0) & (speed <= hard_limit + 1.0)
            & (np.abs(speed - last_speed) <= 15.0)
        )

    hits = np.nonzero(mask)[0]
    return [start + int(h) * 4 for h in hits], L


def find_playersub10_candidates():
    """One-shot structural scan for PlayerSub10 objects across all of RAM --
    same approach find_itemhandler_candidates() already uses successfully,
    just fingerprinting PlayerSub10's speed-related fields instead of
    ITEMHandler's recvPackets. No singleton address needed at all, so
    PLAYERHOLDER_SINSTANCE_ADDR not checking out doesn't block this."""
    print("Looking for PlayerSub10 (structural scan -- no address needed)...")
    all_candidates = []
    for start, end in REGIONS:
        t0 = time.time()
        candidates, n = scan_region_for_playersub10(start, end)
        print(f"  0x{start:08X}-0x{end:08X}: {len(candidates)} raw hit(s) of {n} checked, {time.time() - t0:.2f}s")
        all_candidates.extend(candidates)
    return all_candidates


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
        return [], 0

    arr = np.frombuffer(buf, dtype=np.uint8)
    n = (len(arr) - RACEINFO_SIZE) // 4 + 1
    if n <= 0:
        return [], 0

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

    # Diagnostic only -- costs nothing extra (same arrays, no new memory
    # reads): how many addresses would pass this exact shape filter if
    # random1/random2 weren't constrained to look like pointers at all.
    # This exists to test a specific suspicion raised by the verify funnel:
    # across dozens of consecutive polls during laps 1-2, literally zero
    # candidates that reach the maxLap check ever have maxLap==3, then
    # exactly one does the instant lock-on happens. That fits "the real
    # object usually isn't even a raw hit" far better than "maxLap is
    # genuinely not 3 yet" -- and random1/random2 are named like RNG state,
    # not pointers, so requiring both to coincidentally land in the ~2% of
    # address space that counts as valid MEM1/MEM2, on the same poll, would
    # produce exactly this lottery-style delay. If this count dwarfs
    # len(idxs), that confirms it; if it's close, this theory is wrong.
    mask_no_random = (
        (stage_vals <= 2)
        & _in_valid_range(players_vals)
        & (cds_vals <= 1)
        & (cutscene_vals <= 1)
    )
    no_random_count = int(np.count_nonzero(mask_no_random))

    return [int(start + i * 4) for i in idxs], no_random_count


def scan_for_pointer_value(start: int, end: int, target_value: int):
    """Find every 4-byte-aligned address in [start, end) whose CURRENT
    value equals target_value exactly -- a reverse pointer scan: "what, in
    memory right now, points at this address". This is the mechanism for
    finding Raceinfo::sInstance itself (the static pointer slot every
    build of the game keeps, which never moves session to session) rather
    than the Raceinfo object it points at (which is heap-allocated and
    lands at a different address every session -- confirmed by live
    testing: 5 different addresses across 5 runs so far).

    An exact 32-bit equality match is a far sharper filter than our
    Raceinfo struct scan's fuzzy multi-field shape match, so false
    positives here should be rare. Still not guaranteed unique in one
    pass (some other code might legitimately hold a cached copy of the
    pointer too) -- see find_sinstance_candidates' intersection-across-
    races approach for how that gets resolved."""
    size = end - start
    try:
        buf = dme.read_bytes(start, size)
    except Exception as exc:
        print(f"  (couldn't read 0x{start:08X}-0x{end:08X}: {exc})")
        return []
    arr = np.frombuffer(buf, dtype=np.uint8)
    n = len(arr) // 4
    if n <= 0:
        return []
    vals = _read_u32_field(arr, 0, n)
    idxs = np.nonzero(vals == target_value)[0]
    return [int(start + i * 4) for i in idxs]


def find_sinstance_candidates(target_value: int):
    """Reverse-pointer-scans all of MEM1+MEM2 for the given confirmed-real
    Raceinfo address. Returns every matching static/heap location --
    callers narrow this down across multiple races (see main())."""
    found = []
    for start, end in REGIONS:
        found.extend(scan_for_pointer_value(start, end, target_value))
    return found


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
        & (race_number <= 4)
    )
    idxs = np.nonzero(mask)[0]
    return [int(start + i * 4) for i in idxs]


def get_racedata_settings_addr():
    """Dereference RACECONFIG_SINSTANCE_ADDR directly instead of blind-
    scanning all of MEM1+MEM2 for something RacedataSettings-shaped -- the
    same fast-path idea try_fast_path() already uses for Raceinfo. Returns
    the live RacedataSettings address, or None if the pointer doesn't
    currently resolve to something that passes a light sanity check (wrong
    game build/region, or a menu/loading screen where RaceConfig hasn't
    been (re)created yet) -- callers should fall back to the blind scan in
    that case, not treat None as fatal."""
    raceconfig_base = read_ptr(RACECONFIG_SINSTANCE_ADDR)
    if raceconfig_base is None or not (0x90000000 <= raceconfig_base < 0x94000000):
        return None
    settings_addr = raceconfig_base + RACECONFIG_TO_SETTINGS_OFFSET
    try:
        lap_count = dme.read_byte(settings_addr + RACEDATA_OFF_LAP_COUNT)  # a single byte -- read_word here was big-endian, so a lap count of 3 landed in the HIGH byte (0x03000000) and a low-byte check never matched
    except Exception:
        return None
    if lap_count != 3:
        return None
    course_id = read_ptr(settings_addr + RACEDATA_OFF_COURSE_ID)
    if course_id is None or course_id > 0x29:
        return None
    return settings_addr


def detect_loadout(player_addr: int):
    """Reads one player's chosen character/vehicle id, once -- via the
    RacedataPlayer[12] array, indexed by that player's own id byte
    (PLAYER_OFF_ID), the same id read_all_players already uses. Returns
    (character_id, vehicle_id) or None if the player's id can't be read,
    the settings address isn't currently resolvable, or either value
    fails its sanity check -- never guessed, same spirit as every other
    reader in this file."""
    try:
        player_id = dme.read_byte(player_addr + PLAYER_OFF_ID)
    except Exception:
        return None
    if player_id is None or player_id > 11:
        return None
    settings_addr = get_racedata_settings_addr()
    if settings_addr is None:
        return None
    slot_addr = settings_addr - PLAYERS_TO_SETTINGS_GAP + player_id * RACEDATA_PLAYER_STRIDE
    vehicle_id = read_ptr(slot_addr + RACEDATAPLAYER_OFF_VEHICLE_ID)
    character_id = read_ptr(slot_addr + RACEDATAPLAYER_OFF_CHARACTER_ID)
    if vehicle_id is None or character_id is None:
        return None
    if not (0 <= vehicle_id <= RACEDATAPLAYER_VEHICLE_ID_MAX and 0 <= character_id <= RACEDATAPLAYER_CHARACTER_ID_MAX):
        return None
    return character_id, vehicle_id


def find_course_id():
    """Same lookup find_track_name() has always done, factored out to
    return the raw course_id int (KartStats bridge only -- it needs the
    raw id to map to a circuit slug, not a display string). find_track_name()
    below is now just this plus track_name() -- identical behavior to
    before this was split, nothing about the actual lookup changed.
    Returns None under the exact same conditions find_track_name() used to
    return None for."""
    settings_addr = get_racedata_settings_addr()
    if settings_addr is not None:
        course_id = read_ptr(settings_addr + RACEDATA_OFF_COURSE_ID)
        if course_id is not None:
            return course_id

    found = []
    for start, end in REGIONS:
        found.extend(scan_region_for_racedata_settings(start, end))
    if len(found) != 1:
        return None
    return read_ptr(found[0] + RACEDATA_OFF_COURSE_ID)


def find_track_name():
    """Looks up the current course fresh, every time it's called -- not
    cached. Raceinfo itself turned out not to reliably survive every
    track/cup transition despite being documented as a permanent singleton
    (see the dead-address fix a couple commits back), so there's no reason
    to assume Racedata's settings block would either. Returns a display
    string, or None if neither the fast path nor the scan found exactly one
    unambiguous match (better to just omit the track name for a race than
    print a wrong one).

    Tries the RaceConfig::spInstance fast path first (one dereference plus
    a light sanity check, no scanning) and only falls back to the blind
    full-RAM scan if that doesn't resolve -- same pattern as Raceinfo's
    try_fast_path(), kept so this doesn't break on a different game
    build/region where RACECONFIG_SINSTANCE_ADDR isn't this."""
    course_id = find_course_id()
    return track_name(course_id) if course_id is not None else None


def read_ptr(addr: int):
    try:
        return dme.read_word(addr)
    except Exception:
        return None


def read_float(addr: int):
    """Reads a big-endian f32 at addr, or None on a bad read."""
    try:
        return struct.unpack(">f", dme.read_bytes(addr, 4))[0]
    except Exception:
        return None


def read_player_speed(player_idx: int):
    """DIAGNOSTIC (see MKW_SCAN_PLAYER_SPEED above) -- chases
    PlayerHolder::sInstance -> players[player_idx] -> playerSub ->
    playerSub10 -> vehicleSpeed. Returns the raw float, or None if any
    hop comes back null/unreadable: a broken hop just means no reading
    this tick, never a guessed one."""
    holder = read_ptr(PLAYERHOLDER_SINSTANCE_ADDR)
    if not holder:
        return None
    players = read_ptr(holder + PLAYERHOLDER_OFF_PLAYERS)
    if not players:
        return None
    player = read_ptr(players + player_idx * 4)
    if not player:
        return None
    player_sub = read_ptr(player + PLAYERHOLDER_PLAYER_OFF_SUB)
    if not player_sub:
        return None
    player_sub10 = read_ptr(player_sub + PLAYERHOLDER_SUB_OFF_SUB10)
    if not player_sub10:
        return None
    return read_float(player_sub10 + PLAYERHOLDER_SUB10_OFF_SPEED)


def _mem_range_ok(addr):
    """Loose plausibility check -- MEM1 or MEM2, same ranges find_itemhandler_addr
    already trusts elsewhere in this file. Not a guarantee of correctness,
    just enough to tell "this looks like a real pointer" from "this is
    garbage/uninitialized/the wrong offset entirely"."""
    return addr is not None and (0x80000000 <= addr < 0x81800000 or 0x90000000 <= addr < 0x94000000)


def debug_player_chain(player_idx: int):
    """DIAGNOSTIC -- same chain as read_player_speed, but returns every
    intermediate hop (as an ordered dict, stopping at the first hop that
    doesn't look like a real pointer) so a broken link shows exactly
    where, instead of a single final number that could be garbage for
    any of several different reasons."""
    hops = {}
    holder = read_ptr(PLAYERHOLDER_SINSTANCE_ADDR)
    hops["holder"] = holder
    if not _mem_range_ok(holder):
        return hops
    players = read_ptr(holder + PLAYERHOLDER_OFF_PLAYERS)
    hops["players"] = players
    if not _mem_range_ok(players):
        return hops
    player = read_ptr(players + player_idx * 4)
    hops["player"] = player
    if not _mem_range_ok(player):
        return hops
    player_sub = read_ptr(player + PLAYERHOLDER_PLAYER_OFF_SUB)
    hops["player_sub"] = player_sub
    if not _mem_range_ok(player_sub):
        return hops
    player_sub10 = read_ptr(player_sub + PLAYERHOLDER_SUB_OFF_SUB10)
    hops["player_sub10"] = player_sub10
    if not _mem_range_ok(player_sub10):
        return hops
    hops["speed"] = read_float(player_sub10 + PLAYERHOLDER_SUB10_OFF_SPEED)
    return hops


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


def read_all_players(players_ptr: int, max_slots: int = MAX_PLAYER_SLOTS):
    """Multiplayer slot-mapping diagnostic: reads every players[i] slot that
    looks sane (pointer in range, id<=11 -- the same checks the single-
    player path already trusts), and returns (slot_index, id, pos, lap,
    maxlap, flags) for each one that does. Slot 0 is documented as "the
    local player" for single-player, but there's no documented field that
    says which slot(s) are local/human vs CPU in general -- player.h's
    PlayerSub1c.bitfield4 has real/local/cpu/remote bits, but on a
    different class (Player, not RaceinfoPlayer) with no documented link
    between the two classes' indices. Rather than guess that mapping,
    dumping every slot's raw state here lets it be read off empirically by
    eye, in real time, while actually playing 2P split-screen: whichever
    slot's position/lap visibly tracks player 1's on-screen play is player
    1, same for player 2 -- no indexing assumption required."""
    out = []
    for i in range(max_slots):
        player_ptr = read_ptr(players_ptr + i * POINTER_SIZE)
        if player_ptr is None or not (
            0x80000000 <= player_ptr < 0x81800000 or 0x90000000 <= player_ptr < 0x94000000
        ):
            continue
        try:
            player_id = dme.read_byte(player_ptr + PLAYER_OFF_ID)
        except Exception:
            continue
        if player_id > 11:
            continue
        player = read_player(player_ptr)
        if player is None:
            continue
        pos, lap, maxlap, flags = player
        out.append((i, player_id, pos, lap, maxlap, flags))
    return out


def _find_other_player_addr(raceinfo_addr: int, known_addr: int):
    """KartStats bridge only. 2P split-screen has a second real human
    player besides whichever one `known_addr` (PLAYER_SLOT_INDEX) already
    tracks. Finds the first OTHER slot passing the exact same sanity
    checks read_all_players already uses just above (pointer in range, a
    readable id<=11, a readable player struct) -- the same empirical,
    "no documented local/remote bit, read it off by eye" situation
    described on read_all_players, which is exactly why KartStats' own
    Player Assignment step has a 'swap players' escape hatch instead of
    trusting slot order to mean anything in particular. Returns None
    (bridge just sends slot 1) if nothing else sane is found -- e.g. true
    single-player testing, or the struct layout changed."""
    players_ptr = read_ptr(raceinfo_addr + RACEINFO_OFF_PLAYERS)
    if players_ptr is None:
        return None
    for i in range(MAX_PLAYER_SLOTS):
        cand = read_ptr(players_ptr + i * POINTER_SIZE)
        if cand is None or cand == known_addr:
            continue
        if not (0x80000000 <= cand < 0x81800000 or 0x90000000 <= cand < 0x94000000):
            continue
        try:
            player_id = dme.read_byte(cand + PLAYER_OFF_ID)
        except Exception:
            continue
        if player_id > 11:
            continue
        if read_player(cand) is not None:
            return cand
    return None


def _bump(counts, key):
    if counts is not None:
        counts[key] = counts.get(key, 0) + 1


def _raceinfo_snapshot(addr: int, counts=None):
    """Read every field this candidate needs to agree on, in one shot, so we
    can compare two snapshots taken slightly apart in time. Returns a tuple
    or None if anything failed to read. `counts`, when given a dict, gets a
    running tally of how far candidates make it through this funnel --
    added to answer a live-testing mystery: lock-on consistently takes
    until lap 3, with the verify step staying near-zero cost for over 100
    seconds straight beforehand, meaning essentially none of the ~9700
    raw hits per attempt reach even the first real check during that whole
    stretch. This tally pinpoints exactly which check the real object is
    failing (or whether it isn't even showing up as a raw hit at all)
    during laps 1-2, instead of continuing to guess."""
    players_ptr = read_ptr(addr + RACEINFO_OFF_PLAYERS)
    if players_ptr is None or not (
        0x80000000 <= players_ptr < 0x81800000 or 0x90000000 <= players_ptr < 0x94000000
    ):
        _bump(counts, "players_ptr_invalid")
        return None
    _bump(counts, "players_ptr_ok")

    player0_ptr = read_ptr(players_ptr + PLAYER_SLOT_INDEX * POINTER_SIZE)
    if player0_ptr is None or not (
        0x80000000 <= player0_ptr < 0x81800000 or 0x90000000 <= player0_ptr < 0x94000000
    ):
        _bump(counts, "player0_ptr_invalid")
        return None
    _bump(counts, "player0_ptr_ok")

    try:
        player_id = dme.read_byte(player0_ptr + PLAYER_OFF_ID)
    except Exception:
        _bump(counts, "player_id_unreadable")
        return None
    if player_id > 11:
        _bump(counts, "player_id_too_high")
        return None
    _bump(counts, "player_id_ok")

    player = read_player(player0_ptr)
    if player is None:
        _bump(counts, "player_read_failed")
        return None
    pos, lap, maxlap, flags = player
    _bump(counts, "reached_maxlap_check")
    if maxlap != 3:
        _bump(counts, "maxlap_not_3")
        return None
    _bump(counts, "maxlap_3")
    if pos > 12:
        _bump(counts, "pos_too_high")
        return None
    _bump(counts, "pos_ok")
    if flags > 0xFF:
        _bump(counts, "flags_too_high")
        return None
    _bump(counts, "flags_ok")
    return players_ptr, player0_ptr, maxlap, pos, flags


def verify_raceinfo_candidate(addr: int, counts=None) -> bool:
    """Secondary, scalar check on a candidate that passed the vectorized
    pointer-shape filter: actually dereference players[] and confirm slot 0
    looks like a real player struct (field-level checks -- maxLap==3,
    pos<=12, flags<=0xFF -- all live in _raceinfo_snapshot now, so its
    `counts` funnel covers them), AND that the same answer holds up a
    moment later (the structural re-check unique to this function).

    Things that turned out to matter a lot here, found by grepping real
    false-positive runs:

    1. maxLap must be EXACTLY 3, not "0 or 3". Every real MKW GP/VS race is
       exactly 3 laps, so maxLap==0 looked like a harmless extra allowance
       for "caught before race settings applied" -- but 0 is also just
       ordinary zero bytes, which are everywhere in memory. Allowing it let
       a huge, totally unrelated, uniformly-spaced array of game objects
       through (confirmed: every one of 591 false positives had maxLap in
       {0, something-not-3}, none had maxLap==3).

    2. A single read isn't enough: one false positive had a players[]
       pointer that, read again moments later, came back as garbage
       (0x00000237) -- ephemeral/rapidly-reused memory that happened to
       look right for one instant. Raceinfo is a real singleton and should
       read identically a fraction of a second later.

    3. stateFlags must be small. Every legitimate reading seen in live
       testing has been 0x0 (before the race starts) or 0x1 (STATE_IN_RACE)
       -- the documented bits all fit in the low byte. A false positive
       still got through the checks above with flags=0x4D0000, stuck
       permanently at stage=0.
    """
    snap1 = _raceinfo_snapshot(addr, counts)
    if snap1 is None:
        return False
    players_ptr1, player0_ptr1, maxlap1, pos1, flags1 = snap1

    time.sleep(0.4)

    snap2 = _raceinfo_snapshot(addr, counts)
    if snap2 is None:
        _bump(counts, "snap2_failed")
        return False
    players_ptr2, player0_ptr2, maxlap2, pos2, flags2 = snap2

    # The pointers are structural -- they should be IDENTICAL a moment
    # later for a real, stable singleton. Position is allowed to change
    # (the race is live), but the snapshot already re-checked it's sane.
    if players_ptr1 != players_ptr2 or player0_ptr1 != player0_ptr2:
        _bump(counts, "snap2_pointer_mismatch")
        return False
    _bump(counts, "accepted")
    return True


def try_fast_path():
    """Dereference SINSTANCE_ADDR directly instead of blind-scanning all of
    MEM1+MEM2 for something Raceinfo-shaped. This sidesteps the whole
    blind-scan problem, including the lap-3 lock-on delay the verify funnel
    traced back to random1/random2: that delay came from REQUIRING those
    two fields to look like pointers as part of a blind shape filter, which
    only matters when you don't already know the address. Here we already
    have the one authoritative address, so there's no shape-guessing left
    to do -- only a light sanity check (stage small, players_ptr valid),
    not the strict maxLap==3 filter the blind scan needed to avoid false
    positives.

    Returns the Raceinfo object's current address, or None if the pointer
    doesn't look right (not yet initialized this early in boot, or a
    different game build/region where SINSTANCE_ADDR isn't this)."""
    addr = read_ptr(SINSTANCE_ADDR)
    if addr is None or not (
        0x80000000 <= addr < 0x81800000 or 0x90000000 <= addr < 0x94000000
    ):
        return None
    stage = read_ptr(addr + RACEINFO_OFF_STAGE)
    if stage is None or not (0 <= stage <= 2):
        return None
    players_ptr = read_ptr(addr + RACEINFO_OFF_PLAYERS)
    if players_ptr is None or not (
        0x80000000 <= players_ptr < 0x81800000 or 0x90000000 <= players_ptr < 0x94000000
    ):
        return None
    return addr


def find_raceinfo_candidates():
    """One-time structural scan for the Raceinfo singleton. Returns every
    address that matched the vectorized pointer-shape filter AND survived
    scalar verification -- usually just one, but the filter is weaker
    against real, densely-pointer-filled game memory than against random
    noise (practically every real pointer in the process IS in the valid
    MEM1/MEM2 range by construction, so any other object with a few pointer
    members in the right positions can coincidentally pass too). Returning
    all of them, with diagnostics, beats silently trusting the first one.

    Also returns a breakdown of how long the scan took per region (second
    element), a funnel of how far raw hits got through verification,
    aggregated across both regions (third element), and a count of how many
    addresses would have been raw hits with no constraint on random1/random2
    (fourth element). All exist to answer the same live-testing mystery:
    lock-on has repeatedly taken until lap 3, with verify cost staying near
    zero (meaning essentially none of the ~9700 raw hits per attempt reach
    even the first real check) for the entire time before that -- the timing
    breakdown already ruled out "the scan itself is slow" (consistently well
    under 1s), the funnel narrowed it to "the real object usually isn't even
    a raw hit", and the no-random count exists to confirm (or rule out)
    continuing to guess."""
    found = []
    timing = []
    counts = {}
    no_random_total = 0
    for start, end in REGIONS:
        t_scan_start = time.time()
        raw_hits, no_random_count = scan_region_for_raceinfo(start, end)
        no_random_total += no_random_count
        t_scan_done = time.time()
        for addr in raw_hits:
            if verify_raceinfo_candidate(addr, counts):
                found.append(addr)
        t_verify_done = time.time()
        timing.append(
            (start, end, len(raw_hits), t_scan_done - t_scan_start, t_verify_done - t_scan_done)
        )
    return found, timing, counts, no_random_total


def describe_candidate(addr: int) -> str:
    """One-line diagnostic dump of a Raceinfo candidate, for the terminal --
    so a wrong lock is visible immediately instead of just silence. Includes
    random1/random2's raw values -- added to directly inspect whether these
    fields actually look like pointers (stable, in-range) or like arbitrary
    RNG state, which is the live question behind the no-constraint raw-hit
    count logged alongside the search funnel."""
    stage = read_ptr(addr + RACEINFO_OFF_STAGE)
    random1 = read_ptr(addr + RACEINFO_OFF_RANDOM1)
    random2 = read_ptr(addr + RACEINFO_OFF_RANDOM2)
    players_ptr = read_ptr(addr + RACEINFO_OFF_PLAYERS)
    player0_ptr = get_local_player_addr(addr)
    player = read_player(player0_ptr) if player0_ptr else None
    player_desc = f"pos={player[0]} lap={player[1]}/{player[2]} flags=0x{player[3]:X}" if player else "unreadable"
    r1 = f"0x{random1:08X}" if random1 is not None else "?"
    r2 = f"0x{random2:08X}" if random2 is not None else "?"
    return (
        f"0x{addr:08X}: stage={stage}  random1={r1} random2={r2}  "
        f"players_ptr=0x{players_ptr:08X}  player0=0x{player0_ptr:08X}  ({player_desc})"
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


def _log_player_change(race_num: int, label: str, prev, cur) -> None:
    """Same wording for both players: 'player 1 overtakes, now p11' /
    'player 2 dropped to p12' / 'player 1 -- lap 2/3 (p5)'. `prev`/`cur`
    are read_player() tuples (pos, lap, maxlap, flags); prev may be None."""
    if prev is None:
        return
    pos, lap = cur[0], cur[1]
    if pos != prev[0]:
        if pos < prev[0]:
            print(f"[race {race_num}] {label} overtakes, now p{pos}  (was p{prev[0]}, lap {lap}/{STANDARD_LAP_COUNT})", flush=True)
        else:
            print(f"[race {race_num}] {label} dropped to p{pos}  (was p{prev[0]}, lap {lap}/{STANDARD_LAP_COUNT})", flush=True)
    if lap != prev[1]:
        print(f"[race {race_num}] {label} -- lap {lap}/{STANDARD_LAP_COUNT}  (p{pos})", flush=True)


def _wait_for_other_player_finish(other_addr: int, race_num: int, telemetry, race_start: float, raceinfo_addr: int = None, timeout_s: float = 60.0) -> None:
    """KartStats bridge only. Our own primary/local player already
    finished (or left the race stage) and track_until_race_ends is about
    to return -- but the OTHER player might still be racing. Without this,
    their remaining position-updates and race-finished event would never
    get sent, and KartStats' finalize step (which waits for BOTH slots
    before turning a race permanent) would never close out the race.
    Polls just this one slot, same cadence as the main loop, until it
    finishes, stops making sense, or timeout_s runs out (e.g. the other
    player quit to the menu without finishing). Does not touch
    track_until_race_ends's own return value or timing at all -- this
    only ever runs after that function has already decided to return."""
    print(f"[race {race_num}] KartStats bridge: waiting for the other player to finish too...", flush=True)
    deadline = time.time() + timeout_s
    stale = 0
    while time.time() < deadline:
        if not dme.is_hooked():
            return
        # The race ends for EVERYONE once all the other racers (CPUs
        # included) finish -- a last-place player never crosses the line.
        if raceinfo_addr is not None:
            stage = read_ptr(raceinfo_addr + RACEINFO_OFF_STAGE)
            if stage is not None and stage != 2:
                return
        cur = read_player(other_addr)
        if cur is None:
            stale += 1
            if stale >= STALE_READS_TO_GIVE_UP:
                return
            time.sleep(TRACK_POLL_S)
            continue
        stale = 0
        _pos, _lap, _maxlap, flags = cur
        ts_ms = int((time.time() - race_start) * 1000)
        telemetry.poll_slot(race_num, ts_ms, 2, cur, bool(flags & STATE_FINISHING))
        if flags & STATE_FINISHING:
            return
        time.sleep(TRACK_POLL_S)


def track_until_race_ends(raceinfo_addr: int, player_addr: int, race_num: int, telemetry=None):
    """Poll the local player's struct until the real finish flag
    (stateFlags & STATE_FINISHING) appears, Raceinfo.stage leaves 2 (race),
    or reads stop making sense entirely. Prints a line whenever position or
    lap changes (denominator shown is the constant STANDARD_LAP_COUNT, not
    the live maxLap field -- see that constant's comment for why). Also
    prints a full all-slots dump every PLAYER_DUMP_INTERVAL_S for players
    (opt-in, MKW_DUMP_PLAYERS) -- see read_all_players.

    If SCAN_PLAYER_ITEM is on, also diffs [player_addr, player_addr +
    PLAYER_ITEM_SCAN_SIZE) every tick (reusing the read_player call this
    loop already makes every tick anyway) and prints every byte that
    changes, flagging ones that land in the real item range. At the end of
    the race it prints a per-offset summary -- see the "Held item"
    comment block above read_player_item_window for why this, rather than
    a whole-RAM scan, is the current approach. The idea is to play one
    race with this on, then report back (in order) which items you
    actually picked up, and match that sequence against the printed
    offsets by eye.

    `telemetry` (KartStats bridge only, default None -- zero behavior
    change for anyone not using it) is an already-configured
    kartstats_bridge.TelemetryBridge. When set, this also finds the OTHER
    player's slot (_find_other_player_addr) and polls/sends both players'
    position-update/lap-complete/race-finished events every tick,
    alongside everything this function already did -- see that helper and
    _wait_for_other_player_finish for why a second slot needs its own
    handling here.
    Returns ((pos, lap, maxlap), reason)."""
    last = None
    stale = 0
    next_dump = time.time()
    race_start = time.time()
    prev_window = read_player_item_window(player_addr) if SCAN_PLAYER_ITEM else None
    offset_history = {}  # offset -> [(elapsed_s, value), ...] -- only this race, printed at the end
    prev_item_packet = None
    item_packet_history = {}  # field_name -> [(elapsed_s, value), ...]
    itemhandler_addr = None
    itemhandler_scan_done = False  # one attempt per race -- see the call site's comment
    prev_item_tail = {1: None, 2: None}  # slot -> last-seen item_tail, for pickup detection below
    next_speed_print = 0.0  # throttles MKW_SCAN_PLAYER_SPEED's print to ~2/sec, not every tick
    playersub10_addrs = None  # resolved once per race by find_playersub10_candidates(), like itemhandler_addr
    playersub10_scan_done = False
    playersub10_history = {}       # addr -> list of recent vehicleSpeed readings, for the liveness filter
    playersub10_live_addrs = None  # narrowed subset of playersub10_addrs once PLAYERSUB10_LIVENESS_WINDOW samples are in
    ptr_tracked = {}  # source_offset -> {"target", "window", "history", "retargets"}

    other_addr = _find_other_player_addr(raceinfo_addr, player_addr)
    other_last = None
    clock_started = False  # lap/finish times count from GO (Raceinfo stage 2), not from the countdown
    if telemetry is not None:
        telemetry.start_race(race_num)
        if other_addr is None:
            print(f"[race {race_num}] KartStats bridge: only found one other player slot -- player 2 will be missing.", flush=True)
    if other_addr is not None:
        other_first = read_player(other_addr)
        if other_first is not None:
            print(f"[race {race_num}] player 2 starting position: p{other_first[0]}", flush=True)
            other_last = other_first

    first = read_player(player_addr)
    if first is not None:
        pos, lap, maxlap, _flags = first
        print(f"[race {race_num}] player 1 starting position: p{pos}", flush=True)
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
            time.sleep(TRACK_POLL_S)
            continue
        stale = 0

        pos, lap, maxlap, flags = cur
        _log_player_change(race_num, "player 1", last, cur)
        last = cur

        other_cur = read_player(other_addr) if other_addr is not None else None
        if other_cur is not None:
            _log_player_change(race_num, "player 2", other_last, other_cur)
            other_last_new = other_cur
        else:
            other_last_new = other_last

        if telemetry is not None and stage == 2:
            if not clock_started:
                clock_started = True
                race_start = time.time()
                # Re-read the course at GO: if the early read (at the
                # countdown) was stale/different, correct it -- the latest
                # circuit-detected event wins on the KartStats side.
                cid = find_course_id()
                circ = bridge.COURSE_ID_TO_CIRCUIT_ID.get(cid) if cid is not None else None
                if circ and circ != telemetry.circuit_id:
                    telemetry.send_circuit_detected(race_num, circ)
                # Character/kart: read once here too -- doesn't change
                # mid-race, and the server only ever uses the FIRST race's
                # reading for the whole season anyway (see finalize.ts),
                # so later races' reads are harmless no-ops there.
                loadout1 = detect_loadout(player_addr)
                if loadout1:
                    telemetry.send_loadout_detected(race_num, 1, *loadout1)
                if other_addr is not None:
                    loadout2 = detect_loadout(other_addr)
                    if loadout2:
                        telemetry.send_loadout_detected(race_num, 2, *loadout2)
            ts_ms = int((time.time() - race_start) * 1000)
            telemetry.poll_slot(race_num, ts_ms, 1, cur, bool(flags & STATE_FINISHING))
            if other_cur is not None:
                telemetry.poll_slot(race_num, ts_ms, 2, other_cur, bool(other_cur[3] & STATE_FINISHING))

            # Item pickups: independent of SCAN_PLAYER_ITEM (that flag only
            # gates the exploratory diagnostic scans below, used to FIND a
            # trustworthy signal in the first place). item_tail is the one
            # item-related field this project has actually validated with
            # the same strict, multi-field shape-check already trusted for
            # Raceinfo/RaceConfig (see _itemhandler_shape_ok) -- the only
            # one wired to send anything real. A pickup is "item_tail went
            # from empty straight to a real item id": MKW never lets a
            # player hold two items at once, so that exact transition can
            # only mean a box was just opened.
            if itemhandler_addr is None and not itemhandler_scan_done:
                itemhandler_addr = find_itemhandler_addr()
                itemhandler_scan_done = True
            if itemhandler_addr is not None:
                for slot, addr, reading in ((1, player_addr, cur), (2, other_addr, other_cur)):
                    if addr is None or reading is None:
                        continue
                    try:
                        pid = dme.read_byte(addr + PLAYER_OFF_ID)
                    except Exception:
                        continue
                    packet = read_item_packet(itemhandler_addr, pid)
                    if packet is None:
                        continue
                    tail = packet[ITEMPACKET_OFF_ITEM_TAIL]
                    prev_tail = prev_item_tail.get(slot)
                    if prev_tail == ITEM_NONE_VALUE and HELD_ITEM_MIN <= tail <= HELD_ITEM_MAX:
                        print(f"[race {race_num}] player {slot} picked up: {item_name(tail)} "
                              f"(lap {reading[1]}/{STANDARD_LAP_COUNT})", flush=True)
                        telemetry.send_item_received(race_num, slot, ts_ms, tail, reading[1])
                    prev_item_tail[slot] = tail

            # Live speed: DIAGNOSTIC ONLY, see MKW_SCAN_PLAYER_SPEED above.
            # Not wired into telemetry -- print and eyeball first.
            if SCAN_PLAYER_SPEED:
                if playersub10_addrs is None and not playersub10_scan_done:
                    playersub10_scan_done = True
                    found = find_playersub10_candidates()
                    if len(found) == 0:
                        print("  no PlayerSub10 candidates this attempt (will not retry this race)")
                        playersub10_addrs = []
                    else:
                        shown = ", ".join(f"0x{c:08X}" for c in found)
                        print(f"  {len(found)} candidate(s): {shown}" + (" -- expected 2 (one per player)" if len(found) != 2 else ""))
                        playersub10_addrs = found
                now = time.time()
                if playersub10_addrs and now >= next_speed_print:
                    next_speed_print = now + 0.5
                    readings = {}
                    for addr in playersub10_addrs:
                        s = read_float(addr + PLAYERSUB10_OFF_VEHICLE_SPEED)
                        readings[addr] = s
                        if s is not None:
                            hist = playersub10_history.setdefault(addr, [])
                            hist.append(s)
                            if len(hist) > PLAYERSUB10_LIVENESS_WINDOW:
                                hist.pop(0)

                    # Judge liveness once every candidate has a full window of
                    # samples -- a static KartParam-table false positive sits
                    # at an unchanging value the whole time; a real per-kart
                    # object moves as the race plays out (lap 1 alone is
                    # plenty of acceleration/cornering/boosts to clear the
                    # epsilon). Judged exactly once per race, not re-checked
                    # continuously, so a kart that happens to coast dead
                    # straight for 3s right at the start isn't later re-added
                    # or dropped -- that tradeoff is fine since the window is
                    # early in lap 1 nearly every race.
                    if playersub10_live_addrs is None and all(
                        len(playersub10_history.get(a, [])) >= PLAYERSUB10_LIVENESS_WINDOW for a in playersub10_addrs
                    ):
                        live = [
                            a for a in playersub10_addrs
                            if (max(playersub10_history[a]) - min(playersub10_history[a])) >= PLAYERSUB10_LIVENESS_EPSILON
                        ]
                        dead = [a for a in playersub10_addrs if a not in live]
                        playersub10_live_addrs = live
                        print(
                            f"  liveness filter: {len(live)} live, {len(dead)} static (dropped)"
                            + (" -- live: " + ", ".join(f"0x{a:08X}" for a in live) if live else "")
                            + (" -- expected 2 (one per human player) once CPU racers are also told apart" if len(live) != 2 else ""),
                            flush=True,
                        )

                    show_addrs = playersub10_live_addrs if playersub10_live_addrs is not None else playersub10_addrs
                    parts = [
                        f"0x{a:08X}: {readings[a]:.1f}" if readings.get(a) is not None else f"0x{a:08X}: ?"
                        for a in show_addrs
                    ]
                    print(f"[race {race_num}] speed (structural scan) -- " + " | ".join(parts), flush=True)
        other_last = other_last_new

        if SCAN_PLAYER_ITEM:
            elapsed = round(time.time() - race_start, 1)

            cur_window = read_player_item_window(player_addr)
            if cur_window is not None and prev_window is not None and len(cur_window) == len(prev_window):
                diff_idx = np.nonzero(prev_window != cur_window)[0]
                for i in diff_idx:
                    offset = int(i)
                    new_val = int(cur_window[i])
                    offset_history.setdefault(offset, []).append((elapsed, new_val))
                    if VERBOSE_PLAYER_WINDOW and HELD_ITEM_MIN <= new_val <= HELD_ITEM_MAX:
                        print(
                            f"[race {race_num}] player+0x{offset:02X} -> {item_name(new_val)} "
                            f"(0x{new_val:02X})  (t={elapsed}s, position {pos}, lap {lap}/{STANDARD_LAP_COUNT})",
                            flush=True,
                        )
            prev_window = cur_window

            # Pointer-chase path -- see the "Held item, step 3" comment block
            # above POINTER_TARGET_SCAN_SIZE for why this is the current,
            # most-grounded approach (every candidate address comes from
            # this already-verified window, not a guess or a published
            # number). Quiet by design -- see that same comment block for
            # why nothing here live-prints; everything shows up in
            # _print_pointer_chase_summary at race end instead.
            if cur_window is not None:
                for src_offset in find_pointer_offsets(cur_window):
                    target_addr = int(_read_u32_field(cur_window, src_offset, 1)[0])
                    state = ptr_tracked.get(src_offset)
                    if state is None:
                        if len(ptr_tracked) >= MAX_TRACKED_POINTERS:
                            continue
                        ptr_tracked[src_offset] = {
                            "target": target_addr,
                            "window": read_pointer_target_window(target_addr),
                            "history": {},
                            "retargets": [(elapsed, target_addr)],
                        }
                        continue
                    if state["target"] != target_addr:
                        state["target"] = target_addr
                        state["window"] = read_pointer_target_window(target_addr)
                        state["retargets"].append((elapsed, target_addr))
                        continue
                    new_window = read_pointer_target_window(target_addr)
                    if (
                        new_window is not None
                        and state["window"] is not None
                        and len(new_window) == len(state["window"])
                    ):
                        diff_idx = np.nonzero(state["window"] != new_window)[0]
                        for i in diff_idx:
                            off = int(i)
                            new_val = int(new_window[i])
                            state["history"].setdefault(off, []).append((elapsed, new_val))
                    state["window"] = new_window

            # ITEMHandler path -- see the "Held item, step 2" comment block
            # above ITEMHANDLER_SINSTANCE_ADDR for why this verifies content
            # rather than trusting the published static address blindly.
            # ONE attempt per race, not a retry loop: live testing showed the
            # fallback full-RAM scan returning 100,000+ ambiguous candidates
            # on real game memory (structured zero/sparse regions pass the
            # range checks far more often than the synthetic random-noise
            # test anticipated) -- repeating that every couple seconds just
            # re-finds the same huge, unusable set while flooding the
            # terminal and burning real CPU. Retrying can't fix a
            # fundamentally too-weak fingerprint, so don't retry.
            if itemhandler_addr is None and not itemhandler_scan_done:
                itemhandler_addr = find_itemhandler_addr()
                itemhandler_scan_done = True

            if itemhandler_addr is not None:
                try:
                    local_id = dme.read_byte(player_addr + PLAYER_OFF_ID)
                except Exception:
                    local_id = None
                if local_id is not None:
                    cur_packet = read_item_packet(itemhandler_addr, local_id)
                    if cur_packet is not None:
                        if prev_item_packet is not None and len(cur_packet) == len(prev_item_packet) == ITEMPACKET_SIZE:
                            for name, off in ITEMPACKET_FIELDS:
                                if name in NOISY_ITEMPACKET_FIELDS:
                                    continue
                                old_v, new_v = prev_item_packet[off], cur_packet[off]
                                if old_v != new_v:
                                    item_packet_history.setdefault(name, []).append((elapsed, new_v))
                                    print(
                                        f"[race {race_num}] item_packet.{name}: {_decode_item_field(name, old_v)} -> "
                                        f"{_decode_item_field(name, new_v)}  (t={elapsed}s, position {pos}, "
                                        f"lap {lap}/{STANDARD_LAP_COUNT})",
                                        flush=True,
                                    )
                        prev_item_packet = cur_packet

        if DUMP_ALL_PLAYERS and time.time() >= next_dump:
            players_ptr = read_ptr(raceinfo_addr + RACEINFO_OFF_PLAYERS)
            slots = read_all_players(players_ptr) if players_ptr else []
            desc = " | ".join(
                f"slot{i}(id={pid}): pos={p} lap={l}/{STANDARD_LAP_COUNT} flags=0x{f:X}"
                for i, pid, p, l, m, f in slots
            )
            print(f"[race {race_num}] all players -- {desc or '(none readable)'}", flush=True)
            next_dump = time.time() + PLAYER_DUMP_INTERVAL_S

        if flags & STATE_FINISHING:
            if telemetry is not None and other_addr is not None and not telemetry.slot_finished(2):
                _wait_for_other_player_finish(other_addr, race_num, telemetry, race_start, raceinfo_addr)
            if SCAN_PLAYER_ITEM:
                _print_player_item_summary(race_num, offset_history)
                _print_item_packet_summary(race_num, item_packet_history)
                _print_pointer_chase_summary(race_num, ptr_tracked)
            return cur[:3], "finished"
        if stage is not None and stage != 2:
            if telemetry is not None and other_addr is not None and not telemetry.slot_finished(2):
                _wait_for_other_player_finish(other_addr, race_num, telemetry, race_start, raceinfo_addr)
            if SCAN_PLAYER_ITEM:
                _print_player_item_summary(race_num, offset_history)
                _print_item_packet_summary(race_num, item_packet_history)
                _print_pointer_chase_summary(race_num, ptr_tracked)
            return cur[:3], "left_race_stage"

        time.sleep(TRACK_POLL_S)


def _print_player_item_summary(race_num: int, offset_history: dict) -> None:
    """End-of-race dump for SCAN_PLAYER_ITEM: every offset in the scanned
    window that changed at all, with its full value history for the race.
    Safe to print in full -- the window is only PLAYER_ITEM_SCAN_SIZE bytes,
    so there's no risk of the huge-output problem a whole-RAM scan had."""
    if not offset_history:
        print(f"[race {race_num}] player-item scan: nothing in the window changed all race.", flush=True)
        return
    print(f"[race {race_num}] player-item scan -- {len(offset_history)} offset(s) changed:", flush=True)
    for offset in sorted(offset_history):
        hist = offset_history[offset]
        hist_desc = ", ".join(
            f"{t}s:{item_name(v) if HELD_ITEM_MIN <= v <= HELD_ITEM_MAX else f'0x{v:02X}'}"
            for t, v in hist[:20]
        )
        more = f" (+{len(hist) - 20} more)" if len(hist) > 20 else ""
        print(f"  +0x{offset:02X}: {len(hist)} change(s) -- {hist_desc}{more}", flush=True)


def _print_item_packet_summary(race_num: int, item_packet_history: dict) -> None:
    """End-of-race dump for the ITEMHandler::sInstance / recvPackets path --
    see the "Held item, step 2" comment block above ITEMHANDLER_SINSTANCE_ADDR.
    item_tail is the documented "item actually being carried" field, so
    that history is the one to check first against the reported pickup
    sequence; the others (item_box, mode, tail_mode, ...) are printed too
    since they're free context from the same 8-byte packet."""
    if not item_packet_history:
        print(f"[race {race_num}] item packet: nothing changed all race "
              f"(ITEMHandler not found, or this player's packet never changed).", flush=True)
        return
    print(f"[race {race_num}] item packet -- {len(item_packet_history)} field(s) changed:", flush=True)
    for name, _off in ITEMPACKET_FIELDS:
        hist = item_packet_history.get(name)
        if not hist:
            continue
        hist_desc = ", ".join(f"{t}s:{_decode_item_field(name, v)}" for t, v in hist[:20])
        more = f" (+{len(hist) - 20} more)" if len(hist) > 20 else ""
        print(f"  {name}: {len(hist)} change(s) -- {hist_desc}{more}", flush=True)


def _print_pointer_chase_summary(race_num: int, ptr_tracked: dict) -> None:
    """End-of-race dump for the pointer-chase path -- see the "Held item,
    step 3" comment block above POINTER_TARGET_SCAN_SIZE. For each player-
    struct offset that looked like a real pointer at some point this race:
    when/where its value pointed (retargets -- a reallocated target shows
    up as more than one entry), and the full change history of whatever
    window that pointer led to. Known, expected pointer fields
    (KNOWN_PLAYER_POINTER_OFFSETS, for each of the ~3 racer copies visible
    in the window -- see PLAYER_STRUCT_STRIDE) are labeled so they're easy
    to recognize and skip past while scanning for the real one."""
    if not ptr_tracked:
        print(f"[race {race_num}] pointer chase: no player+offset looked like a real pointer this race.", flush=True)
        return
    print(f"[race {race_num}] pointer chase -- {len(ptr_tracked)} pointer-like offset(s) tracked:", flush=True)
    for src_offset in sorted(ptr_tracked):
        state = ptr_tracked[src_offset]
        relative = src_offset % PLAYER_STRUCT_STRIDE
        copy_idx = src_offset // PLAYER_STRUCT_STRIDE
        known = KNOWN_PLAYER_POINTER_OFFSETS.get(relative)
        label = f"{known}, copy {copy_idx}" if known else f"copy {copy_idx}, unrecognized field"
        retarget_desc = ", ".join(f"{t}s:0x{a:08X}" for t, a in state["retargets"])
        print(f"  player+0x{src_offset:02X} ({label}) -> {retarget_desc}", flush=True)
        hist = state["history"]
        if not hist:
            print("    (nothing in that window changed)", flush=True)
            continue
        for offset in sorted(hist):
            h = hist[offset]
            hist_desc = ", ".join(
                f"{t}s:{item_name(v) if HELD_ITEM_MIN <= v <= HELD_ITEM_MAX else f'0x{v:02X}'}"
                for t, v in h[:20]
            )
            more = f" (+{len(h) - 20} more)" if len(h) > 20 else ""
            print(f"    +0x{offset:02X}: {len(h)} change(s) -- {hist_desc}{more}", flush=True)


def _build_telemetry_from_args() -> "bridge.TelemetryBridge | None":
    """KartStats bridge only. Parses --api-url/--token (env vars
    KARTSTATS_API_URL/KARTSTATS_BRIDGE_TOKEN as defaults) and returns a
    configured TelemetryBridge, or None if the bridge module isn't
    importable or no token was given -- in both of those cases this
    script runs exactly as it always has, pure local printing, no network
    calls at all.

    No --season-id flag needed any more: the season to post into is
    found automatically from KartStats' own /api/telemetry/active-season
    endpoint (see kartstats_bridge.discover_season_id()) -- whichever
    Immersive season is currently sitting on "Waiting for Dolphin...".
    --season-id is still accepted as an override (skips discovery,
    posts straight into that id) for the rare case two seasons are
    somehow waiting at once and discovery picks the wrong one, but
    nothing has to be copy-pasted for the normal case."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--season-id",
        default=os.environ.get("KARTSTATS_SEASON_ID"),
        help="Override: post straight into this season id instead of auto-discovering the "
        "waiting Immersive season. Normally not needed.",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("KARTSTATS_API_URL", "http://localhost:3000/api/telemetry/events"),
        help="KartStats telemetry endpoint. Default: http://localhost:3000/api/telemetry/events",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("KARTSTATS_BRIDGE_TOKEN"),
        help="Must match the running KartStats app's TELEMETRY_BRIDGE_TOKEN env var. "
        "Omit to run this script exactly as before, with no KartStats bridge at all.",
    )
    args = parser.parse_args()

    if not args.token:
        return None
    if bridge is None:
        print(
            "--token was given but kartstats_bridge.py couldn't be imported -- "
            "running with the KartStats bridge disabled.",
            file=sys.stderr,
        )
        return None

    season_id = args.season_id
    if not season_id:
        print(f"KartStats bridge: waiting for an Immersive season to start ({args.api_url})...", flush=True)
        while not season_id:
            season_id = bridge.discover_season_id(args.api_url, args.token)
            if not season_id:
                time.sleep(3.0)
        print(f"KartStats bridge: found season {season_id}.\n", flush=True)

    print(f"KartStats bridge enabled -- posting to {args.api_url} for season {season_id}.\n")
    return bridge.TelemetryBridge(season_id=season_id, api_url=args.api_url, token=args.token)


def main() -> None:
    telemetry = _build_telemetry_from_args()

    hook_with_retry()
    print(
        "Autonomous tracking started -- play normally. No need to tell me "
        "when a race starts or ends; I'll print each race's final position "
        "as soon as it's over. Ctrl+C to stop.\n"
    )

    raceinfo_addr = None
    race_num = 0
    next_search_log = 0.0
    # Accumulates across races: candidate addresses of the permanent,
    # never-moving Raceinfo::sInstance pointer slot (as opposed to the
    # Raceinfo object itself, which is heap-allocated and lands at a
    # different address every session). Each freshly-confirmed race gives
    # a new, different real address to reverse-pointer-scan for; the
    # intersection across races should converge on just the one true
    # static slot. See find_sinstance_candidates().
    sinstance_candidates = None
    while True:
        if not dme.is_hooked():
            print("Lost hook to Dolphin. Exiting.")
            return

        if raceinfo_addr is None:
            # Try the direct route first: dereference the known-good
            # sInstance pointer slot (see SINSTANCE_ADDR / try_fast_path)
            # instead of blind-scanning. Cheap (3 reads) and retried every
            # loop tick, so the very first tick it looks right, lock-on is
            # effectively instant -- no more waiting for a race to reach
            # lap 3. Falls through to the full scan below whenever it
            # doesn't check out yet (too early in boot) or ever stops
            # checking out (wrong game build/region) -- that fallback is
            # left fully intact on purpose.
            fast_addr = try_fast_path()
            if fast_addr is not None:
                print(
                    f"Fast path -- Raceinfo::sInstance (0x{SINSTANCE_ADDR:08X}) -> "
                    f"0x{fast_addr:08X}; skipping the scan.\n  {describe_candidate(fast_addr)}\n",
                    flush=True,
                )
                raceinfo_addr = fast_addr
                continue

            # Rescanning every RESCAN_INTERVAL_S (0.5s) so lock-on happens as
            # soon as a race's settings load -- including if you start this
            # before you've even picked a race, straight from the menus.
            # Logging that search itself only every 5s, not every retry, so
            # sitting in menus for a few minutes doesn't flood the terminal
            # with hundreds of identical "looking" lines. Printing the last
            # scan's timing breakdown AND verify funnel alongside it -- see
            # find_raceinfo_candidates' docstring for why.
            candidates, timing, counts, no_random_total = find_raceinfo_candidates()
            if time.time() >= next_search_log:
                breakdown = "; ".join(
                    f"0x{start:08X}-0x{end:08X}: {n_hits} raw hit(s), "
                    f"scan {scan_s:.2f}s, verify {verify_s:.2f}s"
                    for start, end, n_hits, scan_s, verify_s in timing
                )
                funnel = ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "(nothing reached any check)"
                print(
                    f"Looking for Raceinfo... [{breakdown}]\n  funnel: {funnel}\n"
                    f"  (would-be raw hits with no constraint on random1/random2: {no_random_total})",
                    flush=True,
                )
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
            #
            # Bounded, not infinite: live testing caught a false positive
            # (plausible pointers/maxLap, but a wild stateFlags value) that
            # got stuck at stage=0 forever with nothing else to fall back
            # on. A full rescan is cheap (scans have measured well under 1s
            # each), and safe to retry even if the current candidate really
            # is Raceinfo just waiting at a menu -- a fresh scan will find
            # the same address again in the same state, so nothing is lost,
            # it just also gives a stuck dud a chance to be replaced.
            found_addr, found_player_addr = wait_for_any_race_start(candidates, timeout_s=20.0)
            if not dme.is_hooked():
                return
            if found_player_addr is None:
                print("None of these reached a real race; rescanning.\n", flush=True)
                continue
            raceinfo_addr = found_addr
            player_addr = found_player_addr
            print(f"Confirmed -- 0x{raceinfo_addr:08X} reached stage 2 with a real player read.\n", flush=True)

            # Free bonus data point toward finding the PERMANENT sInstance
            # pointer slot (see the comment above sinstance_candidates):
            # reverse-pointer-scan for whoever currently holds this
            # freshly-confirmed real address, and intersect with any
            # earlier races' results. Converging to one address here would
            # mean this scanning dance never has to happen again -- that
            # one fixed address could just be hardcoded for instant,
            # 100%-reliable lock-on in every future session.
            this_scan = set(find_sinstance_candidates(raceinfo_addr))
            if sinstance_candidates is None:
                sinstance_candidates = this_scan
            else:
                sinstance_candidates &= this_scan
            if not sinstance_candidates:
                print(
                    "sInstance pointer-scan: no candidates survived across races so far "
                    "(either none existed this race, or the real slot isn't in MEM1/MEM2 "
                    "in a form we're matching -- not fatal, just means no shortcut yet).\n",
                    flush=True,
                )
            else:
                addrs = ", ".join(f"0x{a:08X}" for a in sorted(sinstance_candidates))
                if len(sinstance_candidates) == 1:
                    print(
                        f"sInstance pointer-scan: converged on a single candidate -- {addrs}. "
                        "This should be the SAME address every session for this exact game "
                        "build/region. If it keeps holding up across more races, this is a "
                        "strong hardcode candidate to skip scanning entirely next time.\n",
                        flush=True,
                    )
                else:
                    print(f"sInstance pointer-scan: still narrowing -- {addrs}\n", flush=True)
        else:
            player_addr = wait_for_race_start(raceinfo_addr, timeout_s=9e9)
            if player_addr is None:
                # Either Dolphin's gone, or this address stopped making sense
                # (new session) -- drop it and look again from scratch.
                if dme.is_hooked():
                    raceinfo_addr = None
                continue

        race_num += 1
        course_id = find_course_id()
        track = track_name(course_id) if course_id is not None else None
        print(
            f"[race {race_num}] track: {track}" if track else f"[race {race_num}] track: (couldn't identify it)",
            flush=True,
        )

        if telemetry is not None and course_id is not None:
            circuit_id = bridge.COURSE_ID_TO_CIRCUIT_ID.get(course_id)
            if circuit_id:
                telemetry.send_circuit_detected(race_num, circuit_id)
            else:
                print(
                    f"[race {race_num}] KartStats bridge: course id 0x{course_id:02X} has no known "
                    "circuit mapping -- skipping the circuit-detected event for this race.",
                    flush=True,
                )

        result, reason = track_until_race_ends(raceinfo_addr, player_addr, race_num, telemetry)
        if telemetry is not None:
            telemetry.finish_race(race_num)  # one POST with the whole race; last place gets its last position and no final time
        if result is None:
            print(f"[race {race_num}] lost it before getting a solid reading; resuming.\n", flush=True)
            continue

        pos, lap, _maxlap = result
        print(
            f"[race {race_num}] FINAL POSITION: {pos}  "
            f"(lap {lap}/{STANDARD_LAP_COUNT}, {track or 'unknown track'}, ended via {reason})\n",
            flush=True,
        )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
