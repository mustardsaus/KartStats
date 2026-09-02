# Item Recognition — Trial

Goal of this trial: prove that we can point a script at a video of Mario
Kart Wii War Mode footage and reliably pull out clean, cropped images of
each player's item-slot HUD icon at the moment it "settles" after the
roulette spin — without yet needing a library of reference sprites to
name the item. If that works, naming the item (template matching against
a small reference set) is the easy part; getting a clean, correctly-timed
crop is the part actually worth testing first.

This is plain OpenCV reading a video file frame-by-frame
(`cv2.VideoCapture`). It doesn't care whether that video file is a phone
recording of a TV, a capture-card feed, or a screen recording of a video
playing back on a laptop — a video file is a video file, so this is the
right thing to test first regardless of which capture method you end up
using long-term. There's no need for a separate "record my screen while
the video plays" layer; just point the script at the Wii footage file
directly (whatever format it's in — mp4, mov, mkv, whatever your screen
recording or download produced).

## Setup (on your laptop)

```
cd tools/item-recognition
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Optional — sanity-check the setup before touching real footage

`scripts/_make_test_video.py` generates a synthetic clip (solid color
blocks standing in for item icons, with noise in between simulating the
roulette spin) so you can confirm your Python/OpenCV install and the
scripts themselves work before burning time calibrating against real
footage:

```
python scripts/_make_test_video.py /tmp/test_clip.mp4
python scripts/detect_item_events.py /tmp/test_clip.mp4 --box 40,40,120,120 --label P1 --out-dir /tmp/test_output
```

You should see 5 events logged (idle, "icon A", "icon B", "icon A" again,
idle) — this already exercises the exact logic that'll run on your real
recording, just against a synthetic box instead of a Wii HUD.

## Step 1 — find the item-box coordinates

Pull one frame from a moment where you can clearly see the item HUD icon,
with a coordinate grid overlaid so you can eyeball the crop box:

```
python scripts/extract_frame.py path/to/your_video.mp4 --time 12.5 --grid -o frame.png
```

Open `frame.png`. The grid lines are labeled every 50px. Note the
top-left corner and size of the box around just the item icon (not the
whole HUD panel) — you want it tight, e.g. `x=1050,y=40,w=140,h=140`.

If it's a two-player split-screen recording, do this once per player's
HUD (they're usually mirrored, e.g. same box on the other half of the
frame).

## Step 2 — detect item "settle" events

```
python scripts/detect_item_events.py path/to/your_video.mp4 \
  --box 1050,40,140,140 --label P1 \
  --box 1050,600,140,140 --label P2 \
  --out-dir output
```

This walks the video, watches each box for the roulette animation to stop
moving (frame-to-frame stability), and every time it settles — spin
finished, icon holding steady — saves a cropped PNG and logs an event.
(It doesn't try to skip events that look like an earlier icon — picking
up the same item twice in a race is two real events, not a dupe. An
idle/empty box will also log as a "settle"; that's fine to eyeball and
ignore for this trial.) Output:

- `output/events.json` — one entry per detected event: timestamp, frame
  number, player label, and the saved crop filename.
- `output/*.png` — the actual cropped icon at each settle moment.

Look through the PNGs. The trial succeeds if:
1. Events roughly line up with when you remember each player picking up
   an item.
2. The crops are clean (not mid-spin blur, not cut off).
3. There aren't a flood of duplicate/near-duplicate events for one item
   held over several seconds (some near-duplicates are fine and easy to
   collapse later — a total flood means the thresholds need tuning).

If the coordinates are off, or results look noisy, re-run Step 1 to
double check the box, and tune `--diff-threshold` / `--change-threshold`
/ `--stability-frames` in Step 2 (run `--help` for what each does).

## What's deliberately NOT built yet

- No item *naming* (this doesn't know a Mushroom crop from a Banana
  crop yet) — that's template matching against a reference set built
  from your own footage's crops, once we know clean crops are possible.
- No integration with the War Mode data model / app — this is a
  standalone local trial, doesn't touch the deployed site.
- No live/real-time processing — this reads a saved video file, matching
  how you enter race results today (after the race, not during it).

## Files

```
tools/item-recognition/
├── README.md
├── requirements.txt
├── scripts/
│   ├── extract_frame.py       # pull one frame (+ optional coord grid) for calibration
│   └── detect_item_events.py  # main trial: stable-icon-crop detection over a whole video
└── output/                    # detect_item_events.py writes here (gitignored)
```
