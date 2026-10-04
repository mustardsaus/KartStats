"""Run this DURING a race (or on the track-intro screen). Prints why
auto_track_race.py can't identify the track. Read-only."""
import dolphin_memory_engine as dme
import auto_track_race as a

dme.hook()
base = a.read_ptr(a.RACECONFIG_SINSTANCE_ADDR)
print("RaceConfig base ptr:", hex(base) if base is not None else None)
if base is not None:
    settings = base + a.RACECONFIG_TO_SETTINGS_OFFSET
    print("settings addr:", hex(settings))
    for name, off in (("course_id", a.RACEDATA_OFF_COURSE_ID), ("lap_count", a.RACEDATA_OFF_LAP_COUNT)):
        v = a.read_ptr(settings + off)
        print(f"  {name} @+0x{off:X}:", None if v is None else f"0x{v:X}")
print("get_racedata_settings_addr():", a.get_racedata_settings_addr())
found = []
for start, end in a.REGIONS:
    found.extend(a.scan_region_for_racedata_settings(start, end))
print("blind scan matches:", [hex(x) for x in found])
for x in found[:6]:
    print("  match", hex(x), "course_id=", a.read_ptr(x + a.RACEDATA_OFF_COURSE_ID))
print("find_course_id():", a.find_course_id())
