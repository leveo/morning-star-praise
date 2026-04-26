# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
"""Worship video maker endpoints.

POST /api/videos/extract-lyrics — upload .pptx / image / PDF, return lyrics text
                                  (and slide backgrounds for .pptx)
POST /api/videos/analyze        — upload MP3 + lyrics, transcribe, match stanzas
                                  to audio order, return expanded slide list
POST /api/videos/create         — render a previously-analyzed plan into MP4
GET  /api/videos/job/{id}       — poll job status/progress
GET  /api/videos/download/{f}   — download the generated MP4 or SRT
"""

import asyncio
import json
import logging
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.models import PaddingStyle
from app.services import ppt_extract_service, video_job_service, video_service
from app.services.background_service import assign_backgrounds, build_id_to_path

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}
ALLOWED_LYRICS_EXTRACT_EXTENSIONS = {".pptx", ".ppt", ".pdf", ".jpg", ".jpeg", ".png", ".webp"}
MAX_AUDIO_SIZE_BYTES = settings.MAX_AUDIO_UPLOAD_SIZE_MB * 1024 * 1024
MAX_LYRICS_FILE_SIZE_BYTES = 25 * 1024 * 1024

# Strong refs to in-flight async tasks (prevents GC — see asyncio docs)
_running_tasks: set[asyncio.Task] = set()


class ExtractedBackground(BaseModel):
    filename: str
    url: str


class ExtractLyricsResponse(BaseModel):
    lyrics: str
    language: str
    backgrounds: list[ExtractedBackground]
    slides: int
    title: str = ""
    composer: str = ""


def _resolve_sheet_crop_paths(session_id: str, filenames: list[str]) -> list[Path]:
    """Map `<session>/<crop_name>` to absolute paths under uploads/sheet/.

    Rejects path-traversal, unknown sessions, and files that don't exist.
    The return order matches ``filenames`` so the renderer can assume
    ``resolved[i]`` corresponds to slide ``i`` (cycled by the renderer).
    """
    if not session_id or not filenames:
        return []
    if not session_id.isalnum():
        return []
    base = (settings.UPLOADS_DIR / "sheet").resolve()
    session_dir = (base / session_id).resolve()
    try:
        if not session_dir.is_relative_to(base):
            return []
    except ValueError:
        return []
    resolved: list[Path] = []
    for name in filenames:
        name = name.strip()
        if not name or "/" in name or "\\" in name or name.startswith("."):
            continue
        p = (session_dir / name).resolve()
        try:
            if not p.is_relative_to(session_dir):
                continue
        except ValueError:
            continue
        if p.is_file():
            resolved.append(p)
    return resolved


def _resolve_extracted_bg_paths(rel_paths: list[str]) -> list[Path]:
    """Map `<session>/<file>` strings to local Path objects under EXTRACTED_BG_DIR.

    Drops any path that escapes the directory or doesn't exist.
    """
    base = settings.EXTRACTED_BG_DIR.resolve()
    resolved: list[Path] = []
    for rel in rel_paths:
        rel = rel.strip().lstrip("/")
        if not rel:
            continue
        p = (settings.EXTRACTED_BG_DIR / rel).resolve()
        try:
            if not p.is_relative_to(base):
                continue
        except ValueError:
            continue
        if p.exists() and p.is_file():
            resolved.append(p)
    return resolved


class VideoJobResponse(BaseModel):
    job_id: str
    status: str
    stage: str
    progress: int
    video_filename: str | None = None
    srt_filename: str | None = None
    error: str | None = None


class AnalyzedSlide(BaseModel):
    text: str
    start_sec: float
    end_sec: float
    stanza_idx: int


class AnalyzedStanzaOccurrence(BaseModel):
    stanza_idx: int
    start_sec: float
    end_sec: float
    score: float


class AnalyzeResponse(BaseModel):
    analysis_id: str
    slides: list[AnalyzedSlide]
    stanzas: list[str]
    occurrences: list[AnalyzedStanzaOccurrence]
    audio_duration_sec: float
    intro_end_sec: float


ANALYSIS_ROOT = settings.VIDEO_WORK_DIR / "analyses"


