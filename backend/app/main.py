# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
import logging
import os
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import ppt, lyrics, backgrounds, youtube, ocr, songs, templates, videos, library, llm, sheet

logger = logging.getLogger(__name__)


def _cleanup_old_files(
    directory: Path,
    max_age_hours: int = 1,
    protected_names: set[str] | None = None,
):
    """Delete files / directories older than ``max_age_hours`` under ``directory``.

    Descends one level into container subdirs (e.g. ``analyses/``) because a
    container's mtime refreshes every time a new child is added, so a pure
    top-level sweep would never evict stale grandchildren. Uses ``os.scandir``
    (1 stat per entry) to avoid three separate ``stat()`` calls per path.

    ``protected_names`` skips entries whose basename matches — used to keep
    outputs referenced by the Songs Library from being evicted.
    """
    cutoff = time.time() - (max_age_hours * 3600)
    protected = protected_names or set()
    try:
        entries = list(os.scandir(directory))
    except FileNotFoundError:
        return

    for entry in entries:
        try:
            stat = entry.stat(follow_symlinks=False)
        except FileNotFoundError:
            continue
        if entry.is_file(follow_symlinks=False):
            if stat.st_mtime < cutoff and entry.name not in protected:
                Path(entry.path).unlink(missing_ok=True)
            continue
        if not entry.is_dir(follow_symlinks=False):
            continue
        if entry.name in protected:
            continue

        all_children_evicted = True
        try:
            children = list(os.scandir(entry.path))
        except FileNotFoundError:
            continue
        for child in children:
            try:
                child_stat = child.stat(follow_symlinks=False)
            except FileNotFoundError:
                continue
            if child_stat.st_mtime >= cutoff or child.name in protected:
                all_children_evicted = False
                continue
            if child.is_file(follow_symlinks=False):
                Path(child.path).unlink(missing_ok=True)
            elif child.is_dir(follow_symlinks=False):
                shutil.rmtree(child.path, ignore_errors=True)

        if stat.st_mtime < cutoff and all_children_evicted:
            shutil.rmtree(entry.path, ignore_errors=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure directories exist
    settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    settings.BACKGROUNDS_DIR.mkdir(parents=True, exist_ok=True)
    settings.VIDEO_WORK_DIR.mkdir(parents=True, exist_ok=True)
    settings.EXTRACTED_BG_DIR.mkdir(parents=True, exist_ok=True)

    # Cleanup old generated files on startup — but protect anything the
    # Songs Library still references (outputs + their analysis_id caches)
    # so 'Download' and 'Resume session' stay alive for persisted history.
    try:
        from app.services import library_service
        protected_files, protected_analyses = library_service.referenced_artifacts()
    except Exception:
        protected_files = set()
        protected_analyses = set()
    _cleanup_old_files(settings.OUTPUT_DIR, settings.OUTPUT_CLEANUP_HOURS, protected_files)
    _cleanup_old_files(settings.UPLOADS_DIR, settings.OUTPUT_CLEANUP_HOURS)
    _cleanup_old_files(
        settings.VIDEO_WORK_DIR, settings.OUTPUT_CLEANUP_HOURS, protected_analyses,
    )
    _cleanup_old_files(settings.EXTRACTED_BG_DIR, settings.OUTPUT_CLEANUP_HOURS)

    # Initialize database tables (optional — only if PostgreSQL is available)
    try:
        from app.database import init_tables
        init_tables()
        logger.info("Database tables initialized")
    except Exception as e:
        logger.warning(f"Database not available, running without persistence: {e}")

    # Eager-load the English wav2vec2 alignment model so the first /analyze
    # request doesn't pay the ~15-30s cold-load cost. Chinese is intentionally
    # lazy — the model is ~1GB and not every install will want it.
    try:
        from app.services.video_service import preload_align_model
        import threading as _t
        _t.Thread(target=preload_align_model, args=("en",), daemon=True).start()
    except Exception as e:
        logger.warning("wav2vec2 preload failed: %s", e)

    yield


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_LLM_PROVIDER_ALLOWED = {"openai", "anthropic", "gemini", "minimax", "qwen", "glm", "ollama", ""}


@app.middleware("http")
async def llm_header_middleware(request, call_next):
    """Let the frontend pick an LLM provider per-request via X-LLM-* headers.

    Only the provider name and model name travel over the wire — never API
    keys. The backend still reads keys from .env / Secret Manager. Unknown or
    missing headers fall through to the env defaults unchanged.
    """
    from app.services import llm_service

    def _valid(v: str) -> bool:
        return v.lower() in _LLM_PROVIDER_ALLOWED

    text_provider = request.headers.get("X-LLM-Text-Provider")
    vision_provider = request.headers.get("X-LLM-Vision-Provider")
    llm_service.set_request_overrides(
        text_provider=(text_provider.lower() if text_provider and _valid(text_provider) else None),
        text_model=request.headers.get("X-LLM-Text-Model") or None,
        vision_provider=(vision_provider.lower() if vision_provider and _valid(vision_provider) else None),
        vision_model=request.headers.get("X-LLM-Vision-Model") or None,
    )
    return await call_next(request)

# Serve background images and generated files as static
app.mount(
    "/static/backgrounds",
    StaticFiles(directory=str(settings.BACKGROUNDS_DIR)),
    name="backgrounds",
)
settings.EXTRACTED_BG_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/static/extracted-bgs",
    StaticFiles(directory=str(settings.EXTRACTED_BG_DIR), check_dir=False),
    name="extracted-bgs",
)

# Include routers
app.include_router(lyrics.router, prefix="/api/lyrics", tags=["lyrics"])
app.include_router(ppt.router, prefix="/api/ppt", tags=["ppt"])
app.include_router(backgrounds.router, prefix="/api/backgrounds", tags=["backgrounds"])
app.include_router(youtube.router, prefix="/api/youtube", tags=["youtube"])
app.include_router(ocr.router, prefix="/api/ocr", tags=["ocr"])
app.include_router(songs.router, prefix="/api/songs", tags=["songs"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(llm.router, prefix="/api/llm", tags=["llm"])
app.include_router(sheet.router, prefix="/api/sheet", tags=["sheet"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/usage/session")
async def create_usage_session():
    from app.services.usage_tracker import create_session
    sid = create_session()
    return {"session_id": sid}


@app.get("/api/usage/{session_id}")
async def get_usage(session_id: str):
    from app.services.usage_tracker import get_session
    session = get_session(session_id)
    return session.summary()
