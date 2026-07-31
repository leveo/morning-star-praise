# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
"""Deterministic bilingual hymn DOCX import and copy-friendly export."""

from __future__ import annotations

import io
import re
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from lxml import etree

from app.models import (
    DocxLyricsExportRequest,
    DocxLyricsImportResponse,
    DocxLyricsSection,
    DocxLyricsWarning,
)
from app.services.chinese_service import contains_chinese


DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DEFAULT_COLLECTION_EN = "Hymn’s for God’s People"
_V2_SUFFIX_RE = re.compile(r"_v2$", re.IGNORECASE)
_NUMBERED_TITLE_RE = re.compile(r"^\s*(\d+)\s+(.+?)\s*$")
_VERSE_MARKER_RE = re.compile(
    r"^\s*(?:(?:verse|第)\s*)?(\d+)(?:\s*節)?\s*[.:：、]?\s*$",
    re.IGNORECASE,
)
_CHORUS_MARKER_RE = re.compile(
    r"^\s*(?:副歌|重唱|chorus|refrain)\s*[:：]?\s*$",
    re.IGNORECASE,
)


class DocxLyricsError(ValueError):
    """A user-correctable DOCX import/export error."""


def _safe_source_name(filename: str) -> str:
    name = Path(filename or "lyrics.docx").name
    if Path(name).suffix.lower() != ".docx":
        raise DocxLyricsError("仅支持 .docx 文件")
    if _V2_SUFFIX_RE.search(Path(name).stem):
        raise DocxLyricsError("请选择原始 DOCX，不要再次导入已经生成的 _v2 文件")
    return name


def output_filename(filename: str) -> str:
    name = Path(filename or "lyrics.docx").name
    stem = _V2_SUFFIX_RE.sub("", Path(name).stem).rstrip()
    return f"{stem or 'lyrics'}_v2.docx"


def _filename_metadata(filename: str) -> tuple[str, str, str]:
    stem = _V2_SUFFIX_RE.sub("", Path(filename).stem).strip()
    match = _NUMBERED_TITLE_RE.match(stem)
    if not match:
        return "", "", ""
    number, remainder = match.groups()
    first_latin = re.search(r"[A-Za-z]", remainder)
    if not first_latin:
        return number, remainder.strip(), ""
    title_zh = remainder[: first_latin.start()].strip()
    title_en = remainder[first_latin.start() :].strip()
    return number, title_zh, title_en


def _paragraph_lines(document: Document) -> list[str]:
    lines: list[str] = []
    for paragraph in document.paragraphs:
        pieces = paragraph.text.splitlines() or [paragraph.text]
        for piece in pieces:
            text = piece.strip()
            if text:
                lines.append(text)
    return lines


def _find_titles(
    lines: list[str], filename: str
) -> tuple[str, str, str, int | None, int | None]:
    fallback_number, fallback_zh, fallback_en = _filename_metadata(filename)
    song_number = fallback_number
    title_zh = fallback_zh
    title_en = fallback_en
    zh_idx: int | None = None
    en_idx: int | None = None

    for idx, line in enumerate(lines):
        match = _NUMBERED_TITLE_RE.match(line)
        if not match:
            continue
        number, candidate = match.groups()
        if contains_chinese(candidate):
            song_number = number
            title_zh = candidate.strip()
            zh_idx = idx
            break

    start = (zh_idx + 1) if zh_idx is not None else 0
    for idx in range(start, len(lines)):
        match = _NUMBERED_TITLE_RE.match(lines[idx])
        if not match:
            continue
        number, candidate = match.groups()
        if contains_chinese(candidate):
            continue
        if song_number and number != song_number:
            continue
        song_number = song_number or number
        title_en = candidate.strip()
        en_idx = idx
        break

    return song_number, title_zh, title_en, zh_idx, en_idx


