# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Generate landscape motion backgrounds via ffmpeg ken-burns on real photos.

Run from the backend dir:
    python3 scripts/generate_landscape_motion_backgrounds.py

For each existing landscape photo (``wm_*.jpg``), applies a slow ken-burns
zoom + pan to produce a 10-second 1920x1080 H.264 mp4. The cycling motion
styles give visual variety. Source tags carry over plus motion / dynamic.

Drop-in replacement for not-having-real-stock-video — the cinematic ken-burns
look on a real photograph is the same technique ProPresenter and worship-video
tools use heavily.
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
TOTAL_FRAMES = DURATION_SEC * FPS

# Cycle these 6 styles across the photos for variety
STYLES = ["zoom_in_slow", "zoom_in_fast", "zoom_out", "pan_lr", "pan_rl", "pan_tb"]


def _zoom_expr(style: str) -> tuple[str, str, str]:
    if style == "zoom_in_slow":
        return (
            f"1+0.18*on/{TOTAL_FRAMES}",
            "iw/2-(iw/zoom/2)",
            "ih/2-(ih/zoom/2)",
        )
    if style == "zoom_in_fast":
        return (
            f"1+0.30*on/{TOTAL_FRAMES}",
            "iw/2-(iw/zoom/2)",
            "ih/2-(ih/zoom/2)",
        )
    if style == "zoom_out":
        return (
            f"1.25-0.20*on/{TOTAL_FRAMES}",
            "iw/2-(iw/zoom/2)",
            "ih/2-(ih/zoom/2)",
        )
    if style == "pan_lr":
        return (
            "1.15",
            f"(iw-iw/zoom)*on/{TOTAL_FRAMES}",
            "ih/2-(ih/zoom/2)",
        )
    if style == "pan_rl":
        return (
            "1.15",
            f"(iw-iw/zoom)*(1-on/{TOTAL_FRAMES})",
            "ih/2-(ih/zoom/2)",
        )
    if style == "pan_tb":
        return (
            "1.15",
            "iw/2-(iw/zoom/2)",
            f"(ih-ih/zoom)*on/{TOTAL_FRAMES}",
        )
    return "1.0", "0", "0"


def _generate(src: Path, dst: Path, style: str) -> None:
    z, x, y = _zoom_expr(style)
    vf = (
        "scale=7680x4320:flags=lanczos,"
        f"zoompan=z='{z}':x='{x}':y='{y}':d=1:s=1920x1080:fps={FPS}"
    )
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-framerate", str(FPS),
        "-t", str(DURATION_SEC),
        "-i", str(src),
        "-vf", vf,
        "-r", str(FPS),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
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

    # Collect landscape photo sources
    photos = sorted(p for p in OUT_DIR.glob("wm_*.jpg"))
    if not photos:
        print("No wm_*.jpg landscape photos found. Run fetch_landscape_backgrounds.py first.")
        return 1

    print(f"Processing {len(photos)} landscape photo(s)…")
    count = 0
    for i, src in enumerate(photos):
        style = STYLES[i % len(STYLES)]
        dst_name = f"motion_landscape_{src.stem.removeprefix('wm_')}.mp4"
        dst = OUT_DIR / dst_name
        print(f"  ~ {dst_name} ({style}) ... ", end="", flush=True)
        try:
            _generate(src, dst, style)
        except RuntimeError as exc:
            print(f"FAILED\n{exc}")
            continue
        size_kb = dst.stat().st_size // 1024

        # Carry over the source's tags (landscape + topical) and add motion tags
        src_entry = meta.get(src.name, {})
        src_tags = list(src_entry.get("tags", []))
        new_tags = sorted(set(src_tags + ["motion", "dynamic"]) - {"static"})
        src_name_display = src_entry.get("name", src.stem)
        meta[dst_name] = {
            "name": f"{src_name_display} (motion)"[:80],
            "tags": new_tags,
            "media_type": "video",
            "source": src_entry.get("source", "ken-burns"),
            "source_photo": src.name,
        }
        count += 1
        print(f"ok ({size_kb} KB)")

    save_metadata(meta)
    print(f"\nGenerated {count} landscape-motion backgrounds → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
