# Position Read — Trial

Goal of this trial: prove that Mario Kart Wii's finishing position can be
read directly out of Dolphin's emulated RAM while a race is in progress,
instead of typed in after the fact. This is the "data read" path from the
automation roadmap (see the `dolphin-automation-roadmap` doc in the
MarioKart project) — reading memory rather than reading pixels, the same
split-purpose relationship `item-recognition/` has to video frames.

Single-player only for now, same as `item-recognition/`: prove the read
works before any multiplayer correlation or app-wiring gets built on top
of it.

## Why memory instead of video/screen

Mario Kart Wii's memory layout is already reverse-engineered by the
TAS/mod community — specifically [SeekyCt/mkw-structures](https://github.com/SeekyCt/mkw-structures),
whose `raceinfo.h` documents a `RaceinfoPlayer` struct with a `position`
field already being tracked live by the game itself. Reading that beats
OCR on a results screen: it's exact (no text-recognition errors), updates
every frame instead of only at the end, and the same struct carries lap
number and race-completion fraction for free if we want them later.

**Important correction from earlier planning:** mainline Dolphin does
**not** ship a built-in scripting console (no Tools → Scripting menu) —
that was wrong in the original roadmap doc, now fixed. Live Lua/Python
scripting only exists in unofficial forks (e.g. `SwareJonge/Dolphin-Lua-Core`).
Rather than switching off official Dolphin, this trial uses
[`dolphin-memory-engine`](https://github.com/aldelaro5/dolphin-memory-engine)
(via its Python bindings, [`py-dolphin-memory-engine`](https://github.com/randovania/py-dolphin-memory-engine)) —
a separate process that attaches to Dolphin's memory the same way Cheat
Engine attaches to a game, while you keep using your normal, unmodified,
official Dolphin build.

## One-time setup (on your Mac, not through Claude)

This step touches Keychain Access and code-signs your actual Dolphin.app,
so do this part yourself in your own Terminal rather than through me —
it's exactly the kind of system/security-adjacent step best done
directly by you.

1. **Create a self-signed code-signing certificate** (one-time):
   Keychain Access → menu `Keychain Access` → `Certificate Assistant` →
   `Create a Certificate...` → name it (e.g. `dme-cert`), Identity Type
   `Self Signed Root`, Certificate Type `Code Signing`, check
   `Let me override defaults`, keep clicking Continue until `Specify a
   Location For The Certificate`, set Keychain to `System`, finish.
   (Full steps: [aldelaro5/dolphin-memory-engine#macos-code-signing](https://github.com/aldelaro5/dolphin-memory-engine#macos-code-signing).)

2. **Re-sign Dolphin** using that cert — grab `MacSetup.sh` from the
   `dolphin-memory-engine` repo's `Tools/` directory and run it:
   ```
   sh ./MacSetup.sh
   ```
   You'll need to redo this after every Dolphin update.

3. **Install the Python bindings:**
   ```
   cd tools/position-read
   python3 -m venv venv
   source venv/bin/activate      # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

## Autonomous tracking (no manual scanning, no region address needed)

`scripts/auto_track_race.py` supersedes the manual Cheat-Engine-style
scanning in Step 1 below for actually playing. Several earlier versions of
this script tried to find "a live player struct" by scanning for numbers
that merely looked plausible — that approach went through a lot of live
debugging and kept finding new ways to be wrong (up to 12 racers look
identical in memory, so it could lock onto a CPU opponent; "race over" was
only ever a guess from the lap counter, never an actual flag).

The current version instead uses the real fields raceinfo.h documents:
`Raceinfo` (the *one* global race-state object, not a per-racer struct) has
a `stage` field — 0 = intro camera, 1 = countdown, 2 = race — and each
`RaceinfoPlayer` has a `stateFlags` bitfield where bit `0x20` means
"finishing the race". That's a real finish signal, not an inference from
the lap counter. Because `Raceinfo` is a singleton, it can be found with a
far stricter fingerprint than any player struct (several pointer fields
that must all independently resolve into valid RAM at once) and only has
to be found **once per Dolphin session** — after that it's a plain pointer
chase (`Raceinfo → players[0] → position/stateFlags`), the same design
`probe_position.py` always intended, just with the real address found
automatically instead of guessed. No manual "race started"/"race ended"
signal needed, and no confirmed `Raceinfo::sInstance` address needed either
— the script finds it itself on first run.

**This must run with your Mac's own, native Python** — it attaches to
Dolphin's actual process memory, which only works from something really
running on your Mac (not through any sandboxed or remote shell). One-time
setup, in your own Terminal:

```
cd tools/position-read
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Then, with Dolphin open and re-signed (see one-time setup above):

```
python scripts/auto_track_race.py
```

Leave it running in that terminal while you play — it prints each race's
final position as soon as that race ends, with no further input.

This still uses the same struct offsets from mkw-structures as
`probe_position.py` below, just found live instead of via a static
address, so Step 1/Step 2 (and the region-address problem) remain here as
the fallback/manual-verification path if the autonomous scan ever comes
up empty or locks onto something clearly wrong.

## Step 1 — confirm your game's region

The script's default address is the **PAL** `Raceinfo::sInstance`
documented by mkw-structures — the only region with a publicly
documented value as of writing. Known region in this repo: **NTSC-U
(`RMCE01`)**, confirmed from Dolphin's game list. The PAL default is
**not** verified correct for NTSC-U — the struct *layout* (the `+0x20`
offset for `position`, etc.) is the same across regions, only the
static `sInstance` address shifts, and the per-region address maps
checked while building this didn't happen to cover that specific
symbol for NTSC-U.

Two ways to get the real address, cheapest first:

1. Just run Step 2 below as-is and read the verbose pointer-hop output.
   If it's wrong you'll see `0x00000000` or something way outside the
   `0x80000000`–`0x81800000` range — that tells you definitively the
   default doesn't work for NTSC-U, no guessing required.
2. If so, use the [Dolphin Memory Engine](https://github.com/aldelaro5/dolphin-memory-engine/releases)
   GUI app (a separate download from the Python library above) and its
   Cheat Engine-style scanner: start a race, your position is 1st —
   search "Exact Value", type Byte, value `1`. Let an opponent pass you
   (position becomes 2) — search again for `2`. Repeat once or twice
   more until one address remains. Pass it to the script once found —
   see `--raceinfo-address` below.

## Step 2 — run the probe

With Dolphin running and a single-player race actually loaded (not just
the menu):

```
python scripts/probe_position.py
```

If you've confirmed a different address for your region (see Step 1):

```
python scripts/probe_position.py --raceinfo-address 0xYOURADDRESS
```

It hooks into Dolphin, prints the raw pointer value at each hop (so a
bad address or wrong region shows up immediately as garbage rather than
a silent wrong number), then polls and prints position/lap once a
second. Ctrl+C to stop.

The trial succeeds if the printed position actually tracks your real
position as you drive (changes to 2 when you get passed, back to 1 when
you repass, etc.) — not just that it prints *a* number.

## KartStats live bridge (Immersive War Mode)

`scripts/auto_track_race.py` can now POST what it reads straight into
KartStats' Immersive War Mode instead of just printing to this terminal.
It's entirely opt-in: run the script with no flags and nothing about it
changes from before this existed.

To enable it, start a season in Immersive mode in the app (War Mode →
Immersive), copy the season id shown in its header, then:

```
python scripts/auto_track_race.py \
  --season-id <paste the season id> \
  --token dev-local-telemetry-token
```

(`--token` must match the running app's `TELEMETRY_BRIDGE_TOKEN` env var
— `dev-local-telemetry-token` is what `.env.local` has it set to for
local dev. `--api-url` defaults to `http://localhost:3000/api/telemetry/events`
and only needs overriding if the app isn't running on the default port.
All three flags also read from `KARTSTATS_SEASON_ID` / `KARTSTATS_BRIDGE_TOKEN`
/ `KARTSTATS_API_URL` env vars, so you don't have to retype them every
race if you'd rather `export` them once per terminal session.)

With the bridge enabled it also finds the second player's slot (2P
split-screen) and sends both players' circuit/position/lap/finish events
— see `kartstats_bridge.py` for the wire format and `_find_other_player_addr`'s
docstring for how "which raw slot is which human" is resolved (short
version: it isn't, here — that's exactly what KartStats' own Player
Assignment step, with its swap-players escape hatch, is for).

**Not wired up: item/power-up events.** This script's own git history for
item detection (ITEMHandler scanning, pointer-chasing, several reverts)
shows that signal isn't confirmed reliable the way position/lap/course
data already is. Sending unconfirmed reads into KartStats' permanent
power-up stats would quietly corrupt Tomfoolery Tales with noise that
looks like real data — wire that up once the item-detection research
above settles on one trusted signal, not before.

## What's deliberately NOT built yet

- No region auto-detection — you confirm/set it once by hand.
- Item/power-up events aren't sent to KartStats yet — see above.

## Files

```
tools/position-read/
├── README.md
├── requirements.txt
└── scripts/
    ├── auto_track_race.py  # no manual scanning/address needed; prints each race's final position
    └── probe_position.py   # manual/fallback: hooks Dolphin, reads + prints live position
```
