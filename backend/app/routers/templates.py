# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
import json

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_db

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    config: dict


class TemplateResponse(BaseModel):
    id: int
    name: str
    config: dict
    is_default: bool
    created_by: int | None
    created_at: str | None


@router.get("")
async def list_templates(request: Request):
    user = get_current_user(request)
    with get_db() as conn:
        if user:
            rows = conn.execute(
                "SELECT * FROM ppt_templates WHERE created_by = %s OR is_default = TRUE ORDER BY is_default DESC, name",
                (user["id"],),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM ppt_templates WHERE is_default = TRUE ORDER BY name"
            ).fetchall()
        return [_row_to_response(r) for r in rows]


@router.post("", response_model=TemplateResponse)
async def create_template(template: TemplateCreate, request: Request):
    user = get_current_user(request)
    user_id = user["id"] if user else None

    with get_db() as conn:
        row = conn.execute(
            """
            INSERT INTO ppt_templates (name, config, created_by)
            VALUES (%s, %s::jsonb, %s)
            RETURNING *
            """,
            (template.name, json.dumps(template.config), user_id),
        ).fetchone()
        return _row_to_response(row)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(template_id: int, template: TemplateCreate):
    with get_db() as conn:
        row = conn.execute(
            """
            UPDATE ppt_templates SET name=%s, config=%s::jsonb WHERE id=%s AND is_default=FALSE
            RETURNING *
            """,
            (template.name, json.dumps(template.config), template_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found or is default")
        return _row_to_response(row)


@router.delete("/{template_id}")
async def delete_template(template_id: int):
    with get_db() as conn:
        result = conn.execute(
            "DELETE FROM ppt_templates WHERE id = %s AND is_default = FALSE", (template_id,)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Template not found or is default")
        return {"ok": True}


def _row_to_response(row: dict) -> TemplateResponse:
    config = row["config"]
    if isinstance(config, str):
        config = json.loads(config)
    return TemplateResponse(
        id=row["id"],
        name=row["name"],
        config=config,
        is_default=row["is_default"],
        created_by=row.get("created_by"),
        created_at=str(row["created_at"]) if row.get("created_at") else None,
    )
