import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from app.config import settings
from app.services.youtube_service import (
    extract_video_id,
    extract_lyrics_from_subtitles,
    extract_frames_from_video,
)

router = APIRouter()


class YouTubeURLRequest(BaseModel):
    url: str
    languages: list[str] | None = None


class LyricsResponse(BaseModel):
    title: str
    lyrics: str
    language: str
    subtitle_type: str


class FrameInfo(BaseModel):
    image_url: str
    background_url: str = ""
    timestamp: float
    text: str = ""
    font_size: int = 0


class FramesResponse(BaseModel):
    title: str
    frames: list[FrameInfo]
    work_dir: str


class FrameGenerateRequest(BaseModel):
    url: str
    interval_seconds: float = 2.0
    similarity_threshold: float = 0.95
    session_id: str = ""


@router.post("/extract-lyrics", response_model=LyricsResponse)
def extract_lyrics(request: YouTubeURLRequest):
    video_id = extract_video_id(request.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    try:
        result = extract_lyrics_from_subtitles(video_id, request.languages)
        return LyricsResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("YouTube subtitle extraction failed")
        raise HTTPException(status_code=500, detail="Failed to extract subtitles")


@router.post("/extract-frames", response_model=FramesResponse)
def extract_frames(request: FrameGenerateRequest):
    video_id = extract_video_id(request.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    try:
        result = extract_frames_from_video(
            video_id,
            interval_seconds=request.interval_seconds,
            similarity_threshold=request.similarity_threshold,
            session_id=request.session_id,
        )
        frames = [FrameInfo(
            image_url=f['image_url'],
            background_url=f.get('background_url', f['image_url']),
            timestamp=f['timestamp'],
            text=f.get('text', ''),
            font_size=f.get('font_size', 0),
        ) for f in result['frames']]
        return FramesResponse(title=result['title'], frames=frames, work_dir=result['work_dir'])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("YouTube frame extraction failed")
        raise HTTPException(status_code=500, detail="Failed to extract frames")


@router.get("/frame/{work_dir}/{filename}")
async def get_frame(work_dir: str, filename: str):
    file_path = (settings.UPLOADS_DIR / work_dir / filename).resolve()
    if not file_path.is_relative_to(settings.UPLOADS_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Frame not found")
    return FileResponse(str(file_path), media_type="image/jpeg")
