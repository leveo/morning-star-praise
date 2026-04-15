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
from app.routers import ppt, lyrics, backgrounds, youtube, ocr, songs, templates, videos

logger = logging.getLogger(__name__)


def _cleanup_old_files(directory: Path, max_age_hours: int = 1):
    """Delete files / directories older than ``max_age_hours`` under ``directory``.

    Descends one level into container subdirs (e.g. ``analyses/``) because a
    container's mtime refreshes every time a new child is added, so a pure
    top-level sweep would never evict stale grandchildren. Uses ``os.scandir``
    (1 stat per entry) to avoid three separate ``stat()`` calls per path.
    """
    cutoff = time.time() - (max_age_hours * 3600)
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
            if stat.st_mtime < cutoff:
                Path(entry.path).unlink(missing_ok=True)
            continue
        if not entry.is_dir(follow_symlinks=False):
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
            if child_stat.st_mtime >= cutoff:
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

    # Cleanup old generated files on startup
    _cleanup_old_files(settings.OUTPUT_DIR, settings.OUTPUT_CLEANUP_HOURS)
    _cleanup_old_files(settings.UPLOADS_DIR, settings.OUTPUT_CLEANUP_HOURS)
    _cleanup_old_files(settings.VIDEO_WORK_DIR, settings.OUTPUT_CLEANUP_HOURS)
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