def _parse_language_block(lines: list[str]) -> tuple[dict[int, list[str]], list[str]]:
    verses: dict[int, list[str]] = {}
    chorus: list[str] = []
    current_kind = "verse"
    current_number = 1

    for line in lines:
        if _CHORUS_MARKER_RE.match(line):
            current_kind = "chorus"
            continue
        verse_match = _VERSE_MARKER_RE.match(line)
        if verse_match:
            current_kind = "verse"
            current_number = int(verse_match.group(1))
            continue
        if current_kind == "chorus":
            chorus.append(line)
        else:
            verses.setdefault(current_number, []).append(line)

    return {number: value for number, value in verses.items() if value}, chorus


def _make_sections(
    zh_verses: dict[int, list[str]],
    en_verses: dict[int, list[str]],
    zh_chorus: list[str],
    en_chorus: list[str],
) -> list[DocxLyricsSection]:
    sections = [
        DocxLyricsSection(
            id=f"verse-{number}",
            kind="verse",
            number=number,
            zh_lines=zh_verses.get(number, []),
            en_lines=en_verses.get(number, []),
        )
        for number in sorted(set(zh_verses) | set(en_verses))
    ]
    if zh_chorus or en_chorus:
        sections.append(
            DocxLyricsSection(
                id="chorus",
                kind="chorus",
                zh_lines=zh_chorus,
                en_lines=en_chorus,
            )
        )
    return sections


def validate_content(
    song_number: str,
    title_zh: str,
    title_en: str,
    sections: list[DocxLyricsSection],
) -> list[DocxLyricsWarning]:
    warnings: list[DocxLyricsWarning] = []

    def error(code: str, message: str, section_id: str | None = None) -> None:
        warnings.append(
            DocxLyricsWarning(
                code=code, message=message, severity="error", section_id=section_id
            )
        )

    if not song_number.strip():
        error("missing_song_number", "未识别到诗歌编号")
    if not title_zh.strip():
        error("missing_title_zh", "未识别到中文歌名")
    if not title_en.strip():
        error("missing_title_en", "未识别到英文歌名")

    verses = [section for section in sections if section.kind == "verse"]
    if not verses:
        error("missing_verses", "未识别到 Verse 歌词")
    for section in sections:
        label = "副歌" if section.kind == "chorus" else f"第 {section.number} 节"
        if not any(line.strip() for line in section.zh_lines):
            error("missing_section_zh", f"{label}缺少中文歌词", section.id)
        if not any(line.strip() for line in section.en_lines):
            error("missing_section_en", f"{label}缺少英文歌词", section.id)
    return warnings


def expanded_sections(sections: list[DocxLyricsSection]) -> list[DocxLyricsSection]:
    verses = sorted(
        (section for section in sections if section.kind == "verse"),
        key=lambda section: section.number or 0,
    )
    chorus = next((section for section in sections if section.kind == "chorus"), None)
    expanded: list[DocxLyricsSection] = []
    for verse in verses:
        expanded.append(verse)
        if chorus:
            expanded.append(chorus)
    return expanded


def format_lyrics(
    sections: list[DocxLyricsSection],
) -> tuple[str, str, str, list[str]]:
    expanded = expanded_sections(sections)
    primary_blocks = ["\n".join(s.zh_lines).strip() for s in expanded]
    secondary_blocks = ["\n".join(s.en_lines).strip() for s in expanded]
    combined_blocks = [
        "\n".join([*s.zh_lines, *s.en_lines]).strip() for s in expanded
    ]
    sequence = [section.id for section in expanded]
    return (
        "\n\n".join(block for block in primary_blocks if block),
        "\n\n".join(block for block in secondary_blocks if block),
        "\n\n".join(block for block in combined_blocks if block),
        sequence,
    )


