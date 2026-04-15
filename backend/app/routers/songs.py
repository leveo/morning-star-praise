from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_db

router = APIRouter()


class SongCreate(BaseModel):
    title: str
    lyrics: str
    language: str = "en"
    source: str | None = None
    source_url: str | None = None


class SongResponse(BaseModel):
    id: int
    title: str
    lyrics: str
    language: str
    source: str | None
    source_url: str | None
    created_by: int | None
    created_at: str | None


@router.get("")
async def list_songs(
    request: Request,
    search: str = Query(default="", description="Search in title or lyrics"),
    language: str = Query(default="", description="Filter by language"),
):
    user = get_current_user(request)
    with get_db() as conn:
        query = "SELECT * FROM ppt_songs WHERE 1=1"
        params: list = []

        if search:
            query += " AND (title ILIKE %s OR lyrics ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
        if language:
            query += " AND language = %s"
            params.append(language)
        if user:
            query += " AND (created_by = %s OR created_by IS NULL)"
            params.append(user["id"])

        query += " ORDER BY updated_at DESC LIMIT 100"
        rows = conn.execute(query, params).fetchall()
        return [_row_to_response(r) for r in rows]


@router.post("", response_model=SongResponse)
async def create_song(song: SongCreate, request: Request):
    user = get_current_user(request)
    user_id = user["id"] if user else None

    with get_db() as conn:
        row = conn.execute(
            """
            INSERT INTO ppt_songs (title, lyrics, language, source, source_url, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (song.title, song.lyrics, song.language, song.source, song.source_url, user_id),
        ).fetchone()
        return _row_to_response(row)


@router.get("/{song_id}", response_model=SongResponse)
async def get_song(song_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM ppt_songs WHERE id = %s", (song_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Song not found")
        return _row_to_response(row)


@router.put("/{song_id}", response_model=SongResponse)
async def update_song(song_id: int, song: SongCreate, request: Request):
    with get_db() as conn:
        row = conn.execute(
            """
            UPDATE ppt_songs SET title=%s, lyrics=%s, language=%s, source=%s, source_url=%s,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=%s RETURNING *
            """,
            (song.title, song.lyrics, song.language, song.source, song.source_url, song_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Song not found")
        return _row_to_response(row)


@router.delete("/{song_id}")
async def delete_song(song_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM ppt_songs WHERE id = %s", (song_id,))
        return {"ok": True}


def _row_to_response(row: dict) -> SongResponse:
    return SongResponse(
        id=row["id"],
        title=row["title"],
        lyrics=row["lyrics"],
        language=row["language"],
        source=row.get("source"),
        source_url=row.get("source_url"),
        created_by=row.get("created_by"),
        created_at=str(row["created_at"]) if row.get("created_at") else None,
    )
