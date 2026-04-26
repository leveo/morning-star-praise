# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
import base64
import re
from pathlib import Path

from PIL import Image

from app.services.chinese_service import contains_chinese, is_cjk_char


def _image_to_base64(image_path: Path) -> str:
    """Convert image to base64 string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _get_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".pdf": "application/pdf",
    }.get(suffix, "image/jpeg")


def _pdf_to_images(pdf_path: Path) -> list[Path]:
    """Convert PDF pages to images using pdf2image (poppler) or Pillow fallback."""
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(str(pdf_path), dpi=150)
    except ImportError:
        images = [Image.open(pdf_path)]
    except Exception as exc:
        # pdf2image can raise PDFInfoNotInstalledError, PDFPageCountError, or
        # PDFSyntaxError. Re-raise with a human-readable message so the user
        # knows whether to install poppler or replace a corrupt PDF.
        raise RuntimeError(
            f"PDF could not be rasterized: {exc}. "
            "Check that poppler is installed (brew install poppler) "
            "and the PDF is not corrupt."
        ) from exc

    if not images:
        raise RuntimeError("PDF rasterized to zero pages — is the file empty?")

    output_paths = []
    for i, img in enumerate(images):
        out_path = pdf_path.parent / f"page_{i+1}.jpg"
        img.save(str(out_path), "JPEG", quality=85)
        output_paths.append(out_path)
    return output_paths


# A line ending in any of these is a phrase boundary; anything else is
# treated as a mid-phrase wrap from sheet music layout and joined to the
# next line. Commas count — short clauses are valid boundaries.
_PHRASE_TERMINATORS = set(".,!?;:…。，、！？；：")

_LABEL_RE = re.compile(
    r"^\s*(?:verse|chorus|bridge|refrain|pre[\s-]?chorus|intro|outro|interlude|"
    r"副歌|主歌|間奏|前奏|尾奏|第[一二三四五六七八九十\d]+段)"
    r"(?:\s*\d+)?\s*[:：]?\s*$",
    re.IGNORECASE,
)


def _merge_wrapped_lines(text: str) -> str:
    """Join consecutive sheet-music lines that share a single phrase.

    Sheet music often breaks one lyric line across multiple staves for
    musical phrasing, and Gemini preserves those breaks verbatim. We stitch
    them back together so each output line is a complete short phrase —
    bounded by sentence punctuation, a section label, or a blank line.
    """
    merged: list[str] = []
    buf = ""

    def flush():
        nonlocal buf
        if buf:
            merged.append(buf)
            buf = ""

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            flush()
            if merged and merged[-1] != "":
                merged.append("")
            continue
        if _LABEL_RE.match(line):
            flush()
            merged.append(line)
            continue
        if not buf:
            buf = line
        else:
            sep = "" if (is_cjk_char(buf[-1]) or is_cjk_char(line[0])) else " "
            buf += sep + line
        if buf[-1] in _PHRASE_TERMINATORS:
            flush()

    flush()
    while merged and merged[-1] == "":
        merged.pop()
    return "\n".join(merged)


OCR_PROMPT = """Extract the song lyrics from this sheet music image as strict JSON.

Hymnals and choral scores typically print multiple VERSES under the same set
of staves — e.g. rows labelled 1/2/3/4 stack under each staff system, one
row per verse. Your job is to untangle that back into verses where each
verse holds the lines it would sing across the staff systems in order.

Output format — output ONLY this JSON object, no markdown fences, no prose:

{
  "language": "zh-hans" | "zh-hant" | "en",
  "verses": [
    {"number": 1, "lines": ["line for verse 1 under system 1", "line for verse 1 under system 2", ...]},
    {"number": 2, "lines": ["line for verse 2 under system 1", "line for verse 2 under system 2", ...]}
  ]
}

