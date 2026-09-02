#!/usr/bin/env python3
"""
Pull a single frame out of a video, optionally with a coordinate grid
overlaid, so you can eyeball where the item-slot HUD icon sits and figure
out the crop box to feed into detect_item_events.py.

Examples:
    # by timestamp (seconds)
    python extract_frame.py video.mp4 --time 12.5 --grid -o frame.png

    # by exact frame number
    python extract_frame.py video.mp4 --frame 375 --grid -o frame.png
"""

import argparse
import sys

import cv2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video", help="Path to the video file")
    when = parser.add_mutually_exclusive_group(required=True)
    when.add_argument("--time", type=float, help="Timestamp in seconds to grab")
    when.add_argument("--frame", type=int, help="Exact frame number to grab")
    parser.add_argument("-o", "--out", default="frame.png", help="Output PNG path (default: frame.png)")
    parser.add_argument(
        "--grid",
        action="store_true",
        help="Overlay a 50px coordinate grid with axis labels, to help you read off box coordinates",
    )
    parser.add_argument(
        "--grid-spacing",
        type=int,
        default=50,
        help="Grid line spacing in pixels (default: 50)",
    )
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"error: could not open video: {args.video}", file=sys.stderr)
        return 1

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if args.time is not None:
        frame_index = int(round(args.time * fps))
    else:
        frame_index = args.frame

    if total_frames > 0 and frame_index >= total_frames:
        print(
            f"error: frame {frame_index} is past the end of the video "
            f"({total_frames} frames, {total_frames / fps:.1f}s at {fps:.2f}fps)",
            file=sys.stderr,
        )
        return 1

    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None:
        print(f"error: could not read frame {frame_index} from {args.video}", file=sys.stderr)
        return 1

    if args.grid:
        frame = draw_grid(frame, args.grid_spacing)

    cv2.imwrite(args.out, frame)
    h, w = frame.shape[:2]
    print(f"wrote {args.out} ({w}x{h}), frame {frame_index} (~{frame_index / fps:.2f}s @ {fps:.2f}fps)")
    return 0


def draw_grid(frame, spacing: int):
    out = frame.copy()
    h, w = out.shape[:2]
    line_color = (0, 255, 0)
    text_color = (0, 255, 0)
    font = cv2.FONT_HERSHEY_SIMPLEX

    for x in range(0, w, spacing):
        cv2.line(out, (x, 0), (x, h), line_color, 1, cv2.LINE_AA)
        cv2.putText(out, str(x), (x + 2, 14), font, 0.4, text_color, 1, cv2.LINE_AA)
    for y in range(0, h, spacing):
        cv2.line(out, (0, y), (w, y), line_color, 1, cv2.LINE_AA)
        cv2.putText(out, str(y), (2, y + 12), font, 0.4, text_color, 1, cv2.LINE_AA)

    return out


if __name__ == "__main__":
    sys.exit(main())