@dataclass(slots=True)
class CachedAnalysis:
    analysis_id: str
    plan: video_service.AudioPlan
    audio_path: Path
    audio_filename: str
    work_dir: Path


@dataclass(slots=True)
class JobSpec:
    """Everything a render job needs besides the cached analysis."""
    title: str
    composer: str
    background_ids: list[int] | None
    extracted_bg_paths: list[Path] | None
    karaoke_mode: bool
    audio_stem: str
    primary_font_size: int | None
    secondary_font_size: int | None
    line_spacing_multiplier: float | None
    show_page_numbers: bool
    padding_style: str = "dark"
    bg_path_overrides: dict[int, Path] | None = None
    # Renderer cycles these crops when fewer than chunks. None disables.
    sheet_crop_paths: list[Path] | None = None
    # Library / history metadata — written to ppt_library when the job
    # completes successfully. None means "don't record", preserving
    # backward-compat for older clients that don't send a snapshot.
    analysis_id: str | None = None
    library_language: str | None = None
    library_snapshot: dict | None = None


def _analysis_dir(analysis_id: str) -> Path:
    """Resolve a safe analysis_id to its on-disk cache directory."""
    if not analysis_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid analysis_id")
    root = ANALYSIS_ROOT.resolve()
    resolved = (ANALYSIS_ROOT / analysis_id).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid analysis_id")
    return resolved