Rules:
- One "line" = one staff system's worth of lyrics for that verse.
- IGNORE musical notation, chord symbols (Am/G/C/D7 etc.), clefs, time/key signatures, measure numbers, dynamics.
- If no verse numbering is visible, put all lyrics into a single verse (number 1).
- Preserve original CJK characters exactly; do NOT add pinyin or romanization.
- Exclude the song title, composer credits, copyright lines, and psalm citations.
- "language" is your best guess at the dominant lyric language (use "zh-hans" for simplified, "zh-hant" for traditional, "en" for English-only)."""


def _parse_structured_lyrics(raw: str) -> dict | None:
    """Try to coerce the LLM's JSON response into our verses schema. Returns
    None on any parse failure so callers can fall back to flat-text mode.

    LLMs sometimes wrap the JSON in ```json fences or add leading prose; we
    strip both before parsing.
    """
    import json
    import re

    stripped = raw.strip()
    # Peel common wrappers: ```json ... ```, ``` ... ```, leading "JSON:" etc.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.DOTALL)
    if fence:
        stripped = fence.group(1).strip()
    # First well-formed { ... } span, in case the model added prose prefix.
    brace = re.search(r"\{.*\}", stripped, re.DOTALL)
    if brace:
        stripped = brace.group(0)
    try:
        data = json.loads(stripped)
    except Exception:
        return None
    verses = data.get("verses") if isinstance(data, dict) else None
    if not isinstance(verses, list) or not verses:
        return None
    clean: list[dict] = []
    for i, v in enumerate(verses):
        if not isinstance(v, dict):
            continue
        lines = v.get("lines")
        if not isinstance(lines, list):
            continue
        lines_clean = [str(ln).strip() for ln in lines if str(ln).strip()]
        if not lines_clean:
            continue
        clean.append({"number": int(v.get("number") or (i + 1)), "lines": lines_clean})
    if not clean:
        return None
    lang = data.get("language") if isinstance(data.get("language"), str) else None
    return {"verses": clean, "language": lang}


def _flatten_verses_to_lyrics(verses: list[dict]) -> str:
    """Backward-compat: render the verses list as plain labelled text the
    existing parse_lyrics path can digest (for clients that ignore the
    ``structured`` field)."""
    sections: list[str] = []
    for v in verses:
        header = f"Verse {v['number']}:"
        body = "\n".join(v["lines"])
        sections.append(f"{header}\n{body}")
    return "\n\n".join(sections)


def extract_lyrics_from_image(image_path: Path, session_id: str = "") -> dict:
    """Extract lyrics from a sheet music image via the configured vision LLM.

    Returns {lyrics, language, structured?} — ``structured`` is a
    ``{verses: [{number, lines}]}`` dict when the LLM returned parseable JSON.
    """
    from app.services import llm_service

    mime_type = _get_mime_type(image_path)
    image_bytes = image_path.read_bytes()
    text = llm_service.generate_from_image(
        image_bytes, mime_type, OCR_PROMPT,
        session_id=session_id, action="ocr",
    )

    structured = _parse_structured_lyrics(text)
    if structured:
        lyrics = _flatten_verses_to_lyrics(structured["verses"])
        language = structured["language"] or (
            "zh-hans" if contains_chinese(lyrics) else "en"
        )
        return {
            "lyrics": lyrics,
            "language": language,
            "structured": {"verses": structured["verses"]},
        }

    # LLM didn't produce parseable JSON — likely a less-capable model.
    # Fall back to the original behaviour so the feature still works.
    lyrics = _merge_wrapped_lines(text)
    language = "zh-hans" if contains_chinese(lyrics) else "en"
    return {"lyrics": lyrics, "language": language}


def extract_lyrics_from_file(file_path: Path, session_id: str = "") -> dict:
    if file_path.suffix.lower() == ".pdf":
        page_images = _pdf_to_images(file_path)
        all_lyrics = []
        language = "en"
        merged_verses: list[dict] = []

        for idx, page_path in enumerate(page_images, start=1):
            try:
                result = extract_lyrics_from_image(page_path, session_id=session_id)
            except Exception as exc:
                raise RuntimeError(
                    f"Page {idx} of {len(page_images)} failed: {exc}"
                ) from exc
            finally:
                page_path.unlink(missing_ok=True)
            all_lyrics.append(result["lyrics"])
            if result["language"].startswith("zh"):
                language = result["language"]
            # Concat verse lists across pages. Renumber so verse-1 on page 2
            # becomes the next available number instead of colliding with
            # page-1's verse 1.
            page_struct = (result.get("structured") or {}).get("verses") or []
            offset = merged_verses[-1]["number"] if merged_verses else 0
            for i, v in enumerate(page_struct, start=1):
                merged_verses.append({"number": offset + i, "lines": list(v["lines"])})

        payload = {
            "lyrics": "\n\n".join(all_lyrics),
            "language": language,
            "pages": len(page_images),
        }
        if merged_verses:
            payload["structured"] = {"verses": merged_verses}
        return payload
    else:
        result = extract_lyrics_from_image(file_path, session_id=session_id)
        result["pages"] = 1
        return result
