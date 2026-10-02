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

## Step 1 — confirm your game's region

The addresses below (`RACEINFO_SINSTANCE`, `RACEDATA_SINSTANCE`) are the
**PAL** addresses documented by mkw-structures. If your disc/ISO is
NTSC-U (US) or NTSC-J (Japan), these specific numbers will be wrong —
the struct *layout* (the `+0x20` offset for `position`, etc.) stays the
same across regions, only the static pointer addresses shift. Check your
copy's region before trusting any read (Dolphin's game properties panel
shows the Game ID — `RMCP01` is PAL, `RMCE01` is NTSC-U, `RMCJ01` is
NTSC-J) and swap in the right address if you're not on PAL.

## Step 2 — run the probe

With Dolphin running and a single-player race actually loaded (not just
the menu):

```
python scripts/probe_position.py
```

It hooks into Dolphin, prints the raw pointer value at each hop (so a
bad address or wrong region shows up immediately as garbage rather than
a silent wrong number), then polls and prints position/lap once a
second. Ctrl+C to stop.

The trial succeeds if the printed position actually tracks your real
position as you drive (changes to 2 when you get passed, back to 1 when
you repass, etc.) — not just that it prints *a* number.

## What's deliberately NOT built yet

- No region auto-detection — you confirm/set it once by hand.
- No write to the KartStats app — standalone local trial, same as
  `item-recognition/`.
- No event-driven "race just finished" trigger yet — Step 2 just polls
  and prints; turning a polled value into a one-shot "race complete,
  final position N" event is the next step once raw reads are trusted.
- No multiplayer / split-screen handling (reading player 2's struct
  instead of / in addition to player 1's).

## Files

```
tools/position-read/
├── README.md
├── requirements.txt
└── scripts/
    └── probe_position.py   # hooks Dolphin, reads + prints live position
```
