# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Fetch real motion backgrounds from the Pexels video API.

Run from the backend dir:
    python3 scripts/fetch_pexels_videos.py

Requires ``PEXELS_API_KEY`` in backend/.env (or as an environment variable).
Sign up at https://www.pexels.com/api/ for a free key.

For each search query it downloads 1-2 landscape-oriented videos, trims to
10s, re-encodes to 1920x1080 H.264 yuv420p no-audio MP4, and writes tagged
metadata entries. All Pexels content is free for commercial use; attribution
is recorded in metadata for easy lookup.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.secrets import get_secret  # noqa: E402
from app.services.background_service import load_metadata, save_metadata  # noqa: E402

OUT_DIR = settings.BACKGROUNDS_DIR
TMP_DIR = OUT_DIR / "_pexels_tmp"

API_URL = "https://api.pexels.com/videos/search"

# (query, extra tags, how many to keep)
QUERIES: list[tuple[str, list[str], int]] = [
    ("ocean waves", ["ocean", "water", "blue"], 2),
    ("calm water lake", ["water", "lake"], 2),
    ("clouds time lapse", ["sky", "clouds"], 2),
    ("forest nature", ["forest", "green"], 2),
    ("aurora northern lights", ["night", "aurora"], 1),
    ("sunset over mountains", ["mountain", "sunset", "warm"], 2),
    ("waterfall nature", ["water", "waterfall"], 1),
    ("snow mountain landscape", ["mountain", "snow", "cool"], 1),
    ("starry night sky", ["night", "dark", "sky"], 1),
    ("river flowing slow", ["water", "river"], 1),
]


USER_AGENT = "PPT-Maker-Local/1.0 (python-urllib)"


def _api_get(query: str, api_key: str, per_page: int = 5) -> dict:
    qs = urllib.parse.urlencode(
        {"query": query, "per_page": per_page, "orientation": "landscape", "size": "medium"}
    )
    req = urllib.request.Request(
        f"{API_URL}?{qs}",
        headers={"Authorization": api_key, "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def _pick_file(video_entry: dict) -> dict | None:
    """From a Pexels video's video_files array, pick the mp4 closest to 1080p."""
    files = [f for f in video_entry.get("video_files", []) if f.get("file_type") == "video/mp4"]
    if not files:
        return None

    def score(f: dict) -> tuple[int, int]:
        w = f.get("width") or 0
        h = f.get("height") or 0
        if w <= 0 or h <= 0:
            return (10_000, 0)
        penalty = abs(w - 1920) + abs(h - 1080)
        # Prefer HD/sd-reasonable — penalize very small
        if w < 1280:
            penalty += 5000
        return (penalty, -w * h)

    files.sort(key=score)
    return files[0]


def _download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as resp:
        dest.write_bytes(resp.read())


def _normalize(src: Path, dst: Path) -> None:
    """Re-encode to 1920x1080, 30fps, 10s, H.264 yuv420p, no audio."""
    vf = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30"
    cmd = [
        "ffmpeg", "-y",
        "-ss", "0",
        "-i", str(src),
        "-t", "10",
        "-vf", vf,
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
        raise RuntimeError(f"ffmpeg failed: {result.stderr[-1500:]}")


def _slug(query: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", query).strip("_").lower()


def main() -> int:
    api_key = get_secret("PEXELS_API_KEY")
    if not api_key:
        raise SystemExit("PEXELS_API_KEY missing (set in backend/.env or env var)")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    meta = load_metadata()

    total_saved = 0
    for query, extra_tags, keep_n in QUERIES:
        print(f"→ {query} (want {keep_n})")
        try:
            data = _api_get(query, api_key, per_page=max(keep_n + 1, 3))
        except Exception as exc:
            print(f"  ! API error: {exc}")
            continue

        videos = data.get("videos", [])
        saved_for_query = 0
        for video in videos:
            if saved_for_query >= keep_n:
                break
            vid = video.get("id")
            picked = _pick_file(video)
            if not picked:
                continue
            dl_url = picked.get("link")
            w, h = picked.get("width"), picked.get("height")
            if not dl_url:
                continue

            slug = _slug(query)
            raw = TMP_DIR / f"raw_{vid}.mp4"
            out_name = f"pexels_{slug}_{vid}.mp4"
            out_path = OUT_DIR / out_name

            print(f"  ↓ id={vid} {w}x{h} ... ", end="", flush=True)
            try:
                _download(dl_url, raw)
                _normalize(raw, out_path)
                raw.unlink(missing_ok=True)
            except Exception as exc:
                print(f"FAIL: {exc}")
                raw.unlink(missing_ok=True)
                if out_path.exists():
                    out_path.unlink()
                continue

            kb = out_path.stat().st_size // 1024
            tags = sorted(set(extra_tags + ["motion", "dynamic", "landscape"]))
            meta[out_name] = {
                "name": f"{query.title()} — Pexels #{vid}",
                "tags": tags,
                "media_type": "video",
                "source": "pexels",
                "pexels_id": vid,
                "pexels_url": video.get("url", ""),
                "pexels_user": (video.get("user") or {}).get("name", ""),
            }
            total_saved += 1
            saved_for_query += 1
            print(f"ok ({kb} KB)")

        time.sleep(0.4)

    save_metadata(meta)
    try:
        TMP_DIR.rmdir()
    except OSError:
        pass
    print(f"\nFetched {total_saved} Pexels motion backgrounds → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
