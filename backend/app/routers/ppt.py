# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
import re
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.config import settings
from app.models import PPTGenerateRequest, PPTGenerateResponse
from app.services import library_service
from app.services.background_service import assign_backgrounds, list_default_backgrounds
from app.services.ppt_service import generate_pptx

router = APIRouter()


def _resolve_bg_url(url: str) -> Path | None:
    """Resolve a background URL to a local file path.

    Handles:
    - /static/backgrounds/xxx.jpg → BACKGROUNDS_DIR/xxx.jpg
    - /api/youtube/frame/work_dir/filename → UPLOADS_DIR/work_dir/filename
    """
    if not url:
        return None

    m = re.match(r'/static/backgrounds/(.+)', url)
    if m:
        return settings.BACKGROUNDS_DIR / m.group(1)

    m = re.match(r'/api/youtube/frame/([^/]+)/(.+)', url)
    if m:
        return settings.UPLOADS_DIR / m.group(1) / m.group(2)

    return None


@router.post("/generate", response_model=PPTGenerateResponse)
def generate_ppt(request: PPTGenerateRequest):
    slides = request.slides
    if not slides:
        return PPTGenerateResponse(filename="", slides_preview=[])

    # Check if slides have per-slide background URLs (YouTube screenshot mode)
    has_custom_bgs = any(s.background_url for s in slides)

    if has_custom_bgs:
        # Use frame screenshots as backgrounds
        # First bg for title slide (use first frame or default)
        title_bg = _resolve_bg_url(slides[0].background_url) if slides[0].background_url else None
        if not title_bg:
            default_bgs = assign_backgrounds(num_slides=1)
            title_bg = default_bgs[0] if default_bgs else None

        bg_paths = [title_bg]
        for slide in slides:
            bg_paths.append(_resolve_bg_url(slide.background_url))
    else:
        bg_paths = assign_backgrounds(
            num_slides=len(slides) + 1,
            background_ids=request.background_ids,
        )

    # Optional sheet-music crops per slide.
    sheet_image_paths: list[Path | None] | None = None
    if request.sheet_session_id and request.sheet_crop_names:
        from app.routers.sheet import SHEET_ROOT

        sheet_dir = (SHEET_ROOT / request.sheet_session_id).resolve()
        if not sheet_dir.is_relative_to(SHEET_ROOT.resolve()):
            sheet_image_paths = None
        else:
            sheet_image_paths = []
            for name in request.sheet_crop_names:
                if not name or "/" in name or "\\" in name:
                    sheet_image_paths.append(None)
                    continue
                p = sheet_dir / name
                sheet_image_paths.append(p if p.exists() else None)

    filename = generate_pptx(
        title=request.title,
        slides=slides,
        language=request.language,
        background_paths=bg_paths,
        composer=request.composer,
        show_page_numbers=request.show_page_numbers,
        primary_font_size=request.primary_font_size,
        secondary_font_size=request.secondary_font_size,
        line_spacing_multiplier=request.line_spacing_multiplier,
        padding_style=request.padding_style,
        sheet_image_paths=sheet_image_paths,
    )

    # Build preview data
    all_bgs = list_default_backgrounds()
    bg_url_map = {bg.filename: bg.url for bg in all_bgs}

    slides_preview = []
    for i, slide in enumerate(slides):
        if slide.background_url:
            bg_url = slide.background_url
        else:
            bg_idx = (i + 1) % len(bg_paths) if bg_paths else 0
            bg_path = bg_paths[bg_idx] if bg_paths else None
            bg_url = bg_url_map.get(bg_path.name, "") if bg_path else ""
        preview: dict = {"text": slide.text, "background_url": bg_url}
        # Match ppt_service's 1:1 indexing into sheet_crop_names (frontend
        # already cycled to produce one name per slide when there are fewer
        # crops than slides).
        if (
            request.sheet_session_id
            and request.sheet_crop_names
            and i < len(request.sheet_crop_names)
        ):
            crop_name = request.sheet_crop_names[i]
            if crop_name and "/" not in crop_name and "\\" not in crop_name:
                preview["sheet_image_url"] = (
                    f"/api/sheet/preview/{request.sheet_session_id}/{crop_name}"
                )
        slides_preview.append(preview)

    if request.source_page in ("lyrics", "youtube", "ocr") and filename:
        library_service.record_item(
            item_type="ppt",
            source_page=request.source_page,  # type: ignore[arg-type]
            title=request.title,
            language=request.language,
            filename=filename,
            analysis_id=None,
            input_snapshot=request.input_snapshot or {},
        )

    return PPTGenerateResponse(filename=filename, slides_preview=slides_preview)


@router.get("/download/{filename}")
async def download_ppt(filename: str):
    from fastapi import HTTPException
    file_path = (settings.OUTPUT_DIR / filename).resolve()
    if not file_path.is_relative_to(settings.OUTPUT_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
