# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Background asset listing + tag metadata.

Backgrounds live as files under ``BACKGROUNDS_DIR`` and are accompanied by a
sidecar ``metadata.json`` file mapping filename → ``{name, tags, media_type}``.
Files not in metadata are auto-tagged via filename heuristics on first read.
"""

import json
import logging
import time
from pathlib import Path
from typing import Any

from app.config import settings
from app.models import BackgroundInfo

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
ALL_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

METADATA_FILENAME = "metadata.json"

# Cache (result, timestamp)
_cache: tuple[list[BackgroundInfo], float] | None = None
_CACHE_TTL = 30  # seconds


def _media_type_for(suffix: str) -> str:
    return "video" if suffix.lower() in VIDEO_EXTENSIONS else "image"


def _heuristic_tags_from_filename(stem: str, suffix: str) -> tuple[str, list[str]]:
    """Infer (display_name, tags) from a filename when no metadata exists.

    Looks for keyword tokens in the stem (mountain, ocean, gradient, blue, ...)
    and always includes the media-type tag (static / motion).
    """
    lowered = stem.lower().replace("_", " ").replace("-", " ")
    tokens = set(lowered.split())

    media_type = _media_type_for(suffix)
    tags: set[str] = {"static" if media_type == "image" else "motion"}
    if media_type == "video":
        tags.add("dynamic")

    keyword_to_tags: dict[str, list[str]] = {
        "mountain": ["landscape", "mountain"],
        "mountains": ["landscape", "mountain"],
        "peak": ["landscape", "mountain"],
        "ocean": ["landscape", "ocean", "blue"],
        "sea": ["landscape", "ocean", "blue"],
        "wave": ["landscape", "ocean", "blue"],
        "water": ["landscape", "ocean", "blue"],
        "lake": ["landscape", "water"],
        "river": ["landscape", "water"],
        "forest": ["landscape", "forest", "green"],
        "tree": ["landscape", "forest", "green"],
        "trees": ["landscape", "forest", "green"],
        "leaves": ["landscape", "forest", "green"],
        "field": ["landscape", "field"],
        "meadow": ["landscape", "field", "green"],
        "sky": ["landscape", "sky"],
        "cloud": ["landscape", "sky"],
        "clouds": ["landscape", "sky"],
        "sunset": ["landscape", "sunset", "warm"],
        "sunrise": ["landscape", "sunrise", "warm"],
        "dusk": ["landscape", "sunset", "warm"],
        "dawn": ["landscape", "sunrise", "warm"],
        "night": ["landscape", "night", "dark"],
        "stars": ["landscape", "night", "dark"],
        "aurora": ["landscape", "night"],
        "snow": ["landscape", "snow", "cool"],
        "winter": ["landscape", "snow", "cool"],
        "desert": ["landscape", "desert", "warm"],
        "valley": ["landscape", "valley"],
        "canyon": ["landscape", "canyon"],
        "waterfall": ["landscape", "water"],
        "worship": ["worship"],
        "church": ["worship", "sacred"],
        "cross": ["worship", "sacred"],
        "color": ["color"],
        "solid": ["color", "solid"],
        "gradient": ["color", "gradient", "abstract"],
        "radial": ["color", "gradient", "abstract"],
        "abstract": ["abstract"],
        "geometric": ["abstract", "geometric"],
        "blue": ["blue", "cool"],
        "navy": ["blue", "dark", "cool"],
        "teal": ["blue", "cool"],
        "cyan": ["blue", "cool"],
        "indigo": ["blue", "purple", "cool"],
        "purple": ["purple", "cool"],
        "violet": ["purple", "cool"],
        "plum": ["purple", "cool"],
        "lavender": ["purple", "cool"],
        "green": ["green", "cool"],
        "sage": ["green", "cool"],
        "emerald": ["green", "cool"],
        "red": ["red", "warm"],
        "wine": ["red", "warm", "dark"],
        "burgundy": ["red", "warm", "dark"],
        "orange": ["orange", "warm"],
        "amber": ["orange", "warm"],
        "yellow": ["yellow", "warm"],
        "cream": ["cream", "warm", "light"],
        "pink": ["pink", "warm"],
        "magenta": ["pink", "warm"],
        "rose": ["pink", "warm"],
        "gold": ["gold", "warm"],
        "dark": ["dark"],
        "charcoal": ["dark", "neutral"],
        "slate": ["dark", "neutral", "blue"],
        "black": ["dark"],
        "light": ["light"],
        "white": ["light"],
        "gray": ["neutral"],
        "grey": ["neutral"],
        "stone": ["neutral", "earth"],
        "earth": ["earth"],
        "warm": ["warm"],
        "cool": ["cool"],
        "vibrant": ["vibrant"],
    }

    for tok in tokens:
        for keyword, kw_tags in keyword_to_tags.items():
            if tok == keyword:
                tags.update(kw_tags)

    name = stem.replace("_", " ").replace("-", " ").title()
    return name, sorted(tags)


def load_metadata() -> dict[str, dict[str, Any]]:
    """Read the backgrounds sidecar metadata.json (empty dict if missing)."""
    path = settings.BACKGROUNDS_DIR / METADATA_FILENAME
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("Failed to read backgrounds metadata.json")
        return {}


def save_metadata(meta: dict[str, dict[str, Any]]) -> None:
    """Atomic write of the backgrounds sidecar metadata.json."""
    path = settings.BACKGROUNDS_DIR / METADATA_FILENAME
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def list_default_backgrounds() -> list[BackgroundInfo]:
    """List all default backgrounds (cached) enriched with tags + media type."""
    global _cache
    if _cache and (time.time() - _cache[1]) < _CACHE_TTL:
        return _cache[0]

    bg_dir = settings.BACKGROUNDS_DIR
    if not bg_dir.exists():
        return []

    metadata = load_metadata()
    metadata_dirty = False

    backgrounds: list[BackgroundInfo] = []
    for idx, path in enumerate(sorted(bg_dir.iterdir()), start=1):
        if path.name == METADATA_FILENAME:
            continue
        suffix = path.suffix.lower()
        if suffix not in ALL_EXTENSIONS:
            continue

        entry = metadata.get(path.name)
        if entry is None:
            name, tags = _heuristic_tags_from_filename(path.stem, suffix)
            entry = {
                "name": name,
                "tags": tags,
                "media_type": _media_type_for(suffix),
            }
            metadata[path.name] = entry
            metadata_dirty = True

        backgrounds.append(
            BackgroundInfo(
                id=idx,
                filename=path.name,
                name=entry.get("name") or path.stem.replace("_", " ").title(),
                category=entry.get("category", "default"),
                url=f"/static/backgrounds/{path.name}",
                tags=list(entry.get("tags", [])),
                media_type=entry.get("media_type") or _media_type_for(suffix),
            )
        )

    if metadata_dirty:
        try:
            save_metadata(metadata)
        except Exception:
            logger.exception("Failed to write backgrounds metadata.json")

    _cache = (backgrounds, time.time())
    return backgrounds


def upsert_metadata(filename: str, name: str, tags: list[str], media_type: str) -> None:
    """Add/update an entry in metadata.json (called from the upload endpoint)."""
    metadata = load_metadata()
    metadata[filename] = {
        "name": name,
        "tags": sorted(set(tags)),
        "media_type": media_type,
    }
    save_metadata(metadata)
    invalidate_cache()


def invalidate_cache() -> None:
    global _cache
    _cache = None


def build_id_to_path() -> dict[int, Path]:
    """Single source of truth for ``bg.id -> local path`` resolution."""
    return {bg.id: settings.BACKGROUNDS_DIR / bg.filename for bg in list_default_backgrounds()}


def assign_backgrounds(
    num_slides: int,
    background_ids: list[int] | None = None,
    per_slide_ids: dict[int, int] | None = None,
) -> list[Path]:
    """Assign background images to slides."""
    all_bgs = list_default_backgrounds()
    if not all_bgs:
        return [None] * num_slides

    id_to_path = {bg.id: settings.BACKGROUNDS_DIR / bg.filename for bg in all_bgs}

    if background_ids:
        cycle_bgs = [bg for bg in all_bgs if bg.id in background_ids]
        if not cycle_bgs:
            cycle_bgs = all_bgs
    else:
        cycle_bgs = all_bgs

    result = []
    for i in range(num_slides):
        if per_slide_ids and i in per_slide_ids:
            result.append(id_to_path.get(per_slide_ids[i]))
        else:
            bg = cycle_bgs[i % len(cycle_bgs)]
            result.append(id_to_path[bg.id])

    return result
