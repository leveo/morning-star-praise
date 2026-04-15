import logging
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File

logger = logging.getLogger(__name__)
from pydantic import BaseModel

from app.config import settings
from app.services.ocr_service import extract_lyrics_from_file

router = APIRouter()

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


class OcrResponse(BaseModel):
    lyrics: str
    language: str
    pages: int


@router.post("/extract", response_model=OcrResponse)
def extract_from_sheet_music(file: UploadFile = File(...)):
    # Validate file extension
    filename = file.filename or "upload.jpg"
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read and validate size
    content = file.file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # Save to temp file
    temp_name = f"ocr_{uuid.uuid4().hex[:8]}{suffix}"
    temp_path = settings.UPLOADS_DIR / temp_name
    temp_path.write_bytes(content)

    try:
        result = extract_lyrics_from_file(temp_path)
        return OcrResponse(**result)
    except Exception as e:
        logger.exception("OCR extraction failed")
        raise HTTPException(status_code=500, detail="OCR extraction failed")
    finally:
        temp_path.unlink(missing_ok=True)
