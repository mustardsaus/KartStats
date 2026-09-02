#!/usr/bin/env python3
"""
Walk a video, watch one or more fixed item-slot HUD boxes, and log an
event (+ save a crop) every time a box's contents settle into a new,
visibly-different icon. This is deliberately NOT trying to name the item
yet (no reference sprite matching) — it's testing whether we can reliably
find the "roulette stopped, icon is stable" moment and get a clean crop
out of it, which is the harder and more fundamental question.

How it decides "settled":
  For each sampled frame, each box's crop is compared (grayscale, blurred,
  resized to a fixed small size) against that box's previous sampled
  crop. If the mean absolute pixel difference stays below
  --diff-threshold for --stability-frames consecutive samples in a row,
  the box is considered "settled" as of that frame.

Every unsettled -> settled transition is logged as one event (edge
triggered, so a long continuous hold of one item still only logs once).
This deliberately does NOT try to skip a settle just because it looks
like the same icon as an earlier event — picking up the same item type
twice in one race is two real, separate events, not a duplicate. It also
means an "idle / empty" box will get logged as a settle too (there's no
reference for what idle looks like yet); that's fine for this trial —
skim the crops and it's obvious by eye which ones are a real item vs. an
empty slot. Filtering those out automatically is a refinement for later,
once we're past proving the crops themselves are clean.

Example:
    python detect_item_events.py video.mp4 \\
        --box 1050,40,140,140 --label P1 \\
        --box 1050,600,140,140 --label P2 \\
        --out-dir output
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass, field

import cv2
import numpy as np

COMPARE_SIZE = (64, 64)  # crops are resized to this before diffing — robust to a few px of box slop


@dataclass
class Box:
    label: str
    x: int
    y: int
    w: int
    h: int

    def crop(self, frame):
        return frame[self.y : self.y + self.h, self.x : self.x + self.w]


@dataclass
class BoxState:
    stable_run: int = 0
    prev_compare: np.ndarray | None = None  # last sampled compare-frame, for stability check
    was_settled: bool = False
    event_count: int = 0


def parse_box(spec: str, label: str) -> Box:
    try:
        x, y, w, h = (int(v) for v in spec.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(f"--box must be x,y,w,h (got {spec!r})")
    return Box(label=label, x=x, y=y, w=w, h=h)


def to_compare(crop) -> np.ndarray:
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    return cv2.resize(gray, COMPARE_SIZE, interpolation=cv2.INTER_AREA)


def mean_abs_diff(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(np.abs(a.astype(np.int16) - b.astype(np.int16))))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", help="Path to the video file")
    parser.add_argument(
        "--box",
        action="append",
        required=True,
        dest="boxes",
        metavar="x,y,w,h",
        help="Item-slot crop box, in pixel coordinates from extract_frame.py --grid. Repeatable.",
    )
    parser.add_argument(
        "--label",
        action="append",
        required=True,
        dest="labels",
        help="Label for the matching --box (e.g. P1). Repeatable, must match --box count.",
    )
    parser.add_argument("--out-dir", default="output", help="Where to write events.json and crop PNGs")
    parser.add_argument("--start", type=float, default=0.0, help="Start time in seconds (default: 0)")
    parser.add_argument("--end", type=float, default=None, help="End time in seconds (default: whole video)")
    parser.add_argument(
        "--sample-every",
        type=int,
        default=2,
        help="Process every Nth frame (default: 2 — halves work, fine for ~30fps source; use 1 for max sensitivity)",
    )
    parser.add_argument(
        "--stability-frames",
        type=int,
        default=8,
        help="Consecutive stable samples required before a box counts as 'settled' (default: 8)",
    )
    parser.add_argument(
        "--diff-threshold",
        type=float,
        default=6.0,
        help="Max mean abs pixel diff (0-255 scale) between consecutive samples to count as 'stable' (default: 6.0)",
    )
    args = parser.parse_args()

    if len(args.boxes) != len(args.labels):
        print("error: --box and --label must be given the same number of times", file=sys.stderr)
        return 1

    boxes = [parse_box(spec, label) for spec, label in zip(args.boxes, args.labels)]

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"error: could not open video: {args.video}", file=sys.stderr)
        return 1

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    for b in boxes:
        if b.x < 0 or b.y < 0 or b.x + b.w > frame_w or b.y + b.h > frame_h:
            print(
                f"error: box '{b.label}' ({b.x},{b.y},{b.w},{b.h}) falls outside the "
                f"{frame_w}x{frame_h} frame — re-check coordinates with extract_frame.py --grid",
                file=sys.stderr,
            )
            return 1

    os.makedirs(args.out_dir, exist_ok=True)

    start_frame = int(args.start * fps)
    end_frame = int(args.end * fps) if args.end is not None else total_frames
    if start_frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    states = {b.label: BoxState() for b in boxes}
    events = []
    frame_index = start_frame
    processed = 0

    print(
        f"video: {frame_w}x{frame_h} @ {fps:.2f}fps, {total_frames} frames "
        f"({total_frames / fps:.1f}s) — processing frames {start_frame}..{end_frame} every {args.sample_every}"
    )

    while True:
        ok, frame = cap.read()
        if not ok or frame_index >= end_frame:
            break

        if (frame_index - start_frame) % args.sample_every == 0:
            timestamp = frame_index / fps
            for b in boxes:
                state = states[b.label]
                compare = to_compare(b.crop(frame))

                if state.prev_compare is not None:
                    diff = mean_abs_diff(compare, state.prev_compare)
                    if diff < args.diff_threshold:
                        state.stable_run += 1
                    else:
                        state.stable_run = 0
                state.prev_compare = compare

                is_settled_now = state.stable_run >= args.stability_frames

                if is_settled_now and not state.was_settled:
                    state.event_count += 1
                    crop_filename = f"{b.label}_{state.event_count:03d}_frame{frame_index:06d}_{timestamp:.2f}s.png"
                    cv2.imwrite(os.path.join(args.out_dir, crop_filename), b.crop(frame))
                    events.append(
                        {
                            "label": b.label,
                            "event_index": state.event_count,
                            "frame": frame_index,
                            "timestamp_s": round(timestamp, 2),
                            "crop_file": crop_filename,
                        }
                    )
                    print(f"  [{timestamp:7.2f}s] {b.label} event #{state.event_count} -> {crop_filename}")

                state.was_settled = is_settled_now

            processed += 1

        frame_index += 1

    cap.release()

    events.sort(key=lambda e: e["frame"])
    summary = {
        "video": os.path.abspath(args.video),
        "fps": fps,
        "frame_size": [frame_w, frame_h],
        "params": {
            "sample_every": args.sample_every,
            "stability_frames": args.stability_frames,
            "diff_threshold": args.diff_threshold,
        },
        "boxes": [{"label": b.label, "x": b.x, "y": b.y, "w": b.w, "h": b.h} for b in boxes],
        "events": events,
    }
    events_path = os.path.join(args.out_dir, "events.json")
    with open(events_path, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\nprocessed {processed} sampled frames, logged {len(events)} event(s) total")
    for b in boxes:
        print(f"  {b.label}: {states[b.label].event_count} event(s)")
    print(f"wrote {events_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