def parse_docx(data: bytes, filename: str) -> DocxLyricsImportResponse:
    source_filename = _safe_source_name(filename)
    try:
        document = Document(io.BytesIO(data))
    except Exception as exc:
        raise DocxLyricsError("无法读取这个 DOCX；文件可能已经损坏") from exc

    lines = _paragraph_lines(document)
    if not lines:
        raise DocxLyricsError("DOCX 中没有可读取的文字")

    song_number, title_zh, title_en, zh_idx, en_idx = _find_titles(
        lines, source_filename
    )
    if zh_idx is not None and en_idx is not None and zh_idx < en_idx:
        zh_block = lines[zh_idx + 1 : en_idx]
        en_block = lines[en_idx + 1 :]
    else:
        zh_block = []
        en_block = []

    zh_verses, zh_chorus = _parse_language_block(zh_block)
    en_verses, en_chorus = _parse_language_block(en_block)
    sections = _make_sections(zh_verses, en_verses, zh_chorus, en_chorus)
    if not sections:
        sections = [
            DocxLyricsSection(
                id="verse-1", kind="verse", number=1, zh_lines=[], en_lines=[]
            )
        ]

    warnings = validate_content(song_number, title_zh, title_en, sections)
    primary, secondary, combined, sequence = format_lyrics(sections)
    collection_zh = f"教會聖詩 #{song_number}" if song_number else "教會聖詩"
    return DocxLyricsImportResponse(
        source_filename=source_filename,
        output_filename=output_filename(source_filename),
        song_number=song_number,
        title_zh=title_zh,
        title_en=title_en,
        collection_zh=collection_zh,
        collection_en=DEFAULT_COLLECTION_EN,
        sections=sections,
        sequence=sequence,
        primary_lyrics=primary,
        secondary_lyrics=secondary,
        combined_lyrics=combined,
        warnings=warnings,
        has_blocking_errors=any(w.severity == "error" for w in warnings),
    )


def _style_run(run, language: str) -> None:
    run.font.size = Pt(12)
    fonts = run._element.get_or_add_rPr().get_or_add_rFonts()
    if language == "zh":
        # Keep the OOXML declaration faithful to the requested Windows family.
        # The font table below maps it to macOS's installed Songti TC family.
        run.font.name = "宋体"
        for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
            fonts.set(qn(f"w:{attr}"), "宋体")
    else:
        run.font.name = "Times New Roman"
        for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
            fonts.set(qn(f"w:{attr}"), "Times New Roman")


def _add_line(document: Document, text: str = "", language: str = "en") -> None:
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1
    if text:
        run = paragraph.add_run(text)
        _style_run(run, language)


def _add_songti_font_alias(document: Document) -> None:
    """Map the requested 宋体 family to macOS's installed Songti TC."""
    font_part = next(
        (
            part
            for part in document.part.package.parts
            if str(part.partname) == "/word/fontTable.xml"
        ),
        None,
    )
    if font_part is None:
        return
    root = parse_xml(font_part.blob)
    if any(
        child.get(qn("w:name")) == "宋体"
        for child in root.findall(qn("w:font"))
    ):
        return
    font = OxmlElement("w:font")
    font.set(qn("w:name"), "宋体")
    alt_name = OxmlElement("w:altName")
    alt_name.set(qn("w:val"), "Songti TC")
    font.append(alt_name)
    family = OxmlElement("w:family")
    family.set(qn("w:val"), "roman")
    font.append(family)
    root.append(font)
    font_part._blob = etree.tostring(
        root, xml_declaration=True, encoding="UTF-8", standalone=True
    )


def build_docx(request: DocxLyricsExportRequest) -> tuple[bytes, str]:
    warnings = validate_content(
        request.song_number, request.title_zh, request.title_en, request.sections
    )
    errors = [warning.message for warning in warnings if warning.severity == "error"]
    if errors:
        raise DocxLyricsError("；".join(errors))

    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)

    _add_line(document, request.title_zh.strip(), "zh")
    _add_line(document, request.title_en.strip(), "en")
    _add_line(document)
    _add_line(document, request.collection_zh.strip(), "zh")
    _add_line(document, request.collection_en.strip(), "en")
    _add_line(document)
    _add_line(document)

    expanded = expanded_sections(request.sections)
    for section_index, lyrics_section in enumerate(expanded):
        for line in lyrics_section.zh_lines:
            _add_line(document, line, "zh")
        for line in lyrics_section.en_lines:
            _add_line(document, line, "en")
        if section_index < len(expanded) - 1:
            _add_line(document)

    _add_songti_font_alias(document)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue(), output_filename(request.source_filename)
