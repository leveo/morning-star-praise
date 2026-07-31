# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
import json
from pathlib import Path
from types import SimpleNamespace

from app.routers import videos
from app.services import video_service


def test_remotion_props_keep_chinese_and_english_line_spacing_separate(
    monkeypatch,
    tmp_path,
):
    project_dir = tmp_path / "remotion"
    project_dir.mkdir()
    audio_path = tmp_path / "song.mp3"
    audio_path.write_bytes(b"audio")
    output_path = tmp_path / "song.mp4"
    work_dir = tmp_path / "work"

    monkeypatch.setattr(video_service.settings, "REMOTION_PROJECT_DIR", project_dir)
    monkeypatch.setattr(video_service.settings, "REMOTION_BROWSER_EXECUTABLE", "")

    def fake_run(command, **_kwargs):
        Path(command[5]).write_bytes(b"video")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(video_service.subprocess, "run", fake_run)

    video_service.render_via_remotion(
        audio_path=audio_path,
        title="测试",
        title_en="Test Title",
        collection_zh="教會聖詩 #450",
        collection_en="Hymn's for God's People",
        composer="",
        language="auto",
        timed=[video_service.TimedChunk("中文\nEnglish", 0, 2)],
        background_paths=[],
        audio_duration=2,
        intro_duration=0,
        work_dir=work_dir,
        output_path=output_path,
        primary_line_spacing_multiplier=1.6,
        secondary_line_spacing_multiplier=1.2,
    )

    props = json.loads((work_dir / "props.json").read_text(encoding="utf-8"))
    assert props["primaryLineSpacingMultiplier"] == 1.6
    assert props["secondaryLineSpacingMultiplier"] == 1.2
    assert props["titleEn"] == "Test Title"
    assert props["collectionZh"] == "教會聖詩 #450"
    assert props["collectionEn"] == "Hymn's for God's People"


def test_default_video_backgrounds_follow_section_groups(monkeypatch):
    selected = [Path("bg1.jpg"), Path("bg2.jpg"), Path("bg3.jpg")]

    def fake_assign(num_slides: int, background_ids=None):
        assert num_slides == 3
        assert background_ids == [11, 22, 33]
        return selected

    monkeypatch.setattr(videos, "assign_backgrounds", fake_assign)

    result = videos._grouped_background_paths(
        num_lyric_slides=6,
        background_group_indices=[0, 0, 1, 1, 2, 2],
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


def test_extracted_backgrounds_fall_back_to_pairs_without_analysis_groups():
    result = videos._grouped_background_paths(
        num_lyric_slides=5,
        background_group_indices=None,
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


def test_section_backgrounds_support_variable_slide_counts():
    result = videos._grouped_background_paths(
        num_lyric_slides=7,
        background_group_indices=[0, 0, 0, 0, 1, 1, 1],
        background_ids=None,
        extracted_bg_paths=[Path("bg1.jpg"), Path("bg2.jpg")],
    )

    assert result == [
        Path("bg1.jpg"),  # title follows the first lyric section
        Path("bg1.jpg"),
        Path("bg1.jpg"),
        Path("bg1.jpg"),
        Path("bg1.jpg"),
        Path("bg2.jpg"),
        Path("bg2.jpg"),
        Path("bg2.jpg"),
    ]


def test_verse_and_repeated_chorus_share_one_background_group():
    occurrences = [
        video_service.StanzaOccurrence(0, 0, 10, 1),
        video_service.StanzaOccurrence(1, 10, 20, 1),
        video_service.StanzaOccurrence(2, 20, 30, 1),
        video_service.StanzaOccurrence(1, 30, 40, 1),
        video_service.StanzaOccurrence(3, 40, 50, 1),
        video_service.StanzaOccurrence(1, 50, 60, 1),
        video_service.StanzaOccurrence(1, 60, 70, 1),
    ]

    assert video_service.background_groups_for_occurrences(occurrences) == [
        0, 0, 1, 1, 2, 2, 2,
    ]


def test_non_repeating_stanzas_are_paired_as_verse_and_chorus():
    occurrences = [
        video_service.StanzaOccurrence(0, 0, 10, 1),
        video_service.StanzaOccurrence(1, 10, 20, 1),
        video_service.StanzaOccurrence(2, 20, 30, 1),
    ]

    assert video_service.background_groups_for_occurrences(occurrences) == [0, 0, 1]


def test_copied_chorus_stanzas_are_grouped_by_similar_lyrics():
    stanzas = [
        "第一节主歌",
        "主啊 我今来 求主洗净我罪愆",
        "第二节主歌",
        "主啊 我今来 求主洗净我罪愆",
        "第三节主歌",
        "主啊 我今来 求主洗净我罪愆",
    ]
    occurrences = [
        video_service.StanzaOccurrence(i, i * 10, (i + 1) * 10, 1)
        for i in range(6)
    ]

    assert video_service.background_groups_for_occurrences(
        occurrences,
        stanzas,
    ) == [0, 0, 1, 1, 2, 2]

    assert video_service.background_groups_for_chunks(
        stanzas,
        occurrences,
        [0, 1, 2, 3, 4, 5],
    ) == [0, 0, 1, 1, 2, 2]


def test_multi_part_refrain_stays_with_its_verse():
    stanzas = [
        "第一节主歌",
        "副歌上半",
        "副歌下半",
        "第二节主歌",
        "副歌上半",
        "副歌下半",
    ]
    occurrences = [
        video_service.StanzaOccurrence(i, i * 10, (i + 1) * 10, 1)
        for i in range(6)
    ]

    assert video_service.background_groups_for_occurrences(
        occurrences,
        stanzas,
    ) == [0, 0, 0, 1, 1, 1]


def test_browser_draft_marker_protects_analysis_and_outputs(monkeypatch, tmp_path):
    analysis_root = tmp_path / "analyses"
    analysis_dir = analysis_root / "abc123"
    analysis_dir.mkdir(parents=True)
    monkeypatch.setattr(videos, "ANALYSIS_ROOT", analysis_root)

    videos._write_draft_outputs(analysis_dir, {"song.mp4", "song.srt"})

    files, analyses = videos.referenced_draft_artifacts()
    assert files == {"song.mp4", "song.srt"}
    assert analyses == {"abc123"}


def test_clear_browser_draft_deletes_unreferenced_artifacts(monkeypatch, tmp_path):
    analysis_root = tmp_path / "analyses"
    analysis_dir = analysis_root / "abc123"
    analysis_dir.mkdir(parents=True)
    output_dir = tmp_path / "outputs"
    output_dir.mkdir()
    output_file = output_dir / "song.mp4"
    output_file.write_bytes(b"video")

    monkeypatch.setattr(videos, "ANALYSIS_ROOT", analysis_root)
    monkeypatch.setattr(videos.settings, "OUTPUT_DIR", output_dir)
    videos._write_draft_outputs(analysis_dir, {output_file.name})

    from app.services import library_service

    monkeypatch.setattr(
        library_service,
        "referenced_artifacts",
        lambda: (set(), set()),
    )

    assert videos.clear_analysis_draft("abc123") == {"cleared": True}
    assert not analysis_dir.exists()
    assert not output_file.exists()
