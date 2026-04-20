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

    # LLM provider selection — see llm_service.py for supported values.
    # Empty string = "LLM features disabled". Text and vision can use
    # different providers so you can run e.g. Ollama text + Gemini vision.
    # Vision defaults to ollama because qwen3-vl:8b runs fully local and
    # beats PaddleOCR on sheet-music lyric extraction; switch to a cloud
    # provider if you don't want to install Ollama.
    LLM_TEXT_PROVIDER = get_secret("LLM_TEXT_PROVIDER", "gemini").lower()
    LLM_VISION_PROVIDER = get_secret("LLM_VISION_PROVIDER", "ollama").lower()

    # Per-provider API keys. Each is optional — only the ones you route to
    # via LLM_*_PROVIDER need to be set.
    OPENAI_API_KEY = get_secret("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY = get_secret("ANTHROPIC_API_KEY", "")
    MINIMAX_API_KEY = get_secret("MINIMAX_API_KEY", "")
    DASHSCOPE_API_KEY = get_secret("DASHSCOPE_API_KEY", "")  # Alibaba Qwen
    ZHIPU_API_KEY = get_secret("ZHIPU_API_KEY", "")  # Zhipu GLM

    # Model overrides — defaults are set per-provider in llm_service.
    LLM_TEXT_MODEL = get_secret("LLM_TEXT_MODEL", "")
    LLM_VISION_MODEL = get_secret("LLM_VISION_MODEL", "")

    # Ollama (local) — defaults to the standard localhost port.
    # Text:    gemma4:e4b (default, 8B) or qwen3.5:9b (alternative, strong CJK).
    # Vision:  qwen3-vl:8b handles both OCR (lyric sheet / frame extraction)
    #          and vision reasoning (YouTube frame KEEP/SKIP filtering, dedup)
    #          in one model.
    OLLAMA_BASE_URL = get_secret("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    OLLAMA_TEXT_MODEL = get_secret("OLLAMA_TEXT_MODEL", "gemma4:e4b")
    OLLAMA_VISION_MODEL = get_secret("OLLAMA_VISION_MODEL", "qwen3-vl:8b")


settings = Settings()
