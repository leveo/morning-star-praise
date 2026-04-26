# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Songs Library / history endpoints.

GET    /api/library            — list past PPT + video generations
GET    /api/library/{id}       — full record + file_exists / analysis_exists flags
DELETE /api/library/{id}       — remove a record (does not delete the output file)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.services import library_service

router = APIRouter()


@router.get("")
async def list_library(
    search: str = Query(default="", description="Title substring"),
    item_type: str = Query(default="", description="'ppt' or 'video'"),
):
    t: library_service.ItemType | None = None
    if item_type in ("ppt", "video"):
        t = item_type  # type: ignore[assignment]
    return library_service.list_items(search=search, item_type=t)


@router.get("/{item_id}")
async def get_library_item(item_id: int):
    item = library_service.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    # Flag freshness so the frontend can gray out the Download button when the
    # output file has been manually removed, or disable the editor when the
    # analysis cache is gone.
    file_exists = False
    if item.get("filename"):
        file_exists = (settings.OUTPUT_DIR / item["filename"]).exists()
    analysis_exists = False
    if item.get("analysis_id"):
        analysis_exists = (
            settings.VIDEO_WORK_DIR / "analyses" / item["analysis_id"]
        ).exists()

    return {
        **item,
        "file_exists": file_exists,
        "analysis_exists": analysis_exists,
    }


@router.delete("/{item_id}")
async def delete_library_item(item_id: int):
    ok = library_service.delete_item(item_id)
    if not ok:
        raise HTTPException(status_code=503, detail="Database not available")
    return {"ok": True}
