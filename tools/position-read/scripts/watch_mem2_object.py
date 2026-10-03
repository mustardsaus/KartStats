#!/usr/bin/env python3
"""
raceinfoplayer_toplevel_scan.py's three real runs consistently found
RaceinfoPlayer+0x48 pointing to the SAME MEM2 address (0x9019A6F4) every
time -- the one standout among 8-9 valid pointer fields, since all the
others turned out to be explainable noise (sibling RaceinfoPlayer
addresses, repeated vtable pointers, a resource-handle object holding a
".szs" filename). Dumping 0x9019A6F4's own first 24 words showed it
looks like a real object (its own vtable-style pointer at +0x0) with
several MEM2 sub-pointers, including three consecutive identical ones
at +0x4/+0x8/+0xC (0x9019BE10) and two more at +0x20/+0x24.

Rather than guess what any of this means structurally, this applies the
one technique that's actually worked in this project every time it's
been tried: ground-truth diffing against a real item pickup. It watches
this specific small object (its own first 0x60 bytes) PLUS one hop
deeper into every valid pointer found inside it, and prints/logs any
word that changes -- a tiny, bounded region (a few dozen words, not
thousands), so there's no flooding risk, and the single question this
answers is simple: does ANYTHING in this neighborhood change when you
pick up or use an item?

Usage:
    python scripts/watch_mem2_object.py
Get into a race, let it print the watched addresses, then pick up and
use an item during the watch window.
"""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auto_track_race as atr  # noqa: E402

dme = atr.dme

OWN_DUMP_WORD_COUNT = 24  # same depth raceinfoplayer_toplevel_scan.py already used
SUB_DUMP_WORD_COUNT = 8   # how far into each one-hop-deeper sub-pointer to watch

WATCH_DURATION_S = 60.0
POLL_INTERVAL_S = 0.2

LOG_PATH = Path(__file__).resolve().parent.parent / "watch_mem2_object_log.txt"


def is_mem2_ptr(v) -> bool:
    """Only MEM2 sub-pointers get chased a hop deeper: a MEM1 hit inside
    this object (like its own vtable pointer at +0x0) points into
    static code/rodata, which never changes and would just waste watch
    slots -- same is_mem2_ptr-gated reasoning raceinfoplayer_toplevel_scan.py
    already uses for its nested dump."""
    return v is not None and 0x90000000 <= v < 0x94000000


def read_u32(addr: int):
    try:
        return dme.read_word(addr)
    except Exception:
        return None


def build_watch_list(mem2_base: int):
    """Returns a de-duplicated, labeled list of (addr, label) to watch:
    every word of mem2_base's own first OWN_DUMP_WORD_COUNT words, plus
    SUB_DUMP_WORD_COUNT more words for each distinct valid pointer found
    among them (one hop deeper, same idea as the nested dump in
    raceinfoplayer_toplevel_scan.py, just kept this time instead of only
    printed once)."""
    watch = []
    seen_addrs = set()

    def add(addr, label):
        if addr not in seen_addrs:
            seen_addrs.add(addr)
            watch.append((addr, label))

    own_values = {}
    for i in range(OWN_DUMP_WORD_COUNT):
        addr = mem2_base + i * 4
        add(addr, f"self+0x{i * 4:02X}")
        own_values[addr] = read_u32(addr)

    sub_targets = sorted({v for v in own_values.values() if is_mem2_ptr(v)})
    for target in sub_targets:
        for i in range(SUB_DUMP_WORD_COUNT):
            addr = target + i * 4
            add(addr, f"[0x{target:08X}]+0x{i * 4:02X}")

    return watch


def main() -> None:
    lines = [f"\n=== watch-mem2-object run at {time.strftime('%Y-%m-%d %H:%M:%S')} ==="]

    def emit(msg: str = "") -> None:
        print(msg)
        lines.append(msg)

    try:
        atr.hook_with_retry()
        raceinfo_addr = atr.try_fast_path()
        if raceinfo_addr is None:
            emit("Raceinfo fast path didn't check out -- are you actually in a race right now?")
            found, _t, _c, _nr = atr.find_raceinfo_candidates()
            if not found:
                emit("No Raceinfo candidate found.")
                return
            raceinfo_addr = found[0]
        emit(f"Raceinfo -> 0x{raceinfo_addr:08X}")

        rip_addr = atr.get_local_player_addr(raceinfo_addr)
        if rip_addr is None:
            emit("Couldn't resolve local RaceinfoPlayer -- can't anchor this scan.")
            return
        emit(f"Local player's RaceinfoPlayer -> 0x{rip_addr:08X}")

        mem2_base = read_u32(rip_addr + 0x48)
        if not is_mem2_ptr(mem2_base):
            emit(
                f"RaceinfoPlayer+0x48 = 0x{mem2_base if mem2_base is not None else 0:08X}, "
                "not the MEM2 pointer we expected -- bailing out rather than watching the wrong thing."
            )
            return
        emit(f"RaceinfoPlayer+0x48 -> 0x{mem2_base:08X}")

        watch_list = build_watch_list(mem2_base)
        emit(f"\nWatching {len(watch_list)} word(s) (its own fields + one hop into each sub-pointer) for {WATCH_DURATION_S:.0f}s:")
        for addr, label in watch_list:
            emit(f"  0x{addr:08X}  ({label})")
        emit("\nPick up and use an item now. Ctrl+C to stop early.\n")

        prev = {addr: read_u32(addr) for addr, _label in watch_list}
        label_by_addr = dict(watch_list)
        t_start = time.time()
        try:
            while time.time() - t_start < WATCH_DURATION_S:
                time.sleep(POLL_INTERVAL_S)
                if not dme.is_hooked():
                    emit("Lost hook to Dolphin. Stopping.")
                    break
                for addr, _label in watch_list:
                    cur = read_u32(addr)
                    if cur != prev[addr]:
                        elapsed = time.time() - t_start
                        line = (
                            f"[{elapsed:6.1f}s] 0x{addr:08X} ({label_by_addr[addr]}) changed: "
                            f"0x{prev[addr] if prev[addr] is not None else 0:08X} -> "
                            f"0x{cur if cur is not None else 0:08X}"
                        )
                        emit(line)
                        prev[addr] = cur
        except KeyboardInterrupt:
            emit("\nStopped.")
    finally:
        with open(LOG_PATH, "a") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\n(Appended this run's output to {LOG_PATH})")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
