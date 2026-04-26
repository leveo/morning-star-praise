# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
"""Generate looping motion backgrounds from existing gradients via ffmpeg.

Run from the backend dir:
    python3 scripts/generate_motion_backgrounds.py

Each output is a 10-second 1920x1080 H.264 mp4 (no audio) created by applying
a slow ken-burns zoom over a static gradient. Run after
``generate_default_backgrounds.py`` so the source gradients exist.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.services.background_service import load_metadata, save_metadata  # noqa: E402

OUT_DIR = settings.BACKGROUNDS_DIR

DURATION_SEC = 10
FPS = 30

# (source jpg, output mp4, display name, motion style, tags)
# motion style → ffmpeg zoompan z expression
SOURCES: list[tuple[str, str, str, str, list[str]]] = [
    ("gradient_sky_blue.jpg",  "motion_sky_blue.mp4",  "Sky to Deep Blue (motion)",  "zoom_in",  ["motion", "dynamic", "color", "gradient", "blue", "sky", "cool"]),
    ("gradient_sunset.jpg",    "motion_sunset.mp4",    "Sunset Glow (motion)",       "zoom_out", ["motion", "dynamic", "color", "gradient", "sunset", "warm", "orange"]),
    ("gradient_ocean.jpg",     "motion_ocean.mp4",     "Ocean Depth (motion)",       "pan_lr",   ["motion", "dynamic", "color", "gradient", "blue", "ocean", "cool"]),
    ("gradient_aurora.jpg",    "motion_aurora.mp4",    "Aurora (motion)",            "zoom_in",  ["motion", "dynamic", "color", "gradient", "green", "purple", "cool"]),
    ("gradient_dawn.jpg",      "motion_dawn.mp4",      "Quiet Dawn (motion)",        "pan_tb",   ["motion", "dynamic", "color", "gradient", "warm", "dawn", "cream"]),
    ("gradient_twilight.jpg",  "motion_twilight.mp4",  "Twilight (motion)",          "zoom_in",  ["motion", "dynamic", "color", "gradient", "warm", "purple", "twilight"]),
    ("gradient_lavender.jpg",  "motion_lavender.mp4",  "Lavender Mist (motion)",     "zoom_out", ["motion", "dynamic", "color", "gradient", "purple", "lavender", "cool", "light"]),
    ("radial_navy_glow.jpg",   "motion_navy_glow.mp4", "Navy Glow (motion)",         "zoom_in",  ["motion", "dynamic", "color", "gradient", "radial", "blue", "dark"]),
    ("radial_amber_glow.jpg",  "motion_amber_glow.mp4","Amber Glow (motion)",        "zoom_out", ["motion", "dynamic", "color", "gradient", "radial", "warm", "amber"]),
    ("radial_purple_glow.jpg", "motion_purple_glow.mp4","Purple Glow (motion)",      "pan_lr",   ["motion", "dynamic", "color", "gradient", "radial", "purple", "dark"]),
]


def _zoom_expr(style: str) -> tuple[str, str, str]:
    """Return (z, x, y) expressions for the zoompan filter for a given style."""
    # zoompan internal `on` = output frame number, starts at 0
    # `iw`/`ih` are scaled-input dimensions; `iw/zoom`/`ih/zoom` give the visible window
    total = DURATION_SEC * FPS  # 300 frames
    if style == "zoom_in":
        z = f"1+0.20*on/{total}"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif style == "zoom_out":
        z = f"1.20-0.20*on/{total}"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif style == "pan_lr":
        z = "1.15"
        x = f"(iw-iw/zoom)*on/{total}"
        y = "ih/2-(ih/zoom/2)"
    elif style == "pan_tb":
        z = "1.15"
        x = "iw/2-(iw/zoom/2)"
        y = f"(ih-ih/zoom)*on/{total}"
    else:
        z = "1.0"
        x = "0"
        y = "0"
    return z, x, y


def _generate(src: Path, dst: Path, style: str) -> None:
    z, x, y = _zoom_expr(style)
    # Pre-scale 4x for zoom quality, then zoompan at 1920x1080
    vf = (
        "scale=7680x4320:flags=lanczos,"
        f"zoompan=z='{z}':x='{x}':y='{y}':d=1:s=1920x1080:fps={FPS}"
    )
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-t", str(DURATION_SEC),
        "-i", str(src),
        "-vf", vf,
        "-r", str(FPS),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-an",
        str(dst),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {src.name}:\n{result.stderr[-1500:]}")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta = load_metadata()
    count = 0

    for src_name, dst_name, display, style, tags in SOURCES:
        src = OUT_DIR / src_name
        if not src.exists():
            print(f"  ! missing source {src_name}, skipping")
            continue
        dst = OUT_DIR / dst_name
        print(f"  ~ {dst_name} ({style}) ... ", end="", flush=True)
        try:
            _generate(src, dst, style)
        except RuntimeError as exc:
            print(f"FAILED\n{exc}")
            continue
        size_kb = dst.stat().st_size // 1024
        meta[dst_name] = {
            "name": display,
            "tags": sorted(set(tags)),
            "media_type": "video",
        }
        count += 1
        print(f"ok ({size_kb} KB)")

    save_metadata(meta)
    print(f"\nGenerated {count} motion backgrounds → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
