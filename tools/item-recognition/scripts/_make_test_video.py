#!/usr/bin/env python3
"""
Dev-only helper (not part of the deliverable) — generates a synthetic
test clip so the pipeline can be smoke-tested without real Wii footage.
Simulates one item-slot box: idle (grey) -> spin (noise) -> settled on
"icon A" -> spin -> settled on "icon B" -> spin -> settled on "icon A"
again (to prove repeat pickups of the same item both get logged).
"""
import sys

import cv2
import numpy as np

W, H, FPS = 640, 480, 30
BOX = (40, 40, 120, 120)  # x, y, w, h

def solid(color):
    x, y, w, h = BOX
    frame = np.full((H, W, 3), 30, dtype=np.uint8)
    frame[y : y + h, x : x + w] = color
    return frame

def spin_frame(rng):
    x, y, w, h = BOX
    frame = np.full((H, W, 3), 30, dtype=np.uint8)
    frame[y : y + h, x : x + w] = rng.integers(0, 255, size=(h, w, 3), dtype=np.uint8)
    return frame

def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "test_clip.mp4"
    rng = np.random.default_rng(42)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))

    idle = (90, 90, 90)
    icon_a = (40, 180, 40)   # "green shell" stand-in
    icon_b = (40, 40, 200)   # "red shell" stand-in

    def hold(color, seconds):
        for _ in range(int(seconds * FPS)):
            writer.write(solid(color))

    def spin(seconds):
        for _ in range(int(seconds * FPS)):
            writer.write(spin_frame(rng))

    hold(idle, 1.5)
    spin(1.0)
    hold(icon_a, 2.5)   # event 1: icon A
    spin(1.0)
    hold(icon_b, 2.5)   # event 2: icon B
    spin(1.0)
    hold(icon_a, 2.5)   # event 3: icon A again (repeat pickup, should still log)
    hold(idle, 1.0)

    writer.release()
    print(f"wrote {out_path}")

if __name__ == "__main__":
    main()