def _load_cached_plan(analysis_id: str) -> CachedAnalysis:
    d = _analysis_dir(analysis_id)
    if not d.exists() or not d.is_dir():
        raise HTTPException(status_code=404, detail="Analysis not found or expired")
    plan_path = d / "plan.json"
    if not plan_path.exists():
        raise HTTPException(status_code=404, detail="Analysis not found or expired")
    try:
        payload = json.loads(plan_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis file corrupted: {exc}")
    audio_name = payload.get("audio_filename_server") or "input.mp3"
    audio_path = d / audio_name
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Cached audio missing")
    return CachedAnalysis(
        analysis_id=analysis_id,
        plan=video_service.plan_from_dict(payload["plan"]),
        audio_path=audio_path,
        audio_filename=payload.get("audio_filename") or audio_name,
        work_dir=d,
    )


def _progress_cb(job_id: str):
    def _cb(stage: str, percent: int) -> None:
        try:
            video_job_service.update_job(
                job_id, status="processing", stage=stage, progress=percent
            )
        except Exception:
            logger.exception("Failed to update progress for %s", job_id)

    return _cb


def _run_job_sync(job_id: str, cached: CachedAnalysis, spec: JobSpec) -> None:
    try:
        plan = cached.plan
        if not plan.lyric_chunks:
            raise ValueError("Analysis has no slides — re-run Analyze Audio")

        num_bg_slots = len(plan.lyric_chunks) + 1
        if spec.extracted_bg_paths:
            bg_paths: list[Path | None] = [
                spec.extracted_bg_paths[i % len(spec.extracted_bg_paths)]
                for i in range(num_bg_slots)
            ]
        else:
            bg_paths = assign_backgrounds(
                num_slides=num_bg_slots,
                background_ids=spec.background_ids,
            )

        if spec.bg_path_overrides:
            for idx, override_path in spec.bg_path_overrides.items():
                if 0 <= idx < len(bg_paths):
                    bg_paths[idx] = override_path

        video_path, srt_path = video_service.build_video_from_plan(
            audio_path=cached.audio_path,
            plan=plan,
            title=spec.title,
            composer=spec.composer,
            background_paths=bg_paths,
            output_dir=settings.OUTPUT_DIR,
            work_dir=cached.work_dir,
            on_progress=_progress_cb(job_id),
            karaoke_mode=spec.karaoke_mode,
            output_stem=spec.audio_stem,
            primary_font_size=spec.primary_font_size,
            secondary_font_size=spec.secondary_font_size,
            line_spacing_multiplier=spec.line_spacing_multiplier,
            show_page_numbers=spec.show_page_numbers,
            padding_style=spec.padding_style,
            sheet_crop_paths=spec.sheet_crop_paths,
        )

        video_job_service.update_job(
            job_id,
            status="done",
            stage="Complete",
            progress=100,
            video_filename=video_path.name,
            srt_filename=srt_path.name,
        )

        if spec.library_snapshot is not None:
            from app.services import library_service
            library_service.record_item(
                item_type="video",
                source_page="worship-video",
                title=spec.title or "(untitled)",
                language=spec.library_language,
                filename=video_path.name,
                analysis_id=spec.analysis_id,
                input_snapshot=spec.library_snapshot,
            )
    except Exception as exc:
        logger.exception("Video job %s failed", job_id)
        try:
            video_job_service.update_job(
                job_id, status="failed", stage="Error", error=str(exc)[:500]
            )
        except Exception:
            logger.exception("Failed to mark job as failed")
    # Cache dir survives for follow-up /rerender calls; TTL eviction happens
    # in main._cleanup_old_files.


async def _run_job_async(job_id: str, cached: CachedAnalysis, spec: JobSpec) -> None:
    await asyncio.to_thread(_run_job_sync, job_id, cached, spec)


def _analyze_sync(
    audio_path: Path,
    lyrics_text: str,
    language: str,
    max_lines_per_slide: int,
    max_width_per_row: int,
    analysis_dir: Path,
    audio_suffix: str,
    audio_filename: str,
) -> AnalyzeResponse:
    """Run the full analyze pipeline (transcribe + stanza match + expand slides).

    Writes ``plan.json`` into ``analysis_dir`` so /create can load it later
    without re-transcribing. Returns the analyzed slide list + metadata.
    """
    plan = video_service.analyze_audio(
        audio_path=audio_path,
        lyrics_text=lyrics_text,
        language=language,
        max_lines_per_slide=max_lines_per_slide,
        max_width_per_row=max_width_per_row,
    )

    curve_cache = video_service.CharCurveCache()
    timed = video_service.finalize_plan_timings(plan, curve_cache=curve_cache)
    plan.karaoke_units = video_service.compute_chunk_units(
        plan.lyric_chunks, plan.whisper_words, plan.audio_duration,
        intro_offset=plan.intro_end,
        curve_cache=curve_cache,
        timed_chunks=timed,
    )
    stanza_idx_by_chunk = plan.chunk_stanza_idx or [-1] * len(plan.lyric_chunks)

    slides_payload: list[AnalyzedSlide] = []
    for i, tc in enumerate(timed):
        slides_payload.append(
            AnalyzedSlide(
                text=tc.text,
                start_sec=float(tc.start),
                end_sec=float(tc.end),
                stanza_idx=int(stanza_idx_by_chunk[i]) if i < len(stanza_idx_by_chunk) else -1,
            )
        )

    payload = {
        "plan": video_service.plan_to_dict(plan),
        "audio_filename": audio_filename,
        "audio_filename_server": f"input{audio_suffix}",
    }
    (analysis_dir / "plan.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )

    return AnalyzeResponse(
        analysis_id=analysis_dir.name,
        slides=slides_payload,
        stanzas=list(plan.stanzas),
        occurrences=[
            AnalyzedStanzaOccurrence(
                stanza_idx=o.stanza_idx,
                start_sec=o.start_sec,
                end_sec=o.end_sec,
                score=o.score,
            )
            for o in plan.occurrences
        ],
        audio_duration_sec=float(plan.audio_duration),
        intro_end_sec=float(plan.intro_end),
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_audio_endpoint(
    audio: UploadFile = File(...),
    lyrics_text: str = Form(...),
    language: str = Form("auto"),
    max_lines_per_slide: int = Form(6),
    max_width_per_row: int = Form(12),
):
    filename = audio.filename or "audio.mp3"
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
        )

    content = await audio.read()
    if len(content) > MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Audio too large. Max {settings.MAX_AUDIO_UPLOAD_SIZE_MB} MB",
        )
    if not lyrics_text.strip():
        raise HTTPException(status_code=400, detail="Lyrics text is required")

    analysis_id = uuid.uuid4().hex
    analysis_dir = ANALYSIS_ROOT / analysis_id
    analysis_dir.mkdir(parents=True, exist_ok=True)
    audio_path = analysis_dir / f"input{suffix}"
    audio_path.write_bytes(content)

    try:
        response = await asyncio.to_thread(
            _analyze_sync,
            audio_path,
            lyrics_text,
            language,
            max_lines_per_slide,
            max_width_per_row,
            analysis_dir,
            suffix,
            filename,
        )
    except Exception as exc:
        logger.exception("Audio analysis failed")
        shutil.rmtree(analysis_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")

    return response


@router.post("/create", response_model=VideoJobResponse)
async def create_video(
    analysis_id: str = Form(...),
    title: str = Form(""),
    composer: str = Form(""),
    background_ids: str = Form(""),
    extracted_background_paths: str = Form(""),
    karaoke_mode: bool = Form(False),
    primary_font_size: int | None = Form(None),
    secondary_font_size: int | None = Form(None),
    line_spacing_multiplier: float | None = Form(None),
    show_page_numbers: bool = Form(False),
    padding_style: str = Form("dark"),
    input_snapshot: str = Form(""),
    sheet_session_id: str = Form(""),
    sheet_crop_filenames: str = Form(""),
):
    cached = _load_cached_plan(analysis_id)

    bg_ids: list[int] | None = None
    if background_ids:
        try:
            bg_ids = [int(x) for x in background_ids.split(",") if x.strip()]
            if not bg_ids:
                bg_ids = None
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid background_ids")

    extracted_bg_paths: list[Path] | None = None
    if extracted_background_paths:
        rel_list = [s for s in extracted_background_paths.split(",") if s.strip()]
        resolved = _resolve_extracted_bg_paths(rel_list)
        if resolved:
            extracted_bg_paths = resolved

    sheet_crop_paths: list[Path] | None = None
    if sheet_session_id and sheet_crop_filenames:
        filenames = [s for s in sheet_crop_filenames.split(",") if s.strip()]
        resolved_sheet = _resolve_sheet_crop_paths(sheet_session_id, filenames)
        if resolved_sheet:
            sheet_crop_paths = resolved_sheet

    audio_stem = Path(cached.audio_filename).stem or "worship_video"

    job_id = uuid.uuid4().hex
    video_job_service.create_job(job_id, title=title, language=cached.plan.language)

    snapshot_payload: dict | None = None
    if input_snapshot:
        try:
            parsed = json.loads(input_snapshot)
            if isinstance(parsed, dict):
                snapshot_payload = parsed
        except ValueError:
            # Malformed snapshot shouldn't block the render — just skip recording.
            logger.warning("create_video: ignoring invalid input_snapshot JSON")

    spec = JobSpec(
        title=title,
        composer=composer,
        background_ids=bg_ids,
        extracted_bg_paths=extracted_bg_paths,
        karaoke_mode=karaoke_mode,
        audio_stem=audio_stem,
        primary_font_size=primary_font_size,
        secondary_font_size=secondary_font_size,
        line_spacing_multiplier=line_spacing_multiplier,
        show_page_numbers=show_page_numbers,
        padding_style=padding_style if padding_style in ("dark", "light") else "dark",
        sheet_crop_paths=sheet_crop_paths,
        analysis_id=analysis_id,
        library_language=cached.plan.language,
        library_snapshot=snapshot_payload,
    )
    task = asyncio.create_task(_run_job_async(job_id, cached, spec))
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return VideoJobResponse(job_id=job_id, status="pending", stage="Queued", progress=0)


@router.post("/extract-lyrics", response_model=ExtractLyricsResponse)
async def extract_lyrics_for_video(file: UploadFile = File(...)):
    filename = file.filename or "upload.bin"
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in ALLOWED_LYRICS_EXTRACT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type. Allowed: "
                f"{', '.join(sorted(ALLOWED_LYRICS_EXTRACT_EXTENSIONS))}"
            ),
        )

    content = await file.read()
    if len(content) > MAX_LYRICS_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max {MAX_LYRICS_FILE_SIZE_BYTES // (1024 * 1024)} MB",
        )

    if suffix in {".pptx", ".ppt"}:
        session_id = uuid.uuid4().hex[:8]
        temp_path = settings.UPLOADS_DIR / f"extract_{session_id}{suffix}"
        temp_path.write_bytes(content)
        convert_work_dir = settings.UPLOADS_DIR / f"extract_convert_{session_id}"
        converted_path: Path | None = None
        try:
            if suffix == ".ppt":
                try:
                    converted_path = ppt_extract_service.convert_ppt_to_pptx(
                        temp_path, convert_work_dir
                    )
                except RuntimeError as exc:
                    raise HTTPException(status_code=422, detail=str(exc))
                pptx_path = converted_path
            else:
                pptx_path = temp_path
            result = ppt_extract_service.extract_pptx(pptx_path, session_id)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("PPT extraction failed")
            raise HTTPException(status_code=500, detail=f"PPT extraction failed: {exc}")
        finally:
            temp_path.unlink(missing_ok=True)
            if converted_path is not None:
                shutil.rmtree(convert_work_dir, ignore_errors=True)
        return ExtractLyricsResponse(
            lyrics=result["lyrics"],
            language=result["language"],
            backgrounds=[ExtractedBackground(**b) for b in result["backgrounds"]],
            slides=result["slides"],
            title=result.get("title", ""),
            composer=result.get("composer", ""),
        )

    from app.services.ocr_service import extract_lyrics_from_file

    temp_name = f"extract_ocr_{uuid.uuid4().hex[:8]}{suffix}"
    temp_path = settings.UPLOADS_DIR / temp_name
    temp_path.write_bytes(content)
    try:
        result = extract_lyrics_from_file(temp_path)
    except Exception as exc:
        logger.exception("OCR extraction failed")
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {exc}")
    finally:
        temp_path.unlink(missing_ok=True)

    return ExtractLyricsResponse(
        lyrics=result.get("lyrics", ""),
        language=result.get("language", "en"),
        backgrounds=[],
        slides=result.get("pages", 1),
    )


