# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Image processing utilities for background scaling."""

import base64
import io
import logging

from PIL import Image, ImageFilter

from app.config import settings

logger = logging.getLogger(__name__)

TARGET_W, TARGET_H = 1920, 1080
TARGET_RATIO = TARGET_W / TARGET_H  # 1.778


def _is_16_9(img: Image.Image, tolerance: float = 0.05) -> bool:
    """Check if image is approximately 16:9."""
    ratio = img.width / img.height
    return abs(ratio - TARGET_RATIO) < tolerance


def _smart_fill_to_16_9(img: Image.Image) -> Image.Image:
    """Fill image to 16:9 using blurred edge extension (fast, no AI needed)."""
    img = img.convert("RGB")
    src_ratio = img.width / img.height

    if src_ratio > TARGET_RATIO:
        # Image is wider than 16:9 — add blurred bars top/bottom
        new_w = img.width
        new_h = int(img.width / TARGET_RATIO)
        bg = img.resize((new_w, new_h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(30))
        y_offset = (new_h - img.height) // 2
        bg.paste(img, (0, y_offset))
    else:
        # Image is taller than 16:9 — add blurred bars left/right
        new_h = img.height
        new_w = int(img.height * TARGET_RATIO)
        bg = img.resize((new_w, new_h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(30))
        x_offset = (new_w - img.width) // 2
        bg.paste(img, (x_offset, 0))

    return bg.resize((TARGET_W, TARGET_H), Image.LANCZOS)


def scale_to_16_9_gemini(img: Image.Image) -> Image.Image:
    """Use Gemini to generate a 16:9 version of the image.

    Falls back to smart-fill if Gemini fails or no API key.
    """
    if _is_16_9(img):
        return img.resize((TARGET_W, TARGET_H), Image.LANCZOS)

    if not settings.GOOGLE_API_KEY:
        logger.info("No GOOGLE_API_KEY, using smart-fill fallback")
        return _smart_fill_to_16_9(img)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)

        # Convert image to bytes
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=90)
        img_bytes = buf.getvalue()

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64.b64encode(img_bytes).decode(),
                            }
                        },
                        {
                            "text": (
                                "Extend this image to a 16:9 aspect ratio (1920x1080). "
                                "Seamlessly extend the edges to fill the new space, "
                                "maintaining the same style, colors, and mood. "
                                "This will be used as a worship presentation background. "
                                "Output the extended image."
                            ),
                        },
                    ],
                }
            ],
            config=types.GenerateContentConfig(
                response_modalities=["image", "text"],
            ),
        )

        # Extract generated image from response
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                img_data = base64.b64decode(part.inline_data.data)
                result = Image.open(io.BytesIO(img_data)).convert("RGB")
                return result.resize((TARGET_W, TARGET_H), Image.LANCZOS)

        logger.warning("Gemini returned no image, using smart-fill fallback")
        return _smart_fill_to_16_9(img)

    except Exception as e:
        logger.warning(f"Gemini image scaling failed, using smart-fill: {e}")
        return _smart_fill_to_16_9(img)
