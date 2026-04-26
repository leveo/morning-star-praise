# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Generate 25+ default static backgrounds (solid colors + gradients).

Run from the backend dir:
    python3 scripts/generate_default_backgrounds.py

Outputs JPEG files into ``data/backgrounds/defaults/`` and merges entries into
``metadata.json`` with descriptive tags. Re-running is safe — existing files
are overwritten and metadata is updated in place.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Allow `from app...` when run as a script from backend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.services.background_service import load_metadata, save_metadata  # noqa: E402

SIZE = (1920, 1080)
JPEG_QUALITY = 92

OUT_DIR = settings.BACKGROUNDS_DIR


# (filename, display name, RGB color, tags)
SOLID_COLORS: list[tuple[str, str, tuple[int, int, int], list[str]]] = [
    ("color_navy.jpg",     "Deep Navy",     (10, 25, 47),    ["color", "solid", "blue", "navy", "dark", "cool", "static"]),
    ("color_royal.jpg",    "Royal Blue",    (30, 58, 138),   ["color", "solid", "blue", "royal", "cool", "static"]),
    ("color_charcoal.jpg", "Charcoal",      (31, 41, 55),    ["color", "solid", "dark", "neutral", "static"]),
    ("color_slate.jpg",    "Slate",         (51, 65, 85),    ["color", "solid", "dark", "neutral", "blue", "static"]),
    ("color_plum.jpg",     "Plum",          (88, 28, 135),   ["color", "solid", "purple", "plum", "cool", "static"]),
    ("color_forest.jpg",   "Forest",        (20, 83, 45),    ["color", "solid", "green", "forest", "cool", "static"]),
    ("color_teal.jpg",     "Deep Teal",     (19, 78, 74),    ["color", "solid", "teal", "blue", "cool", "static"]),
    ("color_wine.jpg",     "Wine",          (127, 29, 29),   ["color", "solid", "red", "wine", "warm", "dark", "static"]),
    ("color_cream.jpg",    "Warm Cream",    (252, 232, 178), ["color", "solid", "cream", "warm", "light", "static"]),
    ("color_sage.jpg",     "Sage",          (54, 83, 20),    ["color", "solid", "green", "sage", "cool", "static"]),
]

# (filename, name, top RGB, bottom RGB, direction, tags)
LINEAR_GRADIENTS: list[tuple[str, str, tuple[int, int, int], tuple[int, int, int], str, list[str]]] = [
    ("gradient_sky_blue.jpg",  "Sky to Deep Blue",   (135, 206, 250), (10, 30, 70),    "vertical", ["color", "gradient", "blue", "sky", "cool", "static"]),
    ("gradient_sunset.jpg",    "Sunset Glow",        (255, 140, 50),  (120, 30, 90),   "vertical", ["color", "gradient", "sunset", "orange", "warm", "static"]),
    ("gradient_ocean.jpg",     "Ocean Depth",        (60, 180, 200),  (10, 30, 80),    "vertical", ["color", "gradient", "blue", "ocean", "cool", "static"]),
    ("gradient_aurora.jpg",    "Aurora",             (40, 200, 140),  (60, 20, 110),   "vertical", ["color", "gradient", "green", "purple", "cool", "static"]),
    ("gradient_dawn.jpg",      "Quiet Dawn",         (255, 220, 190), (50, 70, 130),   "vertical", ["color", "gradient", "warm", "dawn", "cream", "static"]),
    ("gradient_cherry.jpg",    "Cherry to Wine",     (255, 110, 160), (90, 15, 50),    "vertical", ["color", "gradient", "pink", "red", "warm", "static"]),
    ("gradient_forest.jpg",    "Forest Light",       (160, 220, 140), (15, 60, 30),    "vertical", ["color", "gradient", "green", "forest", "cool", "static"]),
    ("gradient_twilight.jpg",  "Twilight",           (255, 130, 80),  (40, 30, 100),   "vertical", ["color", "gradient", "warm", "purple", "twilight", "static"]),
    ("gradient_lavender.jpg",  "Lavender Mist",      (210, 190, 240), (60, 30, 110),   "vertical", ["color", "gradient", "purple", "lavender", "cool", "light", "static"]),
    ("gradient_storm.jpg",     "Storm",              (90, 100, 120),  (15, 20, 30),    "vertical", ["color", "gradient", "neutral", "dark", "static"]),
]

