# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
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
    """OCR with LLM-first strategy.

    Vision LLMs (qwen3-vl, Gemini, etc.) can semantically filter out musical
    notation / chord symbols / page meta — something PaddleOCR can't do on
    sheet music images. So try the configured vision LLM first; fall back to
    PaddleOCR only when the LLM is disabled or errors out.
    """
    try:
        from app.services import llm_service
        if llm_service.is_vision_enabled():
            result = llm_service.generate_from_image(
                image_path.read_bytes(),
                "image/jpeg",
                "Extract ONLY the Chinese lyrics text visible in this image. "
                "Output ONLY the text, nothing else. If no Chinese text, output NONE.",
                session_id=session_id,
                action="ocr",
            )
            if result and result != "NONE":
                return result
    except Exception as e:
        logger.debug(f"Vision LLM OCR failed, falling back to PaddleOCR: {e}")

    text = ocr_image_local(image_path)
    return text or ""
