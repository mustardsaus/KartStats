#!/usr/bin/env python3
"""
Resolves the held-item address via the REAL code path, confirmed live
through Dolphin's own debugger (Memory breakpoint -> Code view), not
guessed:

    lis   r3, 0x809C
    lwz   r3, -0x11E0(r3)      ; r3 = *(0x809BEE20)   -- a FIXED global slot
    lwz   r0, 0x0014(r3)       ; r0 = *(r3 + 0x14)
    add   r3, r0, r29          ; r3 = r0 + r29  (r29 == 0 for the local player)
    lwz   r0, 0x008C(r3)       ; <- the held-item read itself
    cmpwi r0, 20               ; the game's own "no item" check
    cmpwi r0, 10               ; the game's own Golden Mushroom check

At the breakpoint hit, the Registers panel showed r3 == r0 == 0x8124a328
with r29 == 0, exactly matching the per-race heap address (0x8124a3b4 =
0x8124a328 + 0x8C) independently found via Dolphin's Cheat Search in the
same session. The two cmpwi instructions right after the read -- against
20 (the idle sentinel already in auto_track_race.py's ITEM_NAMES as
"(no item)") and 10 (Golden Mushroom, the item actually held when this
breakpoint was set) -- are the game itself confirming this is the right
field, not a coincidence.

Every address this project has chased before lived on the heap and moved
every race, forcing a fresh scan each time. 0x809BEE20 is different: it's
loaded via `lis`/an immediate offset, i.e. baked into the executable's own
code, not computed at runtime -- a real static global. If that holds up,
this chain should keep resolving the right address across brand new races
with ZERO re-scanning. That is the one thing this script exists to prove
before anything gets wired into the real tracker -- run it, confirm the
value matches what you're holding, then start a FRESH race and confirm it
still tracks correctly without touching this script again.

Usage:
    python scripts/resolve_held_item_chain.py
Get into a race and watch the value update as you pick up / use items.
Ctrl+C to stop.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

GLOBAL_PTR_SLOT = 0x809BEE20
ARRAY_PTR_OFFSET = 0x14
HELD_ITEM_OFFSET = 0x8C

POLL_INTERVAL_S = 0.25
LOG_PATH = Path(__file__).resolve().parent.parent / "resolve_held_item_chain_log.txt"


def is_valid_ptr(v) -> bool:
    return v is not None and (
        (0x80000000 <= v < 0x81800000) or (0x90000000 <= v < 0x94000000)
    )


def resolve_chain():
    """Walks the confirmed static-global -> array-ptr -> held-item chain.
    Returns a dict with every hop's value so a dead link anywhere along
    the way is distinguishable from a live chain reading a weird value,
    rather than collapsing everything into a single None."""
    base = atr.read_ptr(GLOBAL_PTR_SLOT)
    if not is_valid_ptr(base):
        return {"base": base, "array_ptr": None, "held_item_addr": None, "item_value": None}

    array_ptr = atr.read_ptr(base + ARRAY_PTR_OFFSET)
    if not is_valid_ptr(array_ptr):
        return {"base": base, "array_ptr": array_ptr, "held_item_addr": None, "item_value": None}

    held_item_addr = array_ptr + HELD_ITEM_OFFSET
    item_value = atr.read_ptr(held_item_addr)
    return {
        "base": base,
        "array_ptr": array_ptr,
        "held_item_addr": held_item_addr,
        "item_value": item_value,
    }


def describe_item_value(v):
    if v is None:
        return "?"
    if v == 0x14:
        return "(no item)"
    return atr.item_name(v)


def main() -> None:
    lines = [f"\n=== resolve-held-item-chain run at {time.strftime('%Y-%m-%d %H:%M:%S')} ==="]

    def emit(msg: str = "") -> None:
        print(msg)
        lines.append(msg)

    try:
        atr.hook_with_retry()

        chain = resolve_chain()
        if chain["held_item_addr"] is None:
            emit(
                f"Chain didn't resolve: global slot 0x{GLOBAL_PTR_SLOT:08X} -> "
                f"base={chain['base']!r}, array_ptr={chain['array_ptr']!r}. "
                "Is a game actually loaded right now?"
            )
            return

        emit(f"Global slot 0x{GLOBAL_PTR_SLOT:08X} -> base 0x{chain['base']:08X}")
        emit(f"base + 0x{ARRAY_PTR_OFFSET:02X} -> array/player ptr 0x{chain['array_ptr']:08X}")
        emit(f"held-item address -> 0x{chain['held_item_addr']:08X}")
        emit(f"\nCurrent value: {chain['item_value']} ({describe_item_value(chain['item_value'])})")
        emit(
            "\nWatching this address. Pick up / use items -- and once you've "
            "seen it track correctly, start a FRESH race and confirm it keeps "
            "working without restarting this script. Ctrl+C to stop.\n"
        )

        prev_addr = chain["held_item_addr"]
        prev_value = chain["item_value"]
        while True:
            time.sleep(POLL_INTERVAL_S)
            if not dme.is_hooked():
                emit("Lost hook to Dolphin. Stopping.")
                break

            chain = resolve_chain()
            if chain["held_item_addr"] is None:
                emit("Chain broke (game likely unloaded / menu). Stopping.")
                break

            if chain["held_item_addr"] != prev_addr:
                emit(
                    f"[race change] held-item address moved: 0x{prev_addr:08X} -> "
                    f"0x{chain['held_item_addr']:08X} (this is expected if you started "
                    "a new race -- the CHAIN re-resolved it automatically)"
                )
                prev_addr = chain["held_item_addr"]

            if chain["item_value"] != prev_value:
                emit(f"  -> {describe_item_value(chain['item_value'])} (value {chain['item_value']})")
                prev_value = chain["item_value"]
    except KeyboardInterrupt:
        emit("\nStopped.")
    finally:
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\n(Appended this run's output to {LOG_PATH})")


if __name__ == "__main__":
    main()
