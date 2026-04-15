"""Local OCR using PaddleOCR. Falls back to Gemini for complex cases."""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_ocr_instance = None


def _get_ocr():
    global _ocr_instance
    if _ocr_instance is None:
        try:
            from paddleocr import PaddleOCR
            _ocr_instance = PaddleOCR(use_angle_cls=True, lang='ch')
            logger.info("PaddleOCR initialized")
        except Exception as e:
            logger.warning(f"PaddleOCR not available: {e}")
            _ocr_instance = False
    return _ocr_instance if _ocr_instance is not False else None


def ocr_image_local(image_path: Path) -> str | None:
    """Extract text from image using PaddleOCR (local, no API cost)."""
    ocr = _get_ocr()
    if ocr is None:
        return None

    try:
        results = list(ocr.predict(str(image_path)))
        if not results:
            return None

        lines = []
        for r in results:
            if 'rec_texts' not in r:
                continue
            for text, score in zip(r['rec_texts'], r['rec_scores']):
                if score > 0.5 and text.strip():
                    lines.append(text.strip())

        return "\n".join(lines) if lines else None

    except Exception as e:
        logger.debug(f"PaddleOCR failed on {image_path.name}: {e}")
        return None


def ocr_image(image_path: Path, session_id: str = "") -> str:
    """OCR with local-first strategy: PaddleOCR → Gemini fallback."""
    # Try local first
    text = ocr_image_local(image_path)
    if text:
        return text

    # Fallback to Gemini
    try:
        import base64
        from app.config import settings
        if not settings.GOOGLE_API_KEY:
            return ""

        from google import genai
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)

        b64 = base64.b64encode(image_path.read_bytes()).decode()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[{
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                    {"text": "Extract ONLY the Chinese lyrics text visible in this image. Output ONLY the text, nothing else. If no Chinese text, output NONE."},
                ],
            }],
        )

        if session_id:
            from app.services.usage_tracker import track_call
            track_call(session_id, "ocr_fallback", response)

        result = response.text.strip()
        if result and result != "NONE":
            logger.info(f"Gemini OCR fallback used for {image_path.name}")
            return result

    except Exception as e:
        logger.debug(f"Gemini OCR fallback failed: {e}")

    return ""
