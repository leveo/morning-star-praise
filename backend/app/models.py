from pydantic import BaseModel


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
