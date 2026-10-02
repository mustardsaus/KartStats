"""
Read-only probe: confirms we can read Mario Kart Wii's live finishing
position out of Dolphin's emulated RAM via dolphin-memory-engine.

No writes, no app wiring — see tools/position-read/README.md for the
one-time macOS setup this depends on (code-signing Dolphin so another
process is allowed to attach to its memory) before this will do
anything but fail to hook.

Struct source: https://github.com/SeekyCt/mkw-structures (raceinfo.h,
racedata.h). The default address is PAL and unverified for other
regions — pass --raceinfo-address once you've confirmed yours. See the
README and the comment above RACEINFO_SINSTANCE_DEFAULT below.
"""

import argparse
import sys
import time

try:
    import dolphin_memory_engine as dme
except ImportError:
    print(
        "dolphin_memory_engine isn't installed. From tools/position-read, run:\n"
        "  python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

# --- Region-specific address ----------------------------------------------
# This default is PAL, per https://github.com/SeekyCt/mkw-structures — the
# only region with a publicly documented Raceinfo::sInstance address as of
# writing. If your game is NTSC-U/RMCE01 (confirmed region for this repo's
# owner) or NTSC-J, this default is WRONG for you; don't trust a read until
# you've confirmed it some other way. Two options, cheapest first:
#   1. Just run this script as-is and look at the verbose pointer-hop
#      output below. If the region is wrong you'll typically see 0x00000000
#      or an address way outside the 0x80000000-0x81800000 MEM1/MEM2 range
#      — that's your answer, it's wrong, move to option 2.
#   2. Find your real address with the Dolphin Memory Engine GUI app (not
#      just this Python library) — https://github.com/aldelaro5/dolphin-memory-engine/releases
#      — using its Cheat Engine-style scanner: start a race, note your
#      position (1st), search type "Exact Value" for 1 as a byte; change
#      position by letting an opponent/CPU pass you; search "Exact Value"
#      for 2; repeat once or twice more until one result remains. That
#      address is PLAYER_OFF_POSITION added to your actual player struct
#      address for this session — not directly Raceinfo::sInstance, but
#      enough to confirm position is readable at all, and from there you
#      can scan for what points to it to find the stable sInstance address.
# Once you have a confirmed address for your region, pass it with
# --raceinfo-address instead of editing this constant, so this default
# can stay documented as "PAL, unverified for other regions."
RACEINFO_SINSTANCE_DEFAULT = 0x809BD730

# --- Struct offsets, from raceinfo.h --------------------------------------
# class Raceinfo (fields up to the ones we need):
#   0x0  vtable
#   0x4  random1
#   0x8  random2
#   0xC  players            <- RaceinfoPlayer**, what we want
RACEINFO_OFF_PLAYERS = 0xC

# class RaceinfoPlayer (fields up to the ones we need):
#   0x20 position   (uint8_t, 1 = 1st place)
#   0x24 currentLap (uint16_t)
#   0x26 maxLap     (uint8_t)
PLAYER_OFF_POSITION = 0x20
PLAYER_OFF_CURRENT_LAP = 0x24
PLAYER_OFF_MAX_LAP = 0x26

POINTER_SIZE = 4  # 32-bit PowerPC target


def read_ptr(address: int) -> int:
    return dme.read_word(address)


def hook_with_retry(timeout_s: float = 30.0) -> None:
    print("Hooking into Dolphin...")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        dme.hook()
        if dme.is_hooked():
            print("Hooked.")
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


def read_player_struct_addr(raceinfo_sinstance: int, player_index: int, verbose: bool) -> int:
    """Walks Raceinfo::sInstance -> players[player_index], printing each
    hop so a wrong region/address shows up as obvious garbage rather than
    a silently-wrong number."""
    raceinfo_ptr = read_ptr(raceinfo_sinstance)
    if verbose:
        print(f"  Raceinfo::sInstance -> 0x{raceinfo_ptr:08X}")
    if raceinfo_ptr == 0:
        raise RuntimeError(
            "Raceinfo::sInstance read as null — not in a race yet, or wrong address for your region."
        )

    players_ptr = read_ptr(raceinfo_ptr + RACEINFO_OFF_PLAYERS)
    if verbose:
        print(f"  Raceinfo.players -> 0x{players_ptr:08X}")

    player_ptr = read_ptr(players_ptr + player_index * POINTER_SIZE)
    if verbose:
        print(f"  Raceinfo.players[{player_index}] -> 0x{player_ptr:08X}")

    return player_ptr


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--player-index",
        type=int,
        default=0,
        help="Index into Raceinfo.players[] to read (0 = first local player). Default: 0.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Seconds between polls. Default: 1.0.",
    )
    parser.add_argument(
        "--raceinfo-address",
        type=lambda s: int(s, 16),
        default=RACEINFO_SINSTANCE_DEFAULT,
        metavar="0xHEX",
        help=(
            "Raceinfo::sInstance address for your region, as hex (e.g. 0x809bd730). "
            "Defaults to the PAL address, which is unverified for other regions — see "
            "the comment above RACEINFO_SINSTANCE_DEFAULT if you need to find yours."
        ),
    )
    args = parser.parse_args()

    hook_with_retry()

    print(f"\nUsing Raceinfo::sInstance = 0x{args.raceinfo_address:08X}")
    print("Resolving pointer chain once, verbosely, before polling:")
    player_addr = read_player_struct_addr(args.raceinfo_address, args.player_index, verbose=True)
    if player_addr == 0:
        print(
            "Player pointer read as null. Make sure a race is actually in progress "
            "(not the character-select or results screen) and try again.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"\nPolling every {args.interval}s. Ctrl+C to stop.\n")
    try:
        while True:
            if not dme.is_hooked():
                print("Lost hook (Dolphin closed or emulation stopped). Exiting.")
                break

            # Re-walk the chain each poll rather than caching player_addr —
            # Racedata/Raceinfo get torn down and rebuilt between races, so
            # a cached pointer from a previous race would go stale.
            player_addr = read_player_struct_addr(args.raceinfo_address, args.player_index, verbose=False)
            if player_addr == 0:
                print("(no active race)")
                time.sleep(args.interval)
                continue

            position = dme.read_byte(player_addr + PLAYER_OFF_POSITION)
            # currentLap is a uint16_t, not 4-byte-aligned relative to a word
            # read, so pull its 2 raw bytes directly (Wii is big-endian)
            # rather than shifting a read_word() result.
            current_lap = int.from_bytes(
                dme.read_bytes(player_addr + PLAYER_OFF_CURRENT_LAP, 2), "big"
            )
            max_lap = dme.read_byte(player_addr + PLAYER_OFF_MAX_LAP)
            print(f"position={position}  lap={current_lap}/{max_lap}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