# (filename, name, center RGB, edge RGB, tags)
RADIAL_GRADIENTS: list[tuple[str, str, tuple[int, int, int], tuple[int, int, int], list[str]]] = [
    ("radial_navy_glow.jpg",   "Navy Glow",     (60, 100, 200), (5, 15, 40),    ["color", "gradient", "radial", "blue", "dark", "static"]),
    ("radial_amber_glow.jpg",  "Amber Glow",    (255, 200, 100), (40, 20, 0),    ["color", "gradient", "radial", "warm", "amber", "static"]),
    ("radial_purple_glow.jpg", "Purple Glow",   (180, 120, 255), (20, 10, 40),   ["color", "gradient", "radial", "purple", "dark", "static"]),
    ("radial_emerald_glow.jpg","Emerald Glow",  (90, 220, 160), (10, 35, 25),    ["color", "gradient", "radial", "green", "emerald", "static"]),
    ("radial_burgundy_glow.jpg","Burgundy Glow",(220, 80, 90),  (40, 5, 15),     ["color", "gradient", "radial", "red", "warm", "dark", "static"]),
]


def _save_jpg(img: Image.Image, name: str) -> Path:
    out = OUT_DIR / name
    img.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return out


def _solid(rgb: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", SIZE, rgb)


def _linear_gradient(top: tuple[int, int, int], bottom: tuple[int, int, int], direction: str) -> Image.Image:
    w, h = SIZE
    if direction == "vertical":
        t = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        col = np.array(top, dtype=np.float32) * (1 - t) + np.array(bottom, dtype=np.float32) * t  # h x 3
        arr = np.broadcast_to(col[:, None, :], (h, w, 3)).copy()
    else:  # horizontal
        t = np.linspace(0, 1, w, dtype=np.float32)[None, :]
        col = np.array(top, dtype=np.float32) * (1 - t)[..., None] + np.array(bottom, dtype=np.float32) * t[..., None]
        arr = np.broadcast_to(col, (h, w, 3)).copy()
    return Image.fromarray(arr.astype(np.uint8))


def _radial_gradient(center: tuple[int, int, int], edge: tuple[int, int, int]) -> Image.Image:
    w, h = SIZE
    cx, cy = w / 2, h / 2
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    max_dist = float(np.sqrt(cx * cx + cy * cy))
    t = (dist / max_dist).clip(0, 1)[..., None]
    arr = (
        np.array(center, dtype=np.float32) * (1 - t)
        + np.array(edge, dtype=np.float32) * t
    )
    return Image.fromarray(arr.astype(np.uint8))


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta = load_metadata()

    count = 0

    for fname, display, rgb, tags in SOLID_COLORS:
        _save_jpg(_solid(rgb), fname)
        meta[fname] = {"name": display, "tags": sorted(set(tags)), "media_type": "image"}
        count += 1
        print(f"  + {fname}  ({display})")

    for fname, display, top, bot, direction, tags in LINEAR_GRADIENTS:
        _save_jpg(_linear_gradient(top, bot, direction), fname)
        meta[fname] = {"name": display, "tags": sorted(set(tags)), "media_type": "image"}
        count += 1
        print(f"  + {fname}  ({display})")

    for fname, display, center, edge, tags in RADIAL_GRADIENTS:
        _save_jpg(_radial_gradient(center, edge), fname)
        meta[fname] = {"name": display, "tags": sorted(set(tags)), "media_type": "image"}
        count += 1
        print(f"  + {fname}  ({display})")

    save_metadata(meta)
    print(f"\nGenerated {count} backgrounds → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
