from pathlib import Path

from app.secrets import get_secret

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    APP_NAME = "晨星赞美 · Morning Star Praise"
    BACKEND_PORT = 8000
    FRONTEND_URL = get_secret("FRONTEND_URL", "http://localhost:5173")

    # Directories
    BACKGROUNDS_DIR = BASE_DIR / "data" / "backgrounds" / "defaults"
    UPLOADS_DIR = BASE_DIR / "uploads"
    OUTPUT_DIR = BASE_DIR / "output"
    VIDEO_WORK_DIR = BASE_DIR / "uploads" / "video_jobs"
    EXTRACTED_BG_DIR = BASE_DIR / "uploads" / "extracted_bgs"

    # PPT defaults
    MAX_LINES_PER_SLIDE = 8
    PREFERRED_LINES_PER_SLIDE = 6
    DEFAULT_FONT_SIZE_EN = 36
    DEFAULT_FONT_SIZE_ZH = 40
    TITLE_FONT_SIZE = 48
    SLIDE_WIDTH_INCHES = 13.333
    SLIDE_HEIGHT_INCHES = 7.5

    # Upload limits
    MAX_UPLOAD_SIZE_MB = 10
    MAX_AUDIO_UPLOAD_SIZE_MB = 50  # MP3s can be larger than images

    # Video generation — rendered via Remotion
    WHISPER_MODEL = "large-v3"
    WHISPER_COMPUTE_TYPE = "int8"  # CPU-friendly quantization
    REMOTION_PROJECT_DIR = BASE_DIR.parent / "remotion"
    REMOTION_RENDER_TIMEOUT_SEC = 1800

    # File cleanup
    OUTPUT_CLEANUP_HOURS = 1

    # API keys (resolved via env → Google Secret Manager → default)
    GOOGLE_API_KEY = get_secret("GOOGLE_API_KEY")


settings = Settings()
