# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
"""End-to-end API tests for Worship PPT Generator."""

import pytest
from fastapi.testclient import TestClient
from pptx import Presentation
import io

from app.main import app

client = TestClient(app)


# --- Health ---

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# --- Backgrounds ---

def test_list_backgrounds():
    r = client.get("/api/backgrounds")
    assert r.status_code == 200
    bgs = r.json()
    assert isinstance(bgs, list)
    assert len(bgs) > 0
    assert "id" in bgs[0]
    assert "url" in bgs[0]
    assert "filename" in bgs[0]


# --- Lyrics Parsing ---

def test_parse_lyrics_basic():
    r = client.post("/api/lyrics/parse", json={
        "text": "Line 1\nLine 2\nLine 3\nLine 4\n\nLine 5\nLine 6",
        "language": "en",
        "max_lines_per_slide": 6,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["total_slides"] == 2
    assert len(data["slides"]) == 2


def test_parse_lyrics_max_lines():
    r = client.post("/api/lyrics/parse", json={
        "text": "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9",
        "language": "en",
        "max_lines_per_slide": 4,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["total_slides"] == 3  # 4+4+1


def test_parse_lyrics_empty():
    r = client.post("/api/lyrics/parse", json={
        "text": "",
        "language": "en",
    })
    assert r.status_code == 200
    assert r.json()["total_slides"] == 0


# --- Chinese Conversion ---

def test_convert_simplified_to_traditional():
    r = client.post("/api/lyrics/convert", json={
        "text": "奇异恩典",
        "target": "traditional",
    })
    assert r.status_code == 200
    assert "奇異恩典" in r.json()["text"]


def test_convert_traditional_to_simplified():
    r = client.post("/api/lyrics/convert", json={
        "text": "奇異恩典",
        "target": "simplified",
    })
    assert r.status_code == 200
    assert "奇异恩典" in r.json()["text"]


# --- PPT Generation ---

def test_generate_ppt():
    r = client.post("/api/ppt/generate", json={
        "title": "Test Song",
        "slides": [
            {"text": "Verse 1 line 1\nVerse 1 line 2"},
            {"text": "Chorus line 1\nChorus line 2"},
        ],
        "language": "en",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["filename"].endswith(".pptx")
    assert len(data["slides_preview"]) == 2


def test_generate_ppt_empty_slides():
    r = client.post("/api/ppt/generate", json={
        "title": "Empty",
        "slides": [],
        "language": "en",
    })
    assert r.status_code == 200
    assert r.json()["filename"] == ""


def test_generate_and_download():
    # Generate
    r = client.post("/api/ppt/generate", json={
        "title": "Download Test",
        "slides": [{"text": "Hello World"}],
        "language": "en",
    })
    filename = r.json()["filename"]

    # Download
    r = client.get(f"/api/ppt/download/{filename}")
    assert r.status_code == 200
    assert "openxmlformats" in r.headers["content-type"]

    # Verify it's a valid PPTX
    prs = Presentation(io.BytesIO(r.content))
    assert len(prs.slides) == 2  # title + 1 content slide


def test_generate_chinese_ppt():
    r = client.post("/api/ppt/generate", json={
        "title": "奇异恩典",
        "slides": [{"text": "奇异恩典 何等甘甜\n我罪已得赦免"}],
        "language": "zh-hans",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["filename"].endswith(".pptx")


# --- Security: Path Traversal ---

def test_download_path_traversal_blocked():
    r = client.get("/api/ppt/download/../../etc/passwd")
    assert r.status_code in (400, 404)  # blocked, not 200


def test_frame_path_traversal_blocked():
    r = client.get("/api/youtube/frame/../../etc/passwd")
    assert r.status_code in (400, 404, 422)


# --- YouTube ---

def test_youtube_extract_lyrics_invalid_url():
    r = client.post("/api/youtube/extract-lyrics", json={"url": "not-a-url"})
    assert r.status_code == 400


def test_youtube_extract_lyrics_valid():
    """Test with a real YouTube video (Amazing Grace)."""
    r = client.post("/api/youtube/extract-lyrics", json={
        "url": "https://www.youtube.com/watch?v=Jbe7OruLk8I"
    })
    assert r.status_code == 200
    data = r.json()
    assert "title" in data
    assert "lyrics" in data
    assert len(data["lyrics"]) > 0
    assert data["language"] in ("en", "zh-hans", "zh-hant")


# --- Edge Cases ---

def test_generate_ppt_with_background_selection():
    bgs = client.get("/api/backgrounds").json()
    bg_ids = [bgs[0]["id"]] if bgs else None

    r = client.post("/api/ppt/generate", json={
        "title": "BG Test",
        "slides": [{"text": "Test"}],
        "language": "en",
        "background_ids": bg_ids,
    })
    assert r.status_code == 200


def test_download_nonexistent_file():
    r = client.get("/api/ppt/download/nonexistent_file.pptx")
    assert r.status_code == 404
