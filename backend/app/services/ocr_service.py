import base64
import re
from pathlib import Path

from google import genai
from PIL import Image

from app.config import settings


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
    """Convert PDF pages to images using Pillow (for single-page) or pdf2image."""
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(str(pdf_path), dpi=150)
    except ImportError:
        # Fallback: try Pillow for simple PDFs
        images = [Image.open(pdf_path)]

    output_paths = []
    for i, img in enumerate(images):
        out_path = pdf_path.parent / f"page_{i+1}.jpg"
        img.save(str(out_path), "JPEG", quality=85)
        output_paths.append(out_path)
    return output_paths


# Characters that mark the end of a complete short phrase. A line ending in
# any of these stays on its own; anything else (no punctuation at all) is
# treated as a mid-phrase wrap from the sheet music layout and is joined to
# the next line. Commas count — the user asked for short phrases, so a
# comma-bounded clause is a valid boundary.
_PHRASE_TERMINATORS = set(".,!?;:…。，、！？；：")

# Section labels Gemini is told to emit (see OCR_PROMPT). A line that is
# *exactly* one of these — possibly followed by a number and/or a colon —
# is treated as a flush boundary even if the colon was dropped.
_LABEL_RE = re.compile(
    r"^\s*(?:verse|chorus|bridge|refrain|pre[\s-]?chorus|intro|outro|interlude|"
    r"副歌|主歌|間奏|前奏|尾奏|第[一二三四五六七八九十\d]+段)"
    r"(?:\s*\d+)?\s*[:：]?\s*$",
    re.IGNORECASE,
)


def _is_cjk(ch: str) -> bool:
    return "\u4e00" <= ch <= "\u9fff"


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
            sep = "" if (_is_cjk(buf[-1]) or _is_cjk(line[0])) else " "
            buf += sep + line
        if buf[-1] in _PHRASE_TERMINATORS:
            flush()

    flush()
    while merged and merged[-1] == "":
        merged.pop()
    return "\n".join(merged)


OCR_PROMPT = """Extract only the song lyrics from this sheet music image.

Rules:
- Return ONLY the lyrics text, line by line
- Preserve verse/chorus/bridge structure (separate sections with a blank line)
- IGNORE all musical notation: notes, rests, time signatures, key signatures, chord symbols (Am, G, C, etc.), measure numbers, dynamics markings
- If the text is in Chinese, preserve the exact original characters (do not add pinyin)
- If there are verse numbers (1, 2, 3...), include them as labels like "Verse 1:", "Verse 2:"
- Do NOT include the song title unless it's clearly separate from the lyrics
- Output clean text only, no markdown formatting"""


def extract_lyrics_from_image(image_path: Path, session_id: str = "") -> dict:
    """Extract lyrics from a sheet music image using Gemini Vision.

    Returns: {lyrics: str, language: str}
    """
    client = genai.Client(api_key=settings.GOOGLE_API_KEY)

    mime_type = _get_mime_type(image_path)
    image_bytes = image_path.read_bytes()

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode()}},
                    {"text": OCR_PROMPT},
                ],
            }
        ],
    )

    if session_id:
        from app.services.usage_tracker import track_call
        track_call(session_id, "ocr", response)

    lyrics = _merge_wrapped_lines(response.text.strip())

    has_chinese = any("\u4e00" <= c <= "\u9fff" for c in lyrics)
    language = "zh-hans" if has_chinese else "en"

    return {"lyrics": lyrics, "language": language}


def extract_lyrics_from_file(file_path: Path, session_id: str = "") -> dict:
    if file_path.suffix.lower() == ".pdf":
        page_images = _pdf_to_images(file_path)
        all_lyrics = []
        language = "en"

        for page_path in page_images:
            result = extract_lyrics_from_image(page_path, session_id=session_id)
            all_lyrics.append(result["lyrics"])
            if result["language"].startswith("zh"):
                language = result["language"]
            page_path.unlink(missing_ok=True)

        return {
            "lyrics": "\n\n".join(all_lyrics),
            "language": language,
            "pages": len(page_images),
        }
    else:
        result = extract_lyrics_from_image(file_path, session_id=session_id)
        result["pages"] = 1
        return result
