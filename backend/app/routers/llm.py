# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""GET /api/llm/status — tell the frontend which providers are configured.

Returns per-provider ``configured`` flags so the Settings UI can gray out
providers whose API key is missing from ``.env`` and show actionable
instructions. API keys themselves never leave the server.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.services import llm_service

router = APIRouter()


_PROVIDERS_META = [
    {
        "key": "openai",
        "label": "OpenAI",
        "env_var": "OPENAI_API_KEY",
        "get_key_url": "https://platform.openai.com/api-keys",
        "supports_text": True,
        "supports_vision": True,
    },
    {
        "key": "anthropic",
        "label": "Anthropic (Claude)",
        "env_var": "ANTHROPIC_API_KEY",
        "get_key_url": "https://console.anthropic.com/",
        "supports_text": True,
        "supports_vision": True,
    },
    {
        "key": "gemini",
        "label": "Google Gemini",
        "env_var": "GOOGLE_API_KEY",
        "get_key_url": "https://aistudio.google.com/app/apikey",
        "supports_text": True,
        "supports_vision": True,
    },
    {
        "key": "minimax",
        "label": "MiniMax",
        "env_var": "MINIMAX_API_KEY",
        "get_key_url": "https://api.minimax.chat/",
        "supports_text": True,
        "supports_vision": True,
    },
    {
        "key": "qwen",
        "label": "Qwen (Alibaba DashScope)",
        "env_var": "DASHSCOPE_API_KEY",
        "get_key_url": "https://dashscope.console.aliyun.com/",
        "supports_text": True,
        "supports_vision": True,
    },
    {
        "key": "glm",
        "label": "GLM (Zhipu)",
        "env_var": "ZHIPU_API_KEY",
        "get_key_url": "https://open.bigmodel.cn/",
        "supports_text": True,
        "supports_vision": True,
    },
    {
        "key": "ollama",
        "label": "Ollama (local)",
        "env_var": None,  # no API key, local daemon
        "get_key_url": "https://ollama.com/",
        "supports_text": True,
        "supports_vision": True,
    },
]


def _key_configured(provider_key: str) -> bool:
    mapping = {
        "openai": settings.OPENAI_API_KEY,
        "anthropic": settings.ANTHROPIC_API_KEY,
        "gemini": settings.GOOGLE_API_KEY,
        "minimax": settings.MINIMAX_API_KEY,
        "qwen": settings.DASHSCOPE_API_KEY,
        "glm": settings.ZHIPU_API_KEY,
        "ollama": "local",  # always "configured" — reachability is a runtime concern
    }
    return bool(mapping.get(provider_key))


def _ollama_native_base_url() -> str:
    """OLLAMA_BASE_URL points at the OpenAI-compatible `/v1` endpoint; strip it
    so we can talk to Ollama's native `/api/*` routes."""
    base = settings.OLLAMA_BASE_URL.rstrip("/")
    return base[:-3] if base.endswith("/v1") else base


def _fetch_ollama_capabilities(base: str, name: str) -> list[str]:
    import json
    import urllib.request

    try:
        payload = json.dumps({"name": name}).encode()
        req = urllib.request.Request(
            f"{base}/api/show", data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            show = json.loads(r.read().decode())
        return show.get("capabilities", []) or []
    except Exception:
        return []


@router.get("/ollama-models")
async def ollama_models():
    """List local Ollama models so the Settings page can show a dropdown.

    Returns two lists — text-capable and vision-capable — since Ollama's
    ``/api/tags`` doesn't expose capabilities. We call ``/api/show`` for
    each model in parallel via ``asyncio.gather`` + ``to_thread`` so the
    async event loop isn't blocked by synchronous urllib on a 10-model box.
    """
    import asyncio
    import json
    import urllib.request

    base = _ollama_native_base_url()
    try:
        data = await asyncio.to_thread(
            lambda: json.loads(urllib.request.urlopen(f"{base}/api/tags", timeout=5).read().decode())
        )
    except Exception as e:
        return {"available": False, "error": str(e), "text": [], "vision": []}

    names = [m["name"] for m in data.get("models", []) if m.get("name")]
    caps_results = await asyncio.gather(
        *(asyncio.to_thread(_fetch_ollama_capabilities, base, n) for n in names)
    )

    text_models: list[str] = []
    vision_models: list[str] = []
    for name, caps in zip(names, caps_results):
        if "vision" in caps:
            vision_models.append(name)
        # Unknown capabilities = safer to assume text-only than to hide the
        # model from the dropdown entirely.
        if "completion" in caps or "vision" in caps or not caps:
            text_models.append(name)

    return {
        "available": True,
        "text": sorted(text_models),
        "vision": sorted(vision_models),
    }


@router.get("/status")
async def llm_status():
    # Reflect any per-request overrides the middleware applied from X-LLM-*
    # headers, so the frontend sees the active provider for *this* session
    # — not just what .env says.
    active_text = llm_service.active_text_provider()
    active_vision = llm_service.active_vision_provider()

    providers = []
    for meta in _PROVIDERS_META:
        providers.append({
            **meta,
            "configured": _key_configured(meta["key"]),
            "default_text_model": llm_service.DEFAULT_TEXT_MODELS.get(meta["key"], ""),
            "default_vision_model": llm_service.DEFAULT_VISION_MODELS.get(meta["key"], ""),
        })

    return {
        "active": {
            "text_provider": active_text,
            "vision_provider": active_vision,
        },
        "env_defaults": {
            "text_provider": settings.LLM_TEXT_PROVIDER,
            "vision_provider": settings.LLM_VISION_PROVIDER,
        },
        "providers": providers,
    }