@router.get("/job/{job_id}", response_model=VideoJobResponse)
def get_video_job(job_id: str):
    job = video_job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return VideoJobResponse(
        job_id=job["id"],
        status=job["status"],
        stage=job["stage"],
        progress=job["progress"],
        video_filename=job.get("video_filename"),
        srt_filename=job.get("srt_filename"),
        error=job.get("error"),
    )


# ---------------------------------------------------------------------------
# Edit-video support: expose cached plan + audio so @remotion/player can
# preview in the browser, and accept per-slide edits via /rerender.
# ---------------------------------------------------------------------------


@router.get("/analyses/{analysis_id}/plan")
def get_analysis_plan(analysis_id: str):
    cached = _load_cached_plan(analysis_id)
    plan_dict = video_service.plan_to_dict(cached.plan)
    # whisper_words is the largest field (often >1MB for long songs) and the
    # Edit Video panel only needs the slide-level ``timed`` list, so we strip
    # it before sending. The full plan is still available on disk for any
    # server-side re-rendering.
    plan_dict.pop("whisper_words", None)

    # Inline karaoke units into each timed entry for the editor Player;
    # drop the top-level duplicate to keep the response compact.
    units = plan_dict.pop("karaoke_units", []) or []
    for i, tc in enumerate(plan_dict.get("timed", [])):
        tc["units"] = units[i] if i < len(units) else []

    return {
        "analysis_id": analysis_id,
        "audio_filename": cached.audio_filename,
        "audio_url": f"/api/videos/analyses/{analysis_id}/audio",
        "plan": plan_dict,
    }


