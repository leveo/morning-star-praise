# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
from pathlib import Path

import pytest

from app.services import video_service


def _chunk(
    text: str,
    sung_start: float,
    sung_end: float,
) -> video_service.TimedChunk:
    return video_service.TimedChunk(
        text=text,
        start=sung_start,
        end=sung_end,
        sung_start=sung_start,
        sung_end=sung_end,
    )


def test_normal_slide_is_fully_visible_half_second_early():
    timed = [_chunk("第一頁", 3.0, 5.0), _chunk("第二頁", 7.0, 9.0)]

    video_service.apply_display_timing_rules(timed, audio_duration=12.0)

    assert timed[0].start == pytest.approx(2.5)
    assert timed[1].start == pytest.approx(6.5)
    assert timed[0].end == timed[1].start
    assert timed[1].end == pytest.approx(12.0)


def test_long_instrumental_shows_next_slide_five_seconds_early():
    timed = [_chunk("第一頁", 3.0, 5.0), _chunk("第二頁", 15.0, 17.0)]

    video_service.apply_display_timing_rules(timed, audio_duration=20.0)

    assert timed[1].start == pytest.approx(10.0)
    assert timed[1].lead == pytest.approx(5.0)


def test_eight_second_gap_still_uses_normal_lead():
    timed = [_chunk("第一頁", 3.0, 5.0), _chunk("第二頁", 13.0, 15.0)]

    video_service.apply_display_timing_rules(timed, audio_duration=18.0)

    assert timed[1].start == pytest.approx(12.5)
    assert timed[1].lead == pytest.approx(0.5)


def test_first_slide_never_uses_long_intro_rule():
    timed = [_chunk("第一頁", 20.0, 23.0)]

    video_service.apply_display_timing_rules(timed, audio_duration=30.0)

    assert timed[0].start == pytest.approx(19.5)
    assert timed[0].lead == pytest.approx(0.5)


def test_display_starts_remain_non_negative_and_monotonic():
    timed = [_chunk("第一頁", 0.2, 0.5), _chunk("第二頁", 0.3, 0.7)]

    video_service.apply_display_timing_rules(timed, audio_duration=1.0)

    assert timed[0].start == pytest.approx(0.0)
    assert timed[1].start >= timed[0].start + 0.1
    assert timed[0].end == timed[1].start


def test_sung_start_override_rebuilds_display_windows():
    timed = [_chunk("第一頁", 3.0, 5.0), _chunk("第二頁", 7.0, 9.0)]
    plan = video_service.AudioPlan(
        whisper_words=[],
        audio_duration=12.0,
        intro_end=2.5,
        language="zh",
        stanzas=[],
        occurrences=[],
        lyric_chunks=["第一頁", "第二頁"],
        chunk_stanza_idx=[0, 1],
        timed=timed,
    )

    video_service.apply_sung_start_overrides(plan, {1: 8.2})

    assert plan.timed[1].sung_start == pytest.approx(8.2)
    assert plan.timed[1].sung_end == pytest.approx(10.2)
    assert plan.timed[1].start == pytest.approx(7.7)
    assert plan.intro_end == pytest.approx(2.5)


def test_sung_start_override_clamps_inside_audio():
    timed = [_chunk("第一頁", 3.0, 5.0)]
    plan = video_service.AudioPlan(
        whisper_words=[],
        audio_duration=8.0,
        intro_end=2.5,
        language="zh",
        stanzas=[],
        occurrences=[],
        lyric_chunks=["第一頁"],
        chunk_stanza_idx=[0],
        timed=timed,
    )

    video_service.apply_sung_start_overrides(plan, {0: 20.0})

    assert plan.timed[0].sung_start == pytest.approx(7.9)
    assert plan.timed[0].sung_end == pytest.approx(8.0)


def test_plan_round_trip_preserves_sung_and_display_times():
    timed = [_chunk("第一頁", 3.0, 5.0)]
    video_service.apply_display_timing_rules(timed, audio_duration=8.0)
    plan = video_service.AudioPlan(
        whisper_words=[video_service.WhisperWord("第一頁", 3.0, 5.0)],
        audio_duration=8.0,
        intro_end=timed[0].start,
        language="zh",
        stanzas=["第一頁"],
        occurrences=[],
        lyric_chunks=["第一頁"],
        chunk_stanza_idx=[0],
        timed=timed,
    )

    restored = video_service.plan_from_dict(video_service.plan_to_dict(plan))

    assert restored.timed[0].start == pytest.approx(2.5)
    assert restored.timed[0].sung_start == pytest.approx(3.0)
    assert restored.timed[0].sung_end == pytest.approx(5.0)


def test_srt_uses_sung_times_not_early_display_times(tmp_path: Path):
    timed = [_chunk("第一頁", 3.0, 5.0)]
    video_service.apply_display_timing_rules(timed, audio_duration=8.0)
    output = tmp_path / "lyrics.srt"

    video_service.write_srt(timed, output)

    text = output.read_text(encoding="utf-8")
    assert "00:00:03,000 --> 00:00:05,000" in text
    assert "00:00:02,500" not in text
