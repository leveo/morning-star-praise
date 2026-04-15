import io
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from app.config import settings
from app.models import BackgroundInfo
from app.services.background_service import (
    list_default_backgrounds,
    upsert_metadata,
)
from app.services.image_service import scale_to_16_9_gemini

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_SIZE_BYTES = 60 * 1024 * 1024


def _parse_tags(raw: str) -> list[str]:
    return [t.strip().lower() for t in raw.split(",") if t.strip()]


@router.get("", response_model=list[BackgroundInfo])
async def get_backgrounds():
    return list_default_backgrounds()


@router.post("/upload", response_model=BackgroundInfo)
def upload_background(
    file: UploadFile = File(...),
    tags: str = Form(""),
):
    content_type = file.content_type or ""
    is_video = content_type in ALLOWED_VIDEO_TYPES
    is_image = content_type in ALLOWED_IMAGE_TYPES

    if not (is_image or is_video):
        raise HTTPException(
            status_code=400,
            detail="Allowed: JPG/PNG/WebP images, MP4/WebM/MOV video",
        )

    content = file.file.read()
    max_size = MAX_VIDEO_SIZE_BYTES if is_video else MAX_IMAGE_SIZE_BYTES
    if len(content) > max_size:
        max_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File too large (max {max_mb} MB)")

    parsed_tags = _parse_tags(tags)

    if is_video:
        ext_map = {
            "video/mp4": ".mp4",
            "video/webm": ".webm",
            "video/quicktime": ".mov",
        }
        suffix = ext_map.get(content_type, ".mp4")
        filename = f"custom_{uuid.uuid4().hex[:8]}{suffix}"
        output_path = settings.BACKGROUNDS_DIR / filename
        output_path.write_bytes(content)
        media_type = "video"
        if "motion" not in parsed_tags and "dynamic" not in parsed_tags:
            parsed_tags.append("motion")
    else:
        img = Image.open(io.BytesIO(content)).convert("RGB")
        img = scale_to_16_9_gemini(img)
        filename = f"custom_{uuid.uuid4().hex[:8]}.jpg"
        output_path = settings.BACKGROUNDS_DIR / filename
        img.save(str(output_path), "JPEG", quality=85)
        media_type = "image"
        if "static" not in parsed_tags:
            parsed_tags.append("static")

    display_name = (file.filename or filename).rsplit(".", 1)[0]
    upsert_metadata(filename, name=display_name, tags=parsed_tags, media_type=media_type)

    bgs = list_default_backgrounds()
    for bg in bgs:
        if bg.filename == filename:
            return bg

    return BackgroundInfo(
        id=len(bgs) + 1,
        filename=filename,
        name=display_name,
        category="custom",
        url=f"/static/backgrounds/{filename}",
        tags=parsed_tags,
        media_type=media_type,
    )
