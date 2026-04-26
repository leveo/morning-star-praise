# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
"""Sheet music upload + analysis.

POST /api/sheet/upload   — accept image/PDF, return a session_id
POST /api/sheet/analyze  — given session_id + lyric chunk count, run OMR,
                           return per-chunk crop-region descriptors + preview
                           thumbnail URLs the frontend can show to the user

Crop PNGs are written to ``uploads/sheet/<session_id>/`` and served back
via ``GET /api/sheet/preview/{session_id}/{name}``. PPT generation reads the
same directory to avoid re-cropping.
"""
from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from app.config import settings
from app.services import sheet_music_service

logger = logging.getLogger(__name__)
router = APIRouter()

SHEET_ROOT = settings.UPLOADS_DIR / "sheet"
SHEET_ROOT.mkdir(parents=True, exist_ok=True)

_ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
_MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # 30 MB covers a multi-page hymn PDF


def _session_dir(session_id: str) -> Path:
    if not session_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid session_id")
    resolved = (SHEET_ROOT / session_id).resolve()
    if not resolved.is_relative_to(SHEET_ROOT.resolve()):
        raise HTTPException(status_code=400, detail="Invalid session_id")
    return resolved


@router.post("/upload")
async def upload_sheet(file: UploadFile = File(...)):
    filename = file.filename or "sheet.bin"
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(_ALLOWED_SUFFIXES))}",
        )

    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Sheet too large. Max {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )

    session_id = uuid.uuid4().hex
    d = _session_dir(session_id)
    d.mkdir(parents=True, exist_ok=True)
    src = d / f"upload{suffix}"
    src.write_bytes(content)
    return {"session_id": session_id, "filename": filename}


@router.post("/analyze")
async def analyze_sheet(
    session_id: str = Form(...),
    num_chunks: int = Form(...),
    mode: Literal["rebuild", "crop", "crop_llm"] = Form("rebuild"),
):
    d = _session_dir(session_id)
    uploads = list(d.glob("upload.*"))
    if not uploads:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    if num_chunks <= 0:
        raise HTTPException(status_code=400, detail="num_chunks must be positive")

    try:
        pages, regions, system_count = sheet_music_service.analyze(
            uploads[0], num_chunks, mode=mode,
        )
    except Exception as exc:
        logger.exception("Sheet analyze failed")
        # Include exception type so frontend can tell "OMR model missing" from
        # "OMR crashed on the image" without parsing a stack.
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")

    # Materialize one crop PNG per region so the frontend can preview and PPT
    # generation can slot it straight in. Filenames encode the chunk index.
    crops: list[dict] = []
    for i, region in enumerate(regions):
        out = d / f"crop_{i:02d}.png"
        sheet_music_service.crop_region(pages[region.page], region, out)
        crops.append({
            "chunk_idx": i,
            "filename": out.name,
            "url": f"/api/sheet/preview/{session_id}/{out.name}",
            "page": region.page,
            "region": {
                "y_top": region.y_top,
                "y_bottom": region.y_bottom,
                "x_left": region.x_left,
                "x_right": region.x_right,
            },
        })

    return {
        "session_id": session_id,
        "pages": len(pages),
        # Distinct visual staff systems detected on the sheet (before cycling
        # across chunks). ``len(crops)`` can be larger than this when we cycle
        # the same system across many slides.
        "system_count": system_count,
        "detected_staffs": len(regions),  # kept for back-compat
        "crops": crops,
    }


@router.get("/preview/{session_id}/{name}")
def get_preview(session_id: str, name: str):
    d = _session_dir(session_id)
    # Defense in depth: ``name`` must be a basename, no traversal.
    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid name")
    path = d / name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Preview not found")
    return FileResponse(path, media_type="image/png", filename=name)


@router.delete("/{session_id}")
def delete_session(session_id: str):
    d = _session_dir(session_id)
    if d.exists():
        # Drop cached OMR entries keyed by the paths we're about to remove,
        # so a future session that happens to pick the same path doesn't
        # return stale crops.
        prefix = str(d.resolve())
        stale = [k for k in sheet_music_service._OMR_CACHE if k[0].startswith(prefix)]
        for k in stale:
            sheet_music_service._OMR_CACHE.pop(k, None)
        shutil.rmtree(d, ignore_errors=True)
    return {"ok": True}
