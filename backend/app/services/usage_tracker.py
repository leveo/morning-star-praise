"""Track LLM API usage and estimate costs per session."""

import threading
import time
import uuid
from dataclasses import dataclass, field

# Gemini 2.5 Flash pricing (per million tokens, as of April 2026)
# https://ai.google.dev/pricing
GEMINI_FLASH_PRICING = {
    "input_per_million": 0.15,     # $0.15 per 1M input tokens
    "output_per_million": 0.60,    # $0.60 per 1M output tokens
    "image_per_image": 0.0026,     # ~$0.0026 per image (258 tokens at input rate)
}


@dataclass
class LLMCall:
    action: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    image_count: int = 0
    timestamp: float = field(default_factory=time.time)

    @property
    def cost(self) -> float:
        input_cost = (self.input_tokens / 1_000_000) * GEMINI_FLASH_PRICING["input_per_million"]
        output_cost = (self.output_tokens / 1_000_000) * GEMINI_FLASH_PRICING["output_per_million"]
        image_cost = self.image_count * GEMINI_FLASH_PRICING["image_per_image"]
        return input_cost + output_cost + image_cost


@dataclass
class SessionUsage:
    session_id: str
    calls: list[LLMCall] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

    @property
    def total_cost(self) -> float:
        return sum(c.cost for c in self.calls)

    @property
    def total_input_tokens(self) -> int:
        return sum(c.input_tokens for c in self.calls)

    @property
    def total_output_tokens(self) -> int:
        return sum(c.output_tokens for c in self.calls)

    @property
    def total_images(self) -> int:
        return sum(c.image_count for c in self.calls)

    def summary(self) -> dict:
        return {
            "session_id": self.session_id,
            "total_calls": len(self.calls),
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_images": self.total_images,
            "total_cost_usd": round(self.total_cost, 6),
            "calls": [
                {
                    "action": c.action,
                    "input_tokens": c.input_tokens,
                    "output_tokens": c.output_tokens,
                    "images": c.image_count,
                    "cost_usd": round(c.cost, 6),
                }
                for c in self.calls
            ],
        }


# In-memory session store (keyed by session_id)
_sessions: dict[str, SessionUsage] = {}
_lock = threading.Lock()
# Auto-expire sessions after 2 hours
_SESSION_TTL = 7200


def get_session(session_id: str) -> SessionUsage:
    with _lock:
        if session_id not in _sessions:
            _sessions[session_id] = SessionUsage(session_id=session_id)
        return _sessions[session_id]


def create_session() -> str:
    sid = uuid.uuid4().hex[:12]
    with _lock:
        _sessions[sid] = SessionUsage(session_id=sid)
        # Cleanup old sessions
        now = time.time()
        expired = [k for k, v in _sessions.items() if now - v.created_at > _SESSION_TTL]
        for k in expired:
            del _sessions[k]
    return sid


def track_call(session_id: str, action: str, response) -> None:
    """Track a Gemini API call. Extracts token usage from response metadata."""
    session = get_session(session_id)

    input_tokens = 0
    output_tokens = 0
    image_count = 0

    # Extract usage from Gemini response
    if hasattr(response, 'usage_metadata') and response.usage_metadata:
        meta = response.usage_metadata
        input_tokens = getattr(meta, 'prompt_token_count', 0) or 0
        output_tokens = getattr(meta, 'candidates_token_count', 0) or 0

    # Count images in the request (estimated from action name)
    if action in ("ocr", "frame_filter", "frame_ocr", "image_scale"):
        image_count = 1

    call = LLMCall(
        action=action,
        model="gemini-2.5-flash",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        image_count=image_count,
    )
    session.calls.append(call)
