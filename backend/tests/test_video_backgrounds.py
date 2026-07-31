# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
from pathlib import Path

from app.routers import videos


def test_default_video_backgrounds_repeat_in_pairs(monkeypatch):
    selected = [Path("bg1.jpg"), Path("bg2.jpg"), Path("bg3.jpg")]

    def fake_assign(num_slides: int, background_ids=None):
        assert num_slides == 3
        assert background_ids == [11, 22, 33]
        return selected

    monkeypatch.setattr(videos, "assign_backgrounds", fake_assign)

    result = videos._paired_background_paths(
        num_lyric_slides=6,
        background_ids=[11, 22, 33],
        extracted_bg_paths=None,
    )

    assert result == [
        Path("bg1.jpg"),
        Path("bg1.jpg"),
        Path("bg1.jpg"),
        Path("bg2.jpg"),
        Path("bg2.jpg"),
        Path("bg3.jpg"),
        Path("bg3.jpg"),
    ]


def test_extracted_backgrounds_repeat_in_pairs_for_odd_slide_count():
    result = videos._paired_background_paths(
        num_lyric_slides=5,
        background_ids=None,
        extracted_bg_paths=[Path("bg1.jpg"), Path("bg2.jpg"), Path("bg3.jpg")],
    )

    assert result == [
        Path("bg1.jpg"),
        Path("bg1.jpg"),
        Path("bg1.jpg"),
        Path("bg2.jpg"),
        Path("bg2.jpg"),
        Path("bg3.jpg"),
    ]
