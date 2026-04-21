from typing import Literal

from pydantic import BaseModel

PaddingStyle = Literal["dark", "light"]


class SlideData(BaseModel):
    text: str
    background_id: int | None = None
    background_url: str | None = None  # for YouTube frame screenshots
    font_size: int | None = None


class LyricsParseRequest(BaseModel):
    text: str
    language: str = "en"
    max_lines_per_slide: int = 6
    max_slides: int = 0  # 0 = no limit
    max_width_per_row: int = 12


class LyricsParseResponse(BaseModel):
    slides: list[SlideData]
    total_slides: int


class PPTGenerateRequest(BaseModel):
    title: str
    composer: str = ""
    slides: list[SlideData]
    language: str = "en"
    background_ids: list[int] | None = None
    show_page_numbers: bool = False
    primary_font_size: int | None = None
    secondary_font_size: int | None = None
    line_spacing_multiplier: float | None = None
    # 'dark' = black semi-transparent overlay + white text (default);
    # 'light' = white semi-transparent overlay + black text.
    padding_style: PaddingStyle = "dark"
    # When set, generate the "sheet music + lyrics" layout: each slide
    # carries the pre-cropped PNG produced by /api/sheet/analyze (top 55%)
    # plus a draggable text box with the lyrics (bottom 45%) on white.
    # ``sheet_session_id`` identifies the upload folder.
    # ``sheet_crop_names[i]`` is the crop filename for slide i (same order
    # as ``slides``); a shorter list means later slides fall back to the
    # plain background+overlay layout.
    sheet_session_id: str | None = None
    sheet_crop_names: list[str] | None = None
    # Library / history metadata. Optional — when provided, the successful
    # generation is recorded in ppt_library so the Songs Library page can
    # restore this session later. ``source_page`` identifies which frontend
    # page produced the request ('lyrics' | 'youtube' | 'ocr'); ``input_snapshot``
    # is an opaque JSON blob of the form fields the page wants to rehydrate.
    source_page: str | None = None
    input_snapshot: dict | None = None


class PPTGenerateResponse(BaseModel):
    filename: str
    slides_preview: list[dict]  # [{text, background_url}] for frontend preview


class BackgroundInfo(BaseModel):
    id: int
    filename: str
    name: str
    category: str
    url: str
    is_default: bool = True
    tags: list[str] = []
    media_type: str = "image"  # "image" | "video"
