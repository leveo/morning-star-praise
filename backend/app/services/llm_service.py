# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Leo Song
"""Provider-agnostic LLM interface — one text call, one vision call.

Supported providers (configured via ``LLM_TEXT_PROVIDER`` / ``LLM_VISION_PROVIDER``):

    openai      OpenAI GPT-4o / GPT-4o-mini (OpenAI SDK, api.openai.com)
    anthropic   Claude Sonnet / Haiku       (Anthropic SDK)
    gemini      Google Gemini               (google-genai SDK, existing default)
    minimax     MiniMax                     (OpenAI-compatible, api.minimax.chat)
    qwen        Alibaba Qwen / Qwen-VL      (OpenAI-compatible, DashScope)
    glm         Zhipu GLM-4 / GLM-4V        (OpenAI-compatible, open.bigmodel.cn)
    ollama      Local models via Ollama     (OpenAI-compatible, localhost:11434)
    ""          LLM features disabled — callers raise ``LLMDisabledError``.

Every provider except Anthropic and Gemini speaks an OpenAI-compatible dialect,
so they all share the same ``_openai_compat_*`` implementation with just a
different ``base_url`` + API key + default model.

Vision support varies by provider. ``generate_from_image`` raises
``LLMUnsupportedError`` on providers whose current model family doesn't handle
images (e.g. Ollama text-only models).

``session_id`` + ``action`` route into ``usage_tracker`` for token accounting;
provider response shapes differ, so the tracker is only called for Gemini
(where it was already wired). Other providers return token counts in a
different shape — adding them is straightforward follow-up work.
"""
from __future__ import annotations

import base64
import contextvars
import logging
from typing import Literal

from app.config import settings

logger = logging.getLogger(__name__)

TextProvider = Literal["openai", "anthropic", "gemini", "minimax", "qwen", "glm", "ollama", ""]
VisionProvider = TextProvider


class LLMError(RuntimeError):
    """Base class for LLM routing errors — use the more specific subclasses."""


class LLMDisabledError(LLMError):
    """Raised when LLM_*_PROVIDER is empty — the caller's feature is unavailable
    in pure-local mode. Callers surface this to the user as a configuration hint."""


class LLMUnsupportedError(LLMError):
    """Raised when the configured provider doesn't support the requested modality
    (e.g. vision call on a text-only Ollama model)."""


# --------------------------------------------------------------------------
# Per-request overrides — set by the X-LLM-* header middleware so the frontend
# Settings page can route a single request to a different provider/model
# without touching env vars or restarting the backend. API keys are never
# sent through headers; only provider names + model names. Keys always live
# in .env / Secret Manager.
# --------------------------------------------------------------------------

_text_provider_cv: contextvars.ContextVar[str | None] = contextvars.ContextVar("llm_text_provider", default=None)
_text_model_cv: contextvars.ContextVar[str | None] = contextvars.ContextVar("llm_text_model", default=None)
_vision_provider_cv: contextvars.ContextVar[str | None] = contextvars.ContextVar("llm_vision_provider", default=None)
_vision_model_cv: contextvars.ContextVar[str | None] = contextvars.ContextVar("llm_vision_model", default=None)


def set_request_overrides(
    *,
    text_provider: str | None = None,
    text_model: str | None = None,
    vision_provider: str | None = None,
    vision_model: str | None = None,
) -> None:
    """Middleware hook — set the contextvars for the current request only."""
    if text_provider is not None:
        _text_provider_cv.set(text_provider)
    if text_model is not None:
        _text_model_cv.set(text_model)
    if vision_provider is not None:
        _vision_provider_cv.set(vision_provider)
    if vision_model is not None:
        _vision_model_cv.set(vision_model)


def active_text_provider() -> str:
    return _text_provider_cv.get() or settings.LLM_TEXT_PROVIDER


def active_vision_provider() -> str:
    return _vision_provider_cv.get() or settings.LLM_VISION_PROVIDER


