# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
import re

from app.config import settings
from app.models import SlideData
from app.services.chinese_service import contains_chinese, is_cjk_char

_ZH_BREAK_CHARS = '，。；、！？,;'
# Clause-level break chars only — excludes sentence-end periods (。 / .) and
# exclamation/question marks. Used by the max-clause normalizer, where "how
# many clauses is this line carrying" means "how many mid-sentence separators",
# not "is this a long sentence that just happens to end with a period".
_CLAUSE_BREAK_CHARS = '，、；,;'
_MAX_LINE_WIDTH = 16
_SHORT_CLAUSE_ZH_THRESHOLD = 5  # < 5 chars = "short" — allow 2 commas per output line
_MAX_LINE_WIDTH_HARD = 12       # hard cap on characters per output line (Chinese)


def _smart_split_line(line: str) -> list[str]:
    """Split a long line at punctuation into shorter display lines."""
    if not contains_chinese(line):
        if len(line) > 50 and ', ' in line:
            parts = line.split(', ')
            result, current = [], parts[0]
            for p in parts[1:]:
                if len(current) + len(p) + 2 > 50:
                    result.append(current + ',')
                    current = p
                else:
                    current += ', ' + p
            result.append(current)
            return result
        return [line]

    zh_chars = sum(1 for c in line if is_cjk_char(c))
    if zh_chars <= _MAX_LINE_WIDTH:
        return [line]

    break_positions = [i for i, c in enumerate(line) if c in _ZH_BREAK_CHARS]
    if not break_positions:
        return [line]

    result, start = [], 0
    target_len = max(zh_chars // 2, _MAX_LINE_WIDTH)
    zh_count, last_break = 0, None

    for i, c in enumerate(line):
        if is_cjk_char(c):
            zh_count += 1
        if c in _ZH_BREAK_CHARS:
            last_break = i
        if zh_count >= target_len and last_break is not None and last_break >= start:
            result.append(line[start:last_break + 1].strip())
            start = last_break + 1
            zh_count = sum(1 for ch in line[start:i+1] if is_cjk_char(ch))
            last_break = None

    remainder = line[start:].strip()
    if remainder:
        result.append(remainder)
    return result if result else [line]


def _split_at_middle_punctuation(line: str) -> list[str]:
    """Split a Chinese line at the best middle punctuation point."""
    break_positions = [i for i, c in enumerate(line) if c in _ZH_BREAK_CHARS]
    if not break_positions:
        return [line]

    # Find the break closest to the middle
    mid = len(line) // 2
    best = min(break_positions, key=lambda p: abs(p - mid))
    left = line[:best + 1].strip()
    right = line[best + 1:].strip()
    if left and right:
        return [left, right]
    return [line]


def _expand_long_lines_if_sparse(slide: SlideData) -> SlideData:
    """If a slide has <= 4 lines, split any line that has > 10 Chinese chars
    and 2+ punctuation marks into two lines for better readability."""
    lines = slide.text.split("\n")
    if len(lines) > 4:
        return slide

    expanded = []
    for line in lines:
        zh_chars = sum(1 for c in line if is_cjk_char(c))
        punct_count = sum(1 for c in line if c in _ZH_BREAK_CHARS)
        if zh_chars > 10 and punct_count >= 2:
            expanded.extend(_split_at_middle_punctuation(line))
        else:
            expanded.append(line)

    return SlideData(text="\n".join(expanded))


def parse_lyrics(
    text: str,
    max_lines: int = settings.PREFERRED_LINES_PER_SLIDE,
    max_slides: int = 0,
    max_width_per_row: int = _MAX_LINE_WIDTH_HARD,
) -> list[SlideData]:
    """Parse raw lyrics text into slide-sized chunks.

    Any blank line is a verse boundary — each contiguous block of non-blank
    lines becomes its own verse (and at least one slide). Consecutive blank
    lines collapse to a single boundary. This matches how hymns are
    typically written, where verse / chorus blocks are visually separated
    by one blank line, not two.

    ``max_width_per_row`` hard-caps the character count on each slide line
    (Chinese only); lines that exceed it are recursively split at the
    nearest punctuation (fallback: mid-character).
    """
    # Normalize: collapse spaces-only lines to empty lines
    raw_lines = text.strip().splitlines()
    normalized = [line.strip() for line in raw_lines]

    # Group into verses: any blank line ends the current verse.
    verses: list[list[str]] = []
    current_verse_lines: list[str] = []

    for line in normalized:
        if line == "":
            if current_verse_lines:
                verses.append(current_verse_lines)
                current_verse_lines = []
            continue
        split_lines = _smart_split_line(line)
        current_verse_lines.extend(split_lines)

    if current_verse_lines:
        verses.append(current_verse_lines)

    # Normalize: no line should carry more than 1 mid-clause separator (with
    # the short-clause exception) or exceed max_width_per_row characters.
    verses = _normalize_verse_lines(verses, max_width=max_width_per_row)

    # Each verse becomes one or more slides
    slides: list[SlideData] = []
    for verse in verses:
        for i in range(0, len(verse), max_lines):
            chunk = verse[i : i + max_lines]
            slides.append(SlideData(text="\n".join(chunk)))

    # For slides with few lines (<=4), split long lines that have 10+ chars
    # and multiple punctuation marks into two lines for better readability
    slides = [_expand_long_lines_if_sparse(s) for s in slides]

    # If max_slides is set and exceeded, re-distribute lines more aggressively
    if max_slides > 0 and len(slides) > max_slides:
        all_lines = []
        for s in slides:
            all_lines.extend(s.text.split("\n"))
        lines_per_slide = -(-len(all_lines) // max_slides)  # ceil division
        slides = []
        for i in range(0, len(all_lines), lines_per_slide):
            chunk = all_lines[i : i + lines_per_slide]
            slides.append(SlideData(text="\n".join(chunk)))

    return slides


def _enforce_max_width(line: str, max_width: int = _MAX_LINE_WIDTH_HARD) -> list[str]:
    """Recursively bisect a Chinese line until every piece has ≤ max_width
    characters. Always prefers splitting at punctuation (``_ZH_BREAK_CHARS``)
    over mid-character cuts: tries EVERY break position in order of
    closeness to the middle, and only falls back to a mid-character split
    when no break produces a valid non-empty bisection. This avoids ugly
    mid-word cuts whenever any useable punctuation exists.
    """
    if not contains_chinese(line) or len(line) <= max_width:
        return [line]

    mid = len(line) // 2
    break_positions = sorted(
        (i for i, c in enumerate(line) if c in _ZH_BREAK_CHARS),
        key=lambda p: abs(p - mid),
    )

    for pos in break_positions:
        left = line[: pos + 1].strip()
        right = line[pos + 1 :].strip()
        if left and right and len(left) < len(line) and len(right) < len(line):
            return _enforce_max_width(left, max_width) + _enforce_max_width(
                right, max_width
            )

    left = line[:mid].strip()
    right = line[mid:].strip()
    if left and right:
        return _enforce_max_width(left, max_width) + _enforce_max_width(
            right, max_width
        )

    return [line]


def _all_clauses_short(line: str, threshold: int = _SHORT_CLAUSE_ZH_THRESHOLD) -> bool:
    """True iff every Chinese clause between break chars has < threshold CJK chars.

    Used by the clause-count normalizer: if the line is e.g.
    "疲乏的，他賜能力，軟弱的，他加力量，" where each clause is only 3-4 chars,
    keeping two commas per output line is actually more readable than forcing
    every clause onto its own row.
    """
    pieces = re.split(f"[{re.escape(_CLAUSE_BREAK_CHARS)}]", line)
    for piece in pieces:
        cjk_count = sum(1 for c in piece if is_cjk_char(c))
        if cjk_count >= threshold:
            return False
    return True


def _normalize_clause_count(
    line: str,
    max_breaks: int = 1,
    max_width: int = _MAX_LINE_WIDTH_HARD,
) -> list[str]:
    """Force-split a line so each output piece has at most ``max_breaks``
    mid-clause separators AND at most ``max_width`` total characters.

    Short-clause exception for the clause rule: if every clause between
    breaks is under ``_SHORT_CLAUSE_ZH_THRESHOLD`` Chinese characters, allow
    up to 2 breaks per piece — those short clauses read fine two-per-line
    and splitting every 3-char phrase onto its own row is too fragmented.

    Sentence-end periods (``。`` / ``.``) don't count as clause separators.

    After clause splitting, every resulting piece is passed through
    ``_enforce_max_width`` so Chinese lines over ``max_width`` chars get
    further bisected at their middle break char (or mid-index fallback).
    """
    break_positions = [i for i, c in enumerate(line) if c in _CLAUSE_BREAK_CHARS]

    effective_max = max_breaks
    if _all_clauses_short(line):
        effective_max = max(max_breaks, 2)

    if len(break_positions) <= effective_max:
        return _enforce_max_width(line, max_width)

    chunks: list[str] = []
    chunk_start = 0
    breaks_in_chunk = 0
    for pos in break_positions:
        breaks_in_chunk += 1
        if breaks_in_chunk >= effective_max:
            piece = line[chunk_start : pos + 1].strip()
            if piece:
                chunks.append(piece)
            chunk_start = pos + 1
            breaks_in_chunk = 0
    if chunk_start < len(line):
        tail = line[chunk_start:].strip()
        if tail:
            chunks.append(tail)

    result: list[str] = []
    for chunk in (chunks or [line]):
        result.extend(_enforce_max_width(chunk, max_width))
    return result


def _split_to_n_pieces(line: str, n: int) -> list[str]:
    """Split ``line`` into exactly ``n`` pieces by recursively bisecting at
    the middle break char. Used to chop an English translation row into the
    same number of pieces that its Chinese counterpart expanded into — so
    each Chinese slide line gets exactly one corresponding English slide line.

    Falls back to splitting at the middle whitespace when there's no
    punctuation left, or returns the line unchanged padded with empty strings
    if even that fails.
    """
    if n <= 1 or not line.strip():
        return [line] if line else []

    parts = _split_at_middle_punctuation(line)
    if len(parts) < 2:
        space_positions = [i for i, c in enumerate(line) if c in " \t"]
        if space_positions:
            mid = len(line) // 2
            best = min(space_positions, key=lambda p: abs(p - mid))
            left = line[:best].strip()
            right = line[best + 1 :].strip()
            if left and right:
                parts = [left, right]

    if len(parts) < 2:
        return [line] + [""] * (n - 1)

    left_n = (n + 1) // 2
    right_n = n - left_n
    return _split_to_n_pieces(parts[0], left_n) + _split_to_n_pieces(parts[1], right_n)


def _normalize_verse_lines(
    verses: list[list[str]],
    max_breaks: int = 1,
    max_width: int = _MAX_LINE_WIDTH_HARD,
) -> list[list[str]]:
    """Apply ``_normalize_clause_count`` to every line in every verse."""
    return [
        [
            piece
            for line in verse
            for piece in _normalize_clause_count(line, max_breaks, max_width)
        ]
        for verse in verses
    ]


def _raw_verses(text: str) -> list[list[str]]:
    """Split text into verses (list of raw lines), using parse_lyrics' rules.

    Any blank line is a verse boundary; consecutive blanks collapse to one.
    """
    normalized = [ln.strip() for ln in text.strip().splitlines()]
    verses: list[list[str]] = []
    current: list[str] = []
    for line in normalized:
        if line == "":
            if current:
                verses.append(current)
                current = []
            continue
        current.append(line)
    if current:
        verses.append(current)
    return verses


def _expand_to_match(lines: list[str], target: int) -> list[str]:
    """Progressively split the longest line with a mid-clause break at its
    middle punctuation until the list reaches ``target`` length. Works on
    any language — the character class includes English commas/semicolons
    as well. Stops early when no remaining line is splittable.
    """
    current = list(lines)
    safety = 32
    while len(current) < target and safety > 0:
        safety -= 1
        idx = -1
        longest = 0
        for i, ln in enumerate(current):
            if not any(c in _ZH_BREAK_CHARS for c in ln):
                continue
            if len(ln) > longest:
                longest = len(ln)
                idx = i
        if idx == -1:
            break
        parts = _split_at_middle_punctuation(current[idx])
        if len(parts) < 2:
            break
        current = current[:idx] + parts + current[idx + 1:]
    return current


def _align_bilingual_verse(
    p_lines: list[str], s_lines: list[str]
) -> tuple[list[str], list[str]]:
    """Equalize line counts so 1:1 pairing holds, by splitting the fewer-line
    side at middle punctuation. Whichever side is Chinese gets its longest
    lines split first; English can't be safely split the same way so we leave
    it alone."""
    if len(p_lines) == len(s_lines):
        return p_lines, s_lines
    if len(p_lines) < len(s_lines):
        return _expand_to_match(p_lines, len(s_lines)), s_lines
    return p_lines, _expand_to_match(s_lines, len(p_lines))


def _normalize_with_origin(
    verse_lines: list[str],
) -> list[tuple[str, int]]:
    """Normalize each raw line while tracking its original index in the verse.

    Returns pieces as (piece_text, origin_line_index) so downstream pairing
    can group pieces from the same raw user line together.
    """
    result: list[tuple[str, int]] = []
    for orig_idx, line in enumerate(verse_lines):
        for piece in _normalize_clause_count(line):
            result.append((piece, orig_idx))
    return result


def _interleave_by_origin(
    p_pieces: list[tuple[str, int]],
    s_pieces: list[tuple[str, int]],
) -> list[str]:
    """Interleave clauses, grouping by original line index so drift stays local.

    If raw zh line ``k`` expands to 4 clauses and raw en line ``k`` expands to
    only 2 clauses (semantic density mismatch — common when ZH is more verbose
    than EN), the 2 unpaired zh clauses stay inside this group instead of
    cascading and breaking the pairings for every subsequent line.
    """
    p_by_idx: dict[int, list[str]] = {}
    for piece, idx in p_pieces:
        p_by_idx.setdefault(idx, []).append(piece)
    s_by_idx: dict[int, list[str]] = {}
    for piece, idx in s_pieces:
        s_by_idx.setdefault(idx, []).append(piece)

    all_indices = sorted(set(p_by_idx.keys()) | set(s_by_idx.keys()))
    merged: list[str] = []
    for idx in all_indices:
        p_group = p_by_idx.get(idx, [])
        s_group = s_by_idx.get(idx, [])
        for j in range(max(len(p_group), len(s_group))):
            if j < len(p_group):
                merged.append(p_group[j])
            if j < len(s_group):
                merged.append(s_group[j])
    return merged


def parse_lyrics_bilingual(
    primary: str,
    secondary: str,
    mode: str = "interleaved",
    max_lines: int = settings.PREFERRED_LINES_PER_SLIDE,
    max_slides: int = 0,
    max_width_per_row: int = _MAX_LINE_WIDTH_HARD,
) -> list[SlideData]:
    """Parse a primary + secondary lyrics pair into aligned slides.

    Pipeline (interleaved mode):
      * split both sides into verses by blank-line boundaries
      * pair raw line ``k`` of primary with raw line ``k`` of secondary
      * normalize the primary (Chinese) line into clauses — max 1 comma per
        piece, but allow 2 if every clause between commas is short (< 5 CJK)
      * split the paired secondary (English) line into exactly the same
        number of pieces via ``_split_to_n_pieces`` — so each Chinese slide
        line gets one English slide line at the same position, regardless of
        how many commas the English actually had
      * interleave inside the group (zh0, en0, zh1, en1, ...)
    """
    p_verses = _raw_verses(primary)
    s_verses = _raw_verses(secondary)
    n = max(len(p_verses), len(s_verses))

    merged_verses: list[list[str]] = []
    for i in range(n):
        p_raw = p_verses[i] if i < len(p_verses) else []
        s_raw = s_verses[i] if i < len(s_verses) else []

        if mode == "stacked":
            p_all = [
                pc
                for line in p_raw
                for pc in _normalize_clause_count(line, max_width=max_width_per_row)
            ]
            s_all = [
                pc
                for line in s_raw
                for pc in _normalize_clause_count(line, max_width=max_width_per_row)
            ]
            if p_all and s_all:
                merged_verses.append(p_all + [""] + s_all)
            elif p_all:
                merged_verses.append(p_all)
            elif s_all:
                merged_verses.append(s_all)
            continue

        merged: list[str] = []
        lines_in_verse = max(len(p_raw), len(s_raw))
        for idx in range(lines_in_verse):
            p_line = p_raw[idx] if idx < len(p_raw) else ""
            s_line = s_raw[idx] if idx < len(s_raw) else ""

            p_pieces = (
                _normalize_clause_count(p_line, max_width=max_width_per_row)
                if p_line.strip()
                else []
            )
            target = len(p_pieces)

            if s_line.strip() and target > 0:
                s_pieces = [
                    p.strip() for p in _split_to_n_pieces(s_line, target) if p.strip()
                ]
            elif s_line.strip():
                s_pieces = [s_line]
            else:
                s_pieces = []

            for j in range(max(len(p_pieces), len(s_pieces))):
                if j < len(p_pieces):
                    merged.append(p_pieces[j])
                if j < len(s_pieces):
                    merged.append(s_pieces[j])

        if merged:
            merged_verses.append(merged)

    slides: list[SlideData] = []
    for verse in merged_verses:
        if not verse:
            continue
        for i in range(0, len(verse), max_lines):
            chunk = verse[i : i + max_lines]
            slides.append(SlideData(text="\n".join(chunk)))

    if max_slides > 0 and len(slides) > max_slides:
        all_lines: list[str] = []
        for s in slides:
            all_lines.extend(s.text.split("\n"))
        lines_per_slide = -(-len(all_lines) // max_slides)
        slides = []
        for i in range(0, len(all_lines), lines_per_slide):
            chunk = all_lines[i : i + lines_per_slide]
            slides.append(SlideData(text="\n".join(chunk)))

    return slides


