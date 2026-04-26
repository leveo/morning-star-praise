# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
"""Library / history — persistent record of every successful PPT or video render.

Every successful /api/ppt/generate and /api/videos/create or /rerender call
writes a row here so the user can revisit past outputs from the Songs Library
page. Records are never expired automatically; the user deletes them explicitly.

Requires PostgreSQL (``DATABASE_URL`` set). Without a database the feature is
silently disabled — ``record_item`` becomes a no-op, and ``list_items`` returns
an empty list so the frontend can render a sensible empty state.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

ItemType = Literal["ppt", "video"]
SourcePage = Literal["lyrics", "youtube", "ocr", "worship-video"]


def _db_available() -> bool:
    try:
        from app.database import DATABASE_URL  # noqa: F401

        return bool(DATABASE_URL)
    except Exception:
        return False


def record_item(
    *,
    item_type: ItemType,
    source_page: SourcePage,
    title: str,
    language: str | None,
    filename: str | None,
    analysis_id: str | None,
    input_snapshot: dict[str, Any],
) -> int | None:
    """Insert a new history row. Returns the row id, or None if the DB is
    unavailable (so the caller can ignore failure without 500'ing the user's
    generation request)."""
    if not _db_available():
        return None
    try:
        from app.database import get_db

        with get_db() as conn:
            row = conn.execute(
                """
                INSERT INTO ppt_library
                  (item_type, source_page, title, language, filename, analysis_id, input_snapshot)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id
                """,
                (
                    item_type,
                    source_page,
                    title or "(untitled)",
                    language,
                    filename,
                    analysis_id,
                    json.dumps(input_snapshot, ensure_ascii=False),
                ),
            ).fetchone()
            return int(row["id"]) if row else None
    except Exception as e:
        logger.warning("library record_item failed: %s", e)
        return None


def list_items(
    *,
    search: str = "",
    item_type: ItemType | None = None,
    limit: int = 200,
) -> list[dict]:
    if not _db_available():
        return []
    try:
        from app.database import get_db

        with get_db() as conn:
            q = "SELECT * FROM ppt_library WHERE 1=1"
            params: list[Any] = []
            if search:
                q += " AND title ILIKE %s"
                params.append(f"%{search}%")
            if item_type:
                q += " AND item_type = %s"
                params.append(item_type)
            q += " ORDER BY created_at DESC LIMIT %s"
            params.append(limit)
            rows = conn.execute(q, params).fetchall()
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.warning("library list_items failed: %s", e)
        return []


def get_item(item_id: int) -> dict | None:
    if not _db_available():
        return None
    try:
        from app.database import get_db

        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM ppt_library WHERE id = %s", (item_id,)
            ).fetchone()
            return _row_to_dict(row) if row else None
    except Exception as e:
        logger.warning("library get_item failed: %s", e)
        return None


def delete_item(item_id: int) -> bool:
    if not _db_available():
        return False
    try:
        from app.database import get_db

        with get_db() as conn:
            conn.execute("DELETE FROM ppt_library WHERE id = %s", (item_id,))
            return True
    except Exception as e:
        logger.warning("library delete_item failed: %s", e)
        return False


def referenced_artifacts() -> tuple[set[str], set[str]]:
    """Return (filenames, analysis_ids) referenced by library rows — both must
    survive the cleanup sweep so 'Download' and 'Resume session' stay alive."""
    if not _db_available():
        return set(), set()
    try:
        from app.database import get_db

        with get_db() as conn:
            rows = conn.execute(
                "SELECT filename, analysis_id FROM ppt_library"
            ).fetchall()
            filenames = {r["filename"] for r in rows if r.get("filename")}
            analysis_ids = {r["analysis_id"] for r in rows if r.get("analysis_id")}
            return filenames, analysis_ids
    except Exception as e:
        logger.warning("library referenced_artifacts failed: %s", e)
        return set(), set()


def _row_to_dict(row: dict) -> dict:
    snapshot = row.get("input_snapshot")
    if isinstance(snapshot, str):
        try:
            snapshot = json.loads(snapshot)
        except Exception:
            snapshot = {}
    return {
        "id": row["id"],
        "item_type": row["item_type"],
        "source_page": row["source_page"],
        "title": row["title"],
        "language": row.get("language"),
        "filename": row.get("filename"),
        "analysis_id": row.get("analysis_id"),
        "input_snapshot": snapshot or {},
        "created_at": str(row["created_at"]) if row.get("created_at") else None,
    }