def active_text_model(provider: str) -> str:
    return _text_model_cv.get() or settings.LLM_TEXT_MODEL or DEFAULT_TEXT_MODELS.get(provider, "")


def active_vision_model(provider: str) -> str:
    return _vision_model_cv.get() or settings.LLM_VISION_MODEL or DEFAULT_VISION_MODELS.get(provider, "")


# --------------------------------------------------------------------------
# Per-provider defaults — picked to balance quality, cost, and availability.
# Override any of these with LLM_TEXT_MODEL / LLM_VISION_MODEL env vars.
# --------------------------------------------------------------------------

DEFAULT_TEXT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-haiku-4-5-20251001",
    "gemini": "gemini-2.5-flash",
    "minimax": "abab6.5s-chat",
    "qwen": "qwen-plus",
    "glm": "glm-4-flash",
    "ollama": settings.OLLAMA_TEXT_MODEL,
}

DEFAULT_VISION_MODELS = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-6",
    "gemini": "gemini-3.1-flash-image-preview",
    "minimax": "abab6.5s-chat",  # supports vision
    "qwen": "qwen-vl-plus",
    "glm": "glm-4v-flash",
    "ollama": settings.OLLAMA_VISION_MODEL,
}

_OPENAI_COMPAT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "minimax": "https://api.minimax.chat/v1",
    "qwen": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "glm": "https://open.bigmodel.cn/api/paas/v4",
    "ollama": settings.OLLAMA_BASE_URL,
}


def _provider_api_key(provider: str) -> str:
    return {
        "openai": settings.OPENAI_API_KEY,
        "anthropic": settings.ANTHROPIC_API_KEY,
        "gemini": settings.GOOGLE_API_KEY,
        "minimax": settings.MINIMAX_API_KEY,
        "qwen": settings.DASHSCOPE_API_KEY,
        "glm": settings.ZHIPU_API_KEY,
        "ollama": "ollama",  # Ollama ignores the key; send a placeholder.
    }.get(provider, "")


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def _b64_data_url(image_bytes: bytes, mime_type: str) -> str:
    return f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"


def is_text_enabled() -> bool:
    return bool(active_text_provider())


def is_vision_enabled() -> bool:
    return bool(active_vision_provider())


def generate_text(
    prompt: str,
    *,
    session_id: str = "",
    action: str = "text",
) -> str:
    """Run a text-only prompt through the active text provider."""
    provider = active_text_provider()
    if not provider:
        raise LLMDisabledError(
            "LLM text features disabled. Set LLM_TEXT_PROVIDER to one of: "
            + ", ".join(sorted(DEFAULT_TEXT_MODELS.keys()))
        )

    model = active_text_model(provider)
    if provider == "gemini":
        return _gemini_text(prompt, model, session_id=session_id, action=action)
    if provider == "anthropic":
        return _anthropic_text(prompt, model)
    if provider in _OPENAI_COMPAT_BASE_URLS:
        return _openai_compat_text(provider, prompt, model)
    raise LLMError(f"Unknown LLM_TEXT_PROVIDER: {provider!r}")


def generate_from_image(
    image_bytes: bytes,
    mime_type: str,
    prompt: str,
    *,
    session_id: str = "",
    action: str = "vision",
    model_override: str | None = None,
) -> str:
    """Run a vision+text prompt through the active vision provider.

    ``model_override`` lets a caller (e.g. the two-stage sheet detector)
    pin a specific model per call without stomping the session-wide
    contextvar. Useful when a single flow intentionally uses different
    models for different stages.
    """
    provider = active_vision_provider()
    if not provider:
        raise LLMDisabledError(
            "LLM vision features disabled. Set LLM_VISION_PROVIDER to one of: "
            + ", ".join(sorted(DEFAULT_VISION_MODELS.keys()))
        )

    model = model_override or active_vision_model(provider)
    if provider == "gemini":
        return _gemini_vision(
            image_bytes, mime_type, prompt, model,
            session_id=session_id, action=action,
        )
    if provider == "anthropic":
        return _anthropic_vision(image_bytes, mime_type, prompt, model)
    if provider in _OPENAI_COMPAT_BASE_URLS:
        return _openai_compat_vision(provider, image_bytes, mime_type, prompt, model)
    raise LLMError(f"Unknown LLM_VISION_PROVIDER: {provider!r}")


