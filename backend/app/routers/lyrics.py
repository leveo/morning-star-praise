# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.models import (
    DocxLyricsExportRequest,
    DocxLyricsImportResponse,
    LyricsParseRequest,
    LyricsParseResponse,
)
from app.services import docx_lyrics_service
from app.services.lyrics_service import parse_lyrics, parse_lyrics_bilingual
from app.services.chinese_service import convert_chinese
from app.services.translate_service import translate_lyrics_to_english, translate_lyrics_to_chinese

router = APIRouter()

_MAX_DOCX_BYTES = 10 * 1024 * 1024


class ConvertRequest(BaseModel):
    text: str
    target: str  # "simplified" or "traditional"


class ConvertResponse(BaseModel):
    text: str


class BilingualLyricsRequest(BaseModel):
    primary_text: str
    secondary_text: str
    mode: str = "interleaved"  # "interleaved" | "stacked"
    max_lines_per_slide: int = 6
    max_slides: int = 0
    max_width_per_row: int = 12


@router.post("/import-docx", response_model=DocxLyricsImportResponse)
async def import_docx(file: UploadFile = File(...)):
    filename = file.filename or "lyrics.docx"
    content = await file.read(_MAX_DOCX_BYTES + 1)
    if len(content) > _MAX_DOCX_BYTES:
        raise HTTPException(status_code=400, detail="DOCX 不能超过 10 MB")
    try:
        return docx_lyrics_service.parse_docx(content, filename)
    except docx_lyrics_service.DocxLyricsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/export-docx")
def export_docx(request: DocxLyricsExportRequest):
    try:
        content, filename = docx_lyrics_service.build_docx(request)
    except docx_lyrics_service.DocxLyricsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    encoded = quote(filename)
    return Response(
        content=content,
        media_type=docx_lyrics_service.DOCX_MIME,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


@router.post("/parse", response_model=LyricsParseResponse)
async def parse_lyrics_endpoint(request: LyricsParseRequest):
    slides = parse_lyrics(
        request.text,
        max_lines=request.max_lines_per_slide,
        max_slides=request.max_slides,
        max_width_per_row=request.max_width_per_row,
    )
    return LyricsParseResponse(slides=slides, total_slides=len(slides))


@router.post("/parse-bilingual", response_model=LyricsParseResponse)
async def parse_lyrics_bilingual_endpoint(request: BilingualLyricsRequest):
    slides = parse_lyrics_bilingual(
        primary=request.primary_text,
        secondary=request.secondary_text,
        mode=request.mode,
        max_lines=request.max_lines_per_slide,
        max_slides=request.max_slides,
        max_width_per_row=request.max_width_per_row,
    )
    return LyricsParseResponse(slides=slides, total_slides=len(slides))


@router.post("/convert", response_model=ConvertResponse)
async def convert_chinese_endpoint(request: ConvertRequest):
    result = convert_chinese(request.text, request.target)
    return ConvertResponse(text=result)


class TranslateRequest(BaseModel):
    text: str
    target: str = "en"
    title: str = ""
    composer: str = ""
    session_id: str = ""


@router.post("/translate", response_model=ConvertResponse)
def translate_lyrics(request: TranslateRequest):
    from fastapi import HTTPException
    try:
        if request.target == "en":
            result = translate_lyrics_to_english(request.text, request.title, request.composer, session_id=request.session_id)
        else:
            variant = "simplified" if request.target == "zh-hans" else "traditional"
            result = translate_lyrics_to_chinese(request.text, variant, request.title, request.composer, session_id=request.session_id)
        return ConvertResponse(text=result)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Translation failed")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")
