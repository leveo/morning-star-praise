# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Fetch curated landscape photos from Wikimedia Commons.

Run from the backend dir:
    python3 scripts/fetch_landscape_backgrounds.py

Pulls files from the ``Featured_pictures_of_landscapes`` category, downloads
the thumbnail-sized version (no multi-MB originals), crops/scales to 1920x1080
cover-fit, saves into ``data/backgrounds/defaults/`` and updates metadata.json.

All Wikimedia Commons content is freely licensed (CC-BY / CC-BY-SA / PD); see
the source page for each file's exact license + author. The metadata entry
records source="wikimedia" so users know to credit if needed.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.services.background_service import load_metadata, save_metadata  # noqa: E402

API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "PPT-Maker-Local/1.0 (https://github.com/anthropics/claude-code)"
TARGET = (1920, 1080)
TARGET_COUNT = 12

OUT_DIR = settings.BACKGROUNDS_DIR


def _api_get(params: dict) -> dict:
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{API_URL}?{qs}", headers={"User-Agent": USER_AGENT}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def list_landscape_titles(limit: int = 30) -> list[str]:
    data = _api_get(
        {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": "Category:Featured_pictures_of_landscapes",
            "cmlimit": str(limit),
            "cmtype": "file",
            "format": "json",
        }
    )
    return [m["title"] for m in data["query"]["categorymembers"]]


def get_thumb_url(title: str, width: int = 2400) -> str | None:
    data = _api_get(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|size",
            "iiurlwidth": str(width),
            "format": "json",
        }
    )
    pages = data.get("query", {}).get("pages", {})
    for _pid, page in pages.items():
        info_list = page.get("imageinfo") or []
        if info_list:
            info = info_list[0]
            return info.get("thumburl") or info.get("url")
    return None


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def crop_cover(img: Image.Image, target: tuple[int, int]) -> Image.Image:
    tw, th = target
    src_ratio = img.width / img.height
    tgt_ratio = tw / th
    if src_ratio > tgt_ratio:
        new_w = int(img.height * tgt_ratio)
        left = (img.width - new_w) // 2
        img = img.crop((left, 0, left + new_w, img.height))
    elif src_ratio < tgt_ratio:
        new_h = int(img.width / tgt_ratio)
        top = (img.height - new_h) // 2
        img = img.crop((0, top, img.width, top + new_h))
    return img.resize((tw, th), Image.LANCZOS)


def title_to_slug(title: str) -> str:
    name = re.sub(r"^File:", "", title)
    name = re.sub(r"\.[a-zA-Z0-9]+$", "", name)
    name = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    return name[:48]


def title_to_tags(title: str) -> list[str]:
    lower = title.lower()
    tags: set[str] = {"landscape", "static"}
    keyword_map: dict[str, list[str]] = {
        "mountain": ["mountain"],
        "peak": ["mountain"],
        "alps": ["mountain"],
        "summit": ["mountain"],
        "ocean": ["ocean", "blue", "water"],
        "sea": ["ocean", "blue", "water"],
        "wave": ["ocean", "water"],
        "coast": ["ocean", "water"],
        "beach": ["ocean", "water"],
        "lake": ["water"],
        "river": ["water"],
        "waterfall": ["water"],
        "forest": ["forest", "green"],
        "tree": ["forest", "green"],
        "wood": ["forest", "green"],
        "park": ["forest", "green"],
        "meadow": ["field", "green"],
        "valley": ["valley"],
        "canyon": ["canyon", "earth"],
        "desert": ["desert", "warm"],
        "sand": ["desert"],
        "sunset": ["sunset", "warm"],
        "sunrise": ["sunrise", "warm"],
        "dusk": ["sunset", "warm"],
        "dawn": ["sunrise", "warm"],
        "twilight": ["twilight", "warm"],
        "night": ["night", "dark"],
        "star": ["night", "dark"],
        "milky": ["night", "dark"],
        "aurora": ["night"],
        "snow": ["snow", "cool"],
        "winter": ["snow", "cool"],
        "ice": ["snow", "cool"],
        "glacier": ["snow", "cool"],
        "sky": ["sky"],
        "cloud": ["sky"],
        "fog": ["sky"],
        "mist": ["sky"],
        "panorama": ["panorama"],
    }
    for k, v in keyword_map.items():
        if k in lower:
            tags.update(v)
    return sorted(tags)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta = load_metadata()

    print(f"Querying Wikimedia Commons for landscape candidates…")
    try:
        titles = list_landscape_titles(limit=40)
    except Exception as exc:
        print(f"!! API call failed: {exc}")
        return 1
    print(f"  → got {len(titles)} candidates")

    saved = 0
    for title in titles:
        if saved >= TARGET_COUNT:
            break
        try:
            url = get_thumb_url(title)
            if not url:
                continue
            data = download(url)
            img = Image.open(BytesIO(data)).convert("RGB")
            if img.width < 1500 or img.height < 700:
                print(f"  ~ skip {title!s:.55} (too small {img.width}x{img.height})")
                continue
            if img.width < img.height:
                print(f"  ~ skip {title!s:.55} (portrait)")
                continue
            cropped = crop_cover(img, TARGET)
            slug = title_to_slug(title)
            fname = f"wm_{slug}.jpg"
            out_path = OUT_DIR / fname
            cropped.save(out_path, "JPEG", quality=88, optimize=True)

            display_name = re.sub(r"^File:|\.[a-zA-Z0-9]+$", "", title)
            meta[fname] = {
                "name": display_name[:80],
                "tags": title_to_tags(title),
                "media_type": "image",
                "source": "wikimedia",
                "source_title": title,
            }
            saved += 1
            kb = out_path.stat().st_size // 1024
            print(f"  + {fname:48} {kb:>5} KB")
        except Exception as exc:
            print(f"  ! {title!s:.55}: {exc}")

    save_metadata(meta)
    print(f"\nFetched {saved} landscape backgrounds → {OUT_DIR}")
    return 0 if saved > 0 else 2


if __name__ == "__main__":
    sys.exit(main())
