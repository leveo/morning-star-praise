# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
from opencc import OpenCC


# Pre-initialize converters
_s2t = OpenCC('s2t')
_t2s = OpenCC('t2s')
_s2tw = OpenCC('s2tw')
_tw2s = OpenCC('tw2s')


def is_cjk_char(ch: str) -> bool:
    """True if ``ch`` is a CJK Unified Ideograph (U+4E00–U+9FFF)."""
    return "\u4e00" <= ch <= "\u9fff"


def contains_chinese(text: str) -> bool:
    """True if any character in ``text`` is a CJK Unified Ideograph."""
    return any(is_cjk_char(c) for c in text)


def convert_chinese(text: str, target: str) -> str:
    """Convert Chinese text between Simplified and Traditional.

    Args:
        text: Input text
        target: "simplified" or "traditional"

    Returns:
        Converted text
    """
    if target == "simplified":
        return _tw2s.convert(text)
    elif target == "traditional":
        return _s2tw.convert(text)
    return text


def detect_chinese_variant(text: str) -> str | None:
    """Detect if text is Simplified or Traditional Chinese.

    Returns: "zh-hans", "zh-hant", or None
    """
    simplified_count = 0
    traditional_count = 0

    for char in text:
        if '\u4e00' <= char <= '\u9fff':
            # Convert to traditional and check if it changes
            trad = _s2t.convert(char)
            simp = _t2s.convert(char)
            if trad != char:
                simplified_count += 1
            if simp != char:
                traditional_count += 1

    if simplified_count == 0 and traditional_count == 0:
        return None

    if simplified_count > traditional_count:
        return "zh-hans"
    elif traditional_count > simplified_count:
        return "zh-hant"
    return "zh-hans"