@router.get("/analyses/{analysis_id}/audio")
def get_analysis_audio(analysis_id: str):
    cached = _load_cached_plan(analysis_id)
    path = cached.audio_path
    ext = path.suffix.lower()
    media_type = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
    }.get(ext, "application/octet-stream")
    return FileResponse(path=str(path), media_type=media_type, filename=path.name)


class TimingOverride(BaseModel):
    idx: int
    start_sec: float
    end_sec: float


class BackgroundOverride(BaseModel):
    idx: int
    background_id: int | None = None


class RerenderRequest(BaseModel):
    analysis_id: str
    title: str = ""
    composer: str = ""
    background_ids: list[int] | None = None
    extracted_background_paths: list[str] | None = None
    karaoke_mode: bool = False
    primary_font_size: int | None = None
    secondary_font_size: int | None = None
    line_spacing_multiplier: float | None = None
    show_page_numbers: bool = False
    padding_style: PaddingStyle = "dark"
    timing_overrides: list[TimingOverride] = []
    background_overrides: list[BackgroundOverride] = []
    sheet_session_id: str | None = None
    sheet_crop_filenames: list[str] | None = None
    input_snapshot: dict | None = None


@router.post("/rerender", response_model=VideoJobResponse)
async def rerender_video(req: RerenderRequest):
    cached = _load_cached_plan(req.analysis_id)

    if req.timing_overrides:
        timed = list(cached.plan.timed)
        for ov in req.timing_overrides:
            if 0 <= ov.idx < len(timed):
                timed[ov.idx] = video_service.TimedChunk(
                    text=timed[ov.idx].text,
                    start=float(ov.start_sec),
                    end=float(ov.end_sec),
                )
        # Re-enforce the chunk[i].end == chunk[i+1].start invariant so
        # Remotion sequences still crossfade back-to-back.
        for i in range(len(timed) - 1):
            timed[i].end = timed[i + 1].start
        cached.plan.timed = timed
        # Overrides moved chunk windows — cached units are stale, force recompute.
        cached.plan.karaoke_units = []

    extracted_bg_paths: list[Path] | None = None
    if req.extracted_background_paths:
        rel_list = [s for s in req.extracted_background_paths if s.strip()]
        resolved = _resolve_extracted_bg_paths(rel_list)
        if resolved:
            extracted_bg_paths = resolved

    sheet_crop_paths: list[Path] | None = None
    if req.sheet_session_id and req.sheet_crop_filenames:
        resolved_sheet = _resolve_sheet_crop_paths(
            req.sheet_session_id, req.sheet_crop_filenames
        )
        if resolved_sheet:
            sheet_crop_paths = resolved_sheet

    # Editor's ``idx`` is the lyric chunk index (0..N-1). ``bg_paths`` index 0
    # is the title slide, so chunk-level overrides shift by +1.
    bg_path_overrides: dict[int, Path] | None = None
    override_ids = {ov.background_id for ov in req.background_overrides if ov.background_id is not None}
    if override_ids:
        id_to_path = build_id_to_path()
        resolved_overrides = {
            ov.idx + 1: id_to_path[ov.background_id]
            for ov in req.background_overrides
            if ov.background_id is not None and ov.background_id in id_to_path
        }
        if resolved_overrides:
            bg_path_overrides = resolved_overrides

    audio_stem = Path(cached.audio_filename).stem or "worship_video"
    job_id = uuid.uuid4().hex
    video_job_service.create_job(job_id, title=req.title, language=cached.plan.language)

    spec = JobSpec(
        title=req.title,
        composer=req.composer,
        background_ids=req.background_ids,
        extracted_bg_paths=extracted_bg_paths,
        karaoke_mode=req.karaoke_mode,
        audio_stem=audio_stem,
        primary_font_size=req.primary_font_size,
        secondary_font_size=req.secondary_font_size,
        line_spacing_multiplier=req.line_spacing_multiplier,
        show_page_numbers=req.show_page_numbers,
        padding_style=req.padding_style,
        sheet_crop_paths=sheet_crop_paths,
        bg_path_overrides=bg_path_overrides,
        analysis_id=req.analysis_id,
        library_language=cached.plan.language,
        library_snapshot=req.input_snapshot,
    )
    task = asyncio.create_task(_run_job_async(job_id, cached, spec))
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return VideoJobResponse(job_id=job_id, status="pending", stage="Queued", progress=0)


@router.get("/download/{filename}")
def download_video_asset(filename: str):
    file_path = (settings.OUTPUT_DIR / filename).resolve()
    if not file_path.is_relative_to(settings.OUTPUT_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if filename.endswith(".mp4"):
        media_type = "video/mp4"
    elif filename.endswith(".srt"):
        media_type = "application/x-subrip"
    else:
        media_type = "application/octet-stream"

    return FileResponse(path=str(file_path), filename=filename, media_type=media_type)
