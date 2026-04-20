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