# --------------------------------------------------------------------------
# Gemini — kept first-class so the existing usage_tracker integration
# continues to work without changes.
# --------------------------------------------------------------------------


def _gemini_client():
    from google import genai

    if not settings.GOOGLE_API_KEY:
        raise LLMError("GOOGLE_API_KEY is not set but LLM provider is gemini")
    return genai.Client(api_key=settings.GOOGLE_API_KEY)


def _gemini_text(prompt: str, model: str, *, session_id: str, action: str) -> str:
    client = _gemini_client()
    response = client.models.generate_content(model=model, contents=prompt)
    if session_id:
        from app.services.usage_tracker import track_call
        track_call(session_id, action, response)
    return response.text.strip()


def _gemini_vision(
    image_bytes: bytes, mime_type: str, prompt: str, model: str,
    *, session_id: str, action: str,
) -> str:
    client = _gemini_client()
    response = client.models.generate_content(
        model=model,
        contents=[
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode()}},
                    {"text": prompt},
                ],
            }
        ],
    )
    if session_id:
        from app.services.usage_tracker import track_call
        track_call(session_id, action, response)
    return response.text.strip()


# --------------------------------------------------------------------------
# Anthropic (Claude) — messages API
# --------------------------------------------------------------------------


def _anthropic_client():
    try:
        import anthropic
    except ImportError as e:
        raise LLMError(
            "Anthropic provider selected but 'anthropic' package isn't installed. "
            "Run: pip install anthropic"
        ) from e
    if not settings.ANTHROPIC_API_KEY:
        raise LLMError("ANTHROPIC_API_KEY is not set but LLM provider is anthropic")
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _anthropic_text(prompt: str, model: str) -> str:
    client = _anthropic_client()
    msg = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()


def _anthropic_vision(
    image_bytes: bytes, mime_type: str, prompt: str, model: str,
) -> str:
    client = _anthropic_client()
    msg = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": base64.b64encode(image_bytes).decode(),
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()


# --------------------------------------------------------------------------
# OpenAI-compatible providers — OpenAI / MiniMax / Qwen / GLM / Ollama
# --------------------------------------------------------------------------


def _openai_compat_client(provider: str):
    try:
        from openai import OpenAI
    except ImportError as e:
        raise LLMError(
            "OpenAI-compatible provider selected but 'openai' package isn't installed. "
            "Run: pip install openai"
        ) from e
    api_key = _provider_api_key(provider)
    if provider != "ollama" and not api_key:
        raise LLMError(f"{provider.upper()}_API_KEY is not set but LLM provider is {provider}")
    base_url = _OPENAI_COMPAT_BASE_URLS[provider]
    return OpenAI(api_key=api_key or "placeholder", base_url=base_url)


def _openai_compat_text(provider: str, prompt: str, model: str) -> str:
    client = _openai_compat_client(provider)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    return (resp.choices[0].message.content or "").strip()


def _openai_compat_vision(
    provider: str, image_bytes: bytes, mime_type: str, prompt: str, model: str,
) -> str:
    client = _openai_compat_client(provider)
    data_url = _b64_data_url(image_bytes, mime_type)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
    except Exception as e:
        # Surface a cleaner error for the common case of a text-only model
        # being configured for vision (especially on Ollama).
        raise LLMUnsupportedError(
            f"{provider} model {model!r} doesn't appear to support vision: {e}"
        ) from e
    return (resp.choices[0].message.content or "").strip()
