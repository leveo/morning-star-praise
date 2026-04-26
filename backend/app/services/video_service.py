# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Worship video generation pipeline.

Pipeline:
  1. `transcribe_audio` runs faster-whisper with word timestamps.
  2. `align_chunks_to_timeline` maps user lyric chunks to whisper-derived
     times via a cumulative-character interpolation curve.
  3. `render_via_remotion` copies audio + backgrounds into a per-job public
     directory, writes `props.json`, and invokes `npx remotion render` on the
     WorshipVideo composition to produce the MP4.
  4. `write_srt` emits a matching SRT file alongside the MP4.

The Remotion composition (`remotion/src/WorshipVideo.tsx`) is the canonical
place to tweak layout, fonts, animations, and transitions.
"""

import json
import logging
import re
import shutil
import string
import subprocess
import threading
import uuid
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Callable, Optional

from app.config import settings
from app.services.chinese_service import is_cjk_char

logger = logging.getLogger(__name__)

# Lazily-loaded Whisper model (large-v3 = ~3GB RAM + ~3GB disk first time).
# Under concurrent /analyze requests on a cold process the double-checked
# load has to be serialized — otherwise two workers race the 3GB download.
_whisper_model = None
_whisper_model_lock = threading.Lock()


@dataclass
class TimedChunk:
    text: str
    start: float
    end: float


@dataclass
class WhisperWord:
    text: str
    start: float
    end: float


ProgressCb = Optional[Callable[[str, int], None]]


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    with _whisper_model_lock:
        if _whisper_model is None:
            from faster_whisper import WhisperModel

            logger.info(
                "Loading Whisper model %s (compute_type=%s)",
                settings.WHISPER_MODEL,
                settings.WHISPER_COMPUTE_TYPE,
            )
            _whisper_model = WhisperModel(
                settings.WHISPER_MODEL,
                device="cpu",
                compute_type=settings.WHISPER_COMPUTE_TYPE,
            )
    return _whisper_model


_MAX_PROMPT_CHARS = 448  # whisper's prompt context is ~224 tokens ≈ this many chars
_MAX_CONSECUTIVE_REPEAT = 3  # drop a word/char that repeats as the 4th+ in a run

_ALIGN_SUPPORTED_LANGS = {"en", "zh"}  # languages we have wav2vec2 models for
_align_model_cache: dict[str, tuple[object, object] | tuple[None, None]] = {}
_align_model_lock = threading.Lock()


def _get_align_model(language_code: str):
    """Lazily load (and cache) a whisperx wav2vec2 alignment model.

    Returns ``(model, metadata)`` or ``(None, None)`` if unavailable. The
    result is cached per-language so repeat calls are free; concurrent
    callers are serialized to avoid double-loading the same model.
    """
    if language_code not in _ALIGN_SUPPORTED_LANGS:
        return (None, None)
    with _align_model_lock:
        cached = _align_model_cache.get(language_code)
        if cached is not None:
            return cached
        try:
            import whisperx

            logger.info("Loading wav2vec2 alignment model for %s", language_code)
            model, metadata = whisperx.load_align_model(
                language_code=language_code, device="cpu"
            )
            _align_model_cache[language_code] = (model, metadata)
            return (model, metadata)
        except Exception as exc:
            logger.warning("Failed to load wav2vec2 align model for %s: %s",
                           language_code, exc)
            _align_model_cache[language_code] = (None, None)
            return (None, None)


def preload_align_model(language_code: str = "en") -> bool:
    """Eagerly load an alignment model so the first request doesn't pay for it."""
    model, _ = _get_align_model(language_code)
    return model is not None


def _group_words_into_segments(
    words: list[WhisperWord], max_gap: float = 3.0
) -> list[dict]:
    """Break a flat word list into contiguous segments separated by silence.

    Used to feed whisperx.align with short chunks instead of one giant
    transcript — matches how whisperx was designed to be called and makes
    its char-level CTC alignment more stable.
    """
    segments: list[dict] = []
    current_words: list[WhisperWord] = []
    current_start: float | None = None
    for w in words:
        if current_start is None:
            current_start = w.start
            current_words = [w]
            continue
        if w.start - current_words[-1].end > max_gap:
            segments.append(
                {
                    "text": " ".join(cw.text for cw in current_words),
                    "start": float(current_start),
                    "end": float(current_words[-1].end),
                }
            )
            current_start = w.start
            current_words = [w]
        else:
            current_words.append(w)
    if current_words and current_start is not None:
        segments.append(
            {
                "text": " ".join(cw.text for cw in current_words),
                "start": float(current_start),
                "end": float(current_words[-1].end),
            }
        )
    return segments


def _refine_with_whisperx(
    audio_path: Path,
    raw_words: list[WhisperWord],
    language_code: str,
) -> list[WhisperWord] | None:
    """Forced-align ``raw_words``' text to the audio via wav2vec2.

    Returns a new list of ``WhisperWord`` with CTC-refined timestamps, or
    ``None`` if alignment is unavailable, fails, or looks degenerate (e.g.
    the Chinese wav2vec2 model sometimes collapses sung vowels into
    ~20ms windows, which is worse than the original whisper timestamps).
    """
    if not raw_words or language_code not in _ALIGN_SUPPORTED_LANGS:
        return None

    align_model, align_metadata = _get_align_model(language_code)
    if align_model is None or align_metadata is None:
        return None

    try:
        import numpy as np
        import soundfile as sf
        import whisperx
    except ImportError:
        return None

    try:
        audio, sr = sf.read(str(audio_path), dtype="float32")
    except Exception as exc:
        logger.warning("whisperx refine: failed to load audio: %s", exc)
        return None
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != 16000:
        try:
            from scipy.signal import resample_poly

            audio = resample_poly(audio, 16000, sr).astype("float32")
        except Exception as exc:
            logger.warning("whisperx refine: resample failed: %s", exc)
            return None

    segments = _group_words_into_segments(raw_words)
    if not segments:
        return None

    try:
        result = whisperx.align(
            segments, align_model, align_metadata, audio, "cpu",
            return_char_alignments=False,
            print_progress=False,
        )
    except Exception as exc:
        logger.warning("whisperx refine: align failed: %s", exc)
        return None

    refined: list[WhisperWord] = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            start = w.get("start")
            end = w.get("end")
            if start is None or end is None:
                continue
            text = (w.get("word") or "").strip()
            if not text:
                continue
            refined.append(
                WhisperWord(text=text, start=float(start), end=float(end))
            )

    if not refined:
        logger.warning("whisperx refine: produced 0 words, falling back")
        return None

    # Quality gate: wav2vec2 models for Chinese sung audio sometimes
    # collapse every character into a ~20ms window. If more than half
    # the refined words are that short, the model has failed — keep the
    # original faster-whisper timestamps instead.
    very_short = sum(1 for w in refined if (w.end - w.start) < 0.02)
    if very_short > len(refined) * 0.5:
        logger.warning(
            "whisperx refine: %d/%d words <20ms, discarding as collapsed",
            very_short, len(refined),
        )
        return None

    logger.info("whisperx refine: %d → %d words", len(raw_words), len(refined))
    return refined


def _cap_word_durations(words: list[WhisperWord]) -> list[WhisperWord]:
    """Clip each word's end to the next word's start so a single over-long
    sustained note can't push downstream slide boundaries past their
    neighbors. The word's start is preserved — only the end is trimmed.
    """
    if len(words) < 2:
        return words
    out = list(words)
    for i in range(len(out) - 1):
        if out[i].end > out[i + 1].start:
            out[i] = WhisperWord(
                text=out[i].text,
                start=out[i].start,
                end=out[i + 1].start,
            )
    return out


def _strip_hallucinated_repeats(words: list[WhisperWord]) -> list[WhisperWord]:
    """Drop words caught in repeat-loop hallucinations.

    Whisper on sung Chinese loves to emit runs like ``我 我 我 我 我`` or
    ``我愛你 我愛你 我愛你 我愛你``. If the same normalized token appears
    4+ times back-to-back, we keep the first three and drop the rest of
    the run — enough to preserve genuinely repeated lyric words while
    chopping the hallucination tail.
    """
    out: list[WhisperWord] = []
    run_key: str | None = None
    run_len = 0
    for w in words:
        key = w.text.strip().lower()
        if key and key == run_key:
            run_len += 1
            if run_len > _MAX_CONSECUTIVE_REPEAT:
                continue
        else:
            run_key = key
            run_len = 1
        out.append(w)
    return out


def transcribe_audio(
    audio_path: Path,
    language: str | None = None,
    on_progress: ProgressCb = None,
    initial_prompt: str | None = None,
) -> tuple[list[WhisperWord], float]:
    """Transcribe audio via faster-whisper, optimized for sung lyrics.

    Returns ``(words, duration_sec)``. The duration comes from the whisper
    ``info`` block — no second ffprobe pass needed.

    Parameters
    ----------
    initial_prompt:
        Text shown to whisper's decoder as a bias before transcription.
        When the user provides lyrics, pass them through — this biases
        decoding toward the real words and is one of the most effective
        ways to prevent repeat-loop hallucinations on sung audio.
    """
    if on_progress:
        on_progress("Loading Whisper model (first run downloads ~3GB)", 10)
    model = _get_whisper_model()

    if on_progress:
        on_progress("Transcribing audio", 25)

    lang = None if language in (None, "", "auto") else language
    # Whisper's prompt has a fixed ~224-token budget; truncate the tail
    # instead of the head so the first lines of a song (usually the ones
    # whisper hits first) are always represented.
    prompt = None
    if initial_prompt:
        cleaned = " ".join(initial_prompt.split())
        if len(cleaned) > _MAX_PROMPT_CHARS:
            cleaned = cleaned[:_MAX_PROMPT_CHARS]
        prompt = cleaned or None

    # VAD is intentionally off: faster-whisper's Silero VAD is tuned for
    # speech and aggressively discards sung/music frames, which drops 95%+
    # of the words on worship songs with sustained notes or instrumental
    # swells. We compensate for the hallucination risk with:
    #   - initial_prompt biasing decoding toward the actual lyrics
    #   - condition_on_previous_text=False to stop runaway repeat loops
    #     from cascading between segments (the classic ``我愛你我愛你`` bug)
    #   - tighter compression_ratio / log_prob thresholds to auto-reject
    #     segments whose output looks like a degenerate loop
    #   - a post-hoc ``_strip_hallucinated_repeats`` pass as a safety net
    #   - optional whisperx wav2vec2 forced alignment to refine word
    #     timestamps (see ``_refine_with_whisperx``)
    segments, info = model.transcribe(
        str(audio_path),
        language=lang,
        word_timestamps=True,
        vad_filter=False,
        beam_size=10,
        initial_prompt=prompt,
        condition_on_previous_text=False,
        compression_ratio_threshold=2.0,
        log_prob_threshold=-0.8,
        no_speech_threshold=0.6,
        hallucination_silence_threshold=2.0,
    )

    words: list[WhisperWord] = []
    for seg in segments:
        if not seg.words:
            continue
        for w in seg.words:
            t = (w.word or "").strip()
            if t:
                words.append(WhisperWord(text=t, start=float(w.start), end=float(w.end)))

    filtered = _strip_hallucinated_repeats(words)
    if len(filtered) != len(words):
        logger.info(
            "Dropped %d hallucinated repeat words", len(words) - len(filtered)
        )

    duration = float(getattr(info, "duration", 0.0) or 0.0)

    if on_progress:
        on_progress("Refining word timings (wav2vec2)", 45)
    refined = _refine_with_whisperx(audio_path, filtered, lang or "en")
    if refined is not None:
        filtered = refined

    filtered = _cap_word_durations(filtered)

    logger.info("Transcribed %d words (duration=%.2fs)", len(filtered), duration)
    if on_progress:
        on_progress(f"Transcribed {len(filtered)} words", 50)
    return filtered, duration


_PUNCT_CHARS = frozenset(
    string.punctuation
    + "，。；：！？、「」『』（）《》【】〈〉—…·．～“”‘’"
)


def _normalize_for_alignment(ch: str) -> str:
    """Canonical form for matching user lyrics against whisper output.

    Drops whitespace + punctuation (whisper doesn't emit punctuation), lowers
    Latin letters for case-insensitive matching, passes CJK through unchanged.
    Returns '' for chars that should be dropped from the alignment stream.
    """
    if ch.isspace() or ch in _PUNCT_CHARS:
        return ""
    return ch.lower()


def _meaningful_chars(text: str) -> list[str]:
    out: list[str] = []
    for ch in text:
        n = _normalize_for_alignment(ch)
        if n:
            out.append(n)
    return out


def _build_whisper_chars(
    whisper_words: list[WhisperWord],
) -> list[tuple[str, float, float]]:
    """Flatten whisper word timestamps into ``(normalized_char, start, end)``.

    If a whisper 'word' carries multiple alignment-meaningful chars (common
    for English), the word duration is split linearly across them. CJK
    whisper tokens are typically one char per word already.
    """
    out: list[tuple[str, float, float]] = []
    for w in whisper_words:
        chars = _meaningful_chars(w.text or "")
        k = len(chars)
        if k == 0:
            continue
        w_start = float(w.start)
        w_end = float(w.end)
        dur = max(w_end - w_start, 1e-3)
        step = dur / k
        for idx, nc in enumerate(chars):
            out.append((nc, w_start + idx * step, w_start + (idx + 1) * step))
    return out


def _align_user_to_whisper(
    user_chars: list[str],
    whisper_chars: list[tuple[str, float, float]],
) -> list[float]:
    """Map each user char index to a fractional whisper-char index.

    Uses ``difflib.SequenceMatcher`` on the normalized char streams to find
    maximum matching blocks. Anchor positions are direct; stretches of user
    chars between anchors get linear interpolation so mistranscribed /
    missing words still land at roughly the right spot on the timeline.
    """
    n_user = len(user_chars)
    n_whisper = len(whisper_chars)
    if n_user == 0 or n_whisper == 0:
        return [0.0] * n_user

    whisper_str = "".join(c for c, _, _ in whisper_chars)
    user_str = "".join(user_chars)

    matcher = SequenceMatcher(a=whisper_str, b=user_str, autojunk=False)
    mapping: list[float] = [-1.0] * n_user
    for wi, ui, n in matcher.get_matching_blocks():
        for k in range(n):
            if 0 <= ui + k < n_user:
                mapping[ui + k] = float(wi + k)

    if all(v < 0 for v in mapping):
        return [i * n_whisper / max(n_user, 1) for i in range(n_user)]

    first_idx = 0
    while first_idx < n_user and mapping[first_idx] < 0:
        first_idx += 1
    first_wi = mapping[first_idx]
    if first_idx > 0:
        for k in range(first_idx):
            mapping[k] = first_wi * k / first_idx

    prev_ui = first_idx
    prev_wi = first_wi
    for i in range(first_idx + 1, n_user):
        if mapping[i] >= 0:
            gap = i - prev_ui
            if gap > 1:
                step = (mapping[i] - prev_wi) / gap
                for k in range(prev_ui + 1, i):
                    mapping[k] = prev_wi + (k - prev_ui) * step
            prev_ui = i
            prev_wi = mapping[i]

    if prev_ui < n_user - 1:
        remaining = n_user - 1 - prev_ui
        target = float(n_whisper - 1)
        delta = target - prev_wi
        for k in range(prev_ui + 1, n_user):
            mapping[k] = prev_wi + (k - prev_ui) / remaining * delta

    return mapping


class _CharTimeCurve:
    """Maps user lyric chars to whisper timestamps via text alignment.

    Rather than scaling by total char counts (which breaks when whisper
    mistranscribes or loses words), this runs ``difflib.SequenceMatcher`` on
    the normalized user lyrics vs. whisper's transcription to produce a
    per-char mapping. Each user char resolves to a precise time on the audio
    timeline — silence gaps between whisper words are respected, and user
    words that whisper missed still land at roughly the right spot.
    """

    def __init__(
        self,
        whisper_words: list[WhisperWord],
        user_chars: list[str],
        audio_duration: float,
        intro_offset: float = 0.0,
    ):
        self.audio_duration = audio_duration
        self.intro_offset = intro_offset
        self.user_chars = user_chars
        self.total_user_chars = max(len(user_chars), 1)
        self.whisper_chars = _build_whisper_chars(whisper_words)
        self.user_to_whisper: list[float] = (
            _align_user_to_whisper(user_chars, self.whisper_chars)
            if self.whisper_chars and user_chars
            else []
        )
        self.first_word_start: float = (
            float(whisper_words[0].start)
            if whisper_words
            else max(intro_offset, 0.5)
        )

    def _fallback(self, user_char_idx: int) -> float:
        span = max(self.audio_duration - self.intro_offset, 1.0)
        return self.intro_offset + user_char_idx * span / self.total_user_chars

    def time_at_start(self, user_char_idx: int) -> float:
        """Time when the user char at ``user_char_idx`` starts being sung."""
        if not self.whisper_chars or not self.user_to_whisper:
            return self._fallback(user_char_idx)
        if user_char_idx <= 0:
            return self.first_word_start
        if user_char_idx >= len(self.user_to_whisper):
            return float(self.whisper_chars[-1][2])

        whisper_idx = self.user_to_whisper[user_char_idx]
        n = len(self.whisper_chars)
        if whisper_idx <= 0:
            return float(self.whisper_chars[0][1])
        if whisper_idx >= n - 1:
            return float(self.whisper_chars[-1][1])

        lo = int(whisper_idx)
        frac = whisper_idx - lo
        a_start = self.whisper_chars[lo][1]
        b_start = self.whisper_chars[lo + 1][1]
        return a_start + frac * (b_start - a_start)


# ---------------------------------------------------------------------------
# Stanza-level audio matching
# ---------------------------------------------------------------------------


def split_text_into_stanzas(text: str) -> list[str]:
    """Split lyric text into stanzas (blank-line-separated blocks).

    Thin wrapper around ``lyrics_service._raw_verses`` that joins each
    verse's lines back into a single string — so the stanza detector and
    the slide parser never drift apart on what counts as a verse boundary.
    """
    from app.services.lyrics_service import _raw_verses

    return ["\n".join(lines) for lines in _raw_verses(text)]


@dataclass
class StanzaOccurrence:
    """One occurrence of a user stanza inside the audio timeline."""

    stanza_idx: int
    start_sec: float
    end_sec: float
    score: float  # 0..1 match quality


def identify_stanza_sequence(
    stanzas: list[str],
    whisper_words: list[WhisperWord],
    min_score: float = 0.35,
) -> list[StanzaOccurrence]:
    """Figure out the order (with repetitions) in which user stanzas are sung.

    Greedy: walks through whisper's char stream and, at each position, tries
    every stanza and picks the one whose first-k chars best match starting
    here. Advances past the matched region, repeats. A stanza may be chosen
    multiple times (e.g. chorus → chorus → chorus).

    Returns the occurrences in time order. If no stanza matches anywhere,
    returns a single dummy occurrence covering the whole audio with the
    concatenation of all stanzas (so the pipeline always has something to
    render).
    """
    whisper_chars = _build_whisper_chars(whisper_words)
    if not stanzas or not whisper_chars:
        return []

    whisper_str = "".join(c for c, _, _ in whisper_chars)
    stanza_strs = ["".join(_meaningful_chars(s)) for s in stanzas]
    non_empty_stanza_idxs = [i for i, s in enumerate(stanza_strs) if s]
    if not non_empty_stanza_idxs:
        return []

    results: list[StanzaOccurrence] = []
    pos = 0
    n_whisper = len(whisper_str)

    while pos < n_whisper:
        best: tuple[int, int, int, float] | None = None  # (sidx, start, end, score)
        for sidx in non_empty_stanza_idxs:
            s = stanza_strs[sidx]
            slen = len(s)
            # Look ahead up to ~1.5x the stanza length to allow whisper to
            # be longer/shorter than the user text.
            window_end = min(pos + max(int(slen * 1.6), slen + 20), n_whisper)
            window = whisper_str[pos:window_end]
            if not window:
                continue
            matcher = SequenceMatcher(a=window, b=s, autojunk=False)
            blocks = matcher.get_matching_blocks()
            total_matched = sum(n for _, _, n in blocks)
            if total_matched == 0:
                continue
            score = total_matched / slen
            if score < min_score:
                continue
            # Where in the window does the match start / end? We want the
            # stanza to START near pos (first matched char in window is near
            # 0), otherwise this stanza doesn't actually begin here.
            first_a: int | None = None
            last_a = 0
            for wa, _, n in blocks:
                if n > 0:
                    if first_a is None:
                        first_a = wa
                    last_a = max(last_a, wa + n)
            if first_a is None:
                continue
            # If the LCS match already spans the full stanza (e.g. a hymn
            # that sings the verse twice back-to-back in one window), trust
            # it — SequenceMatcher just picked one of several valid anchor
            # positions, and punishing first_a would drop the correct
            # stanza below a near-identical sibling.
            coverage = (last_a - first_a) / slen if slen else 0
            if coverage >= 0.85:
                start_offset_penalty = 0.0
            else:
                start_offset_penalty = min(first_a / max(slen, 1), 0.5)
                if first_a > max(slen * 0.35, 6):
                    continue
            effective_score = score - start_offset_penalty
            if best is None or effective_score > best[3]:
                best = (sidx, pos + first_a, pos + last_a, effective_score)

        if best is None:
            pos += 1
            continue

        sidx, w_start_idx, w_end_idx, score = best
        w_end_idx = min(max(w_end_idx, w_start_idx + 1), n_whisper)
        start_sec = float(whisper_chars[w_start_idx][1])
        end_sec = float(whisper_chars[w_end_idx - 1][2])
        results.append(
            StanzaOccurrence(
                stanza_idx=sidx,
                start_sec=start_sec,
                end_sec=end_sec,
                score=float(score),
            )
        )
        pos = w_end_idx

    if not results:
        total = float(whisper_chars[-1][2]) if whisper_chars else 0.0
        results = [
            StanzaOccurrence(stanza_idx=i, start_sec=i * total / max(len(stanzas), 1),
                             end_sec=(i + 1) * total / max(len(stanzas), 1), score=0.0)
            for i in range(len(stanzas))
        ]
    return results


@dataclass(slots=True)
class CharCurveCache:
    """Shared alignment cache — one build per render, reused across callers.

    The curve is O(n²) to construct (SequenceMatcher), so we build it once
    in the first caller and let siblings reuse it via this cache object.
    """
    curve: "_CharTimeCurve | None" = None
    chunk_char_lists: list[list[str]] | None = None
    chunk_lens: list[int] | None = None

    def fill(
        self,
        lyric_chunks: list[str],
        whisper_words: list[WhisperWord],
        audio_duration: float,
        intro_offset: float,
    ) -> None:
        if self.curve is not None:
            return
        self.chunk_char_lists = [_meaningful_chars(c) for c in lyric_chunks]
        self.chunk_lens = [len(cl) for cl in self.chunk_char_lists]
        flat_user_chars: list[str] = [c for cl in self.chunk_char_lists for c in cl]
        self.curve = _CharTimeCurve(
            whisper_words, flat_user_chars, audio_duration, intro_offset
        )


def align_chunks_to_timeline(
    lyric_chunks: list[str],
    whisper_words: list[WhisperWord],
    audio_duration: float,
    intro_offset: float = 0.0,
    curve_cache: CharCurveCache | None = None,
) -> list[TimedChunk]:
    """Map user lyric chunks onto the whisper timeline.

    ``chunk.end`` equals the next chunk's ``start`` so the current slide
    holds through any silence gap; the last chunk extends to
    ``audio_duration``.
    """
    if not lyric_chunks:
        return []

    cache = curve_cache or CharCurveCache()
    cache.fill(lyric_chunks, whisper_words, audio_duration, intro_offset)
    curve = cache.curve
    chunk_lens = cache.chunk_lens

    results: list[TimedChunk] = []
    cum = 0
    for i, chunk in enumerate(lyric_chunks):
        start = curve.time_at_start(cum)
        cum += chunk_lens[i]
        if i == len(lyric_chunks) - 1:
            end = audio_duration
        else:
            end = curve.time_at_start(cum)
        if end <= start:
            end = min(start + 0.5, audio_duration)
        results.append(TimedChunk(text=chunk, start=start, end=end))
    return results


def _redistribute_chunk_unit_times(
    units: list[dict],
    chunk_start: float,
    chunk_end: float,
) -> None:
    """Repair per-chunk karaoke unit times using the chunk's own window.

    Whisper occasionally compresses a run of words into a tiny time window
    (e.g. 8 CJK chars crammed into 0.1s of timeline). Raw char-level
    alignment then clusters every unit inside that window, so every char
    lights up simultaneously and often earlier than actually sung. When
    the raw span covers less than half the chunk duration, fall back to
    the chunk's stanza-level timing — it's derived from whole-verse audio
    matching and is much more reliable.
    """
    timed_idx = [i for i, u in enumerate(units) if u.get("startSec") is not None]
    if not timed_idx:
        return
    chunk_dur = max(chunk_end - chunk_start, 0.1)
    raw = [units[i]["startSec"] for i in timed_idx]
    raw_span = max(raw) - min(raw)
    # Trail keeps the last char's ramp inside the slide, not across the crossfade.
    trail = min(0.1, 0.05 * chunk_dur)
    span_end = chunk_end - trail
    n = len(timed_idx)

    if raw_span >= 0.5 * chunk_dur:
        min_gap = min(0.04, max(0.0, (span_end - chunk_start) / max(n, 1)))
        prev = chunk_start - min_gap
        for i in timed_idx:
            t = max(chunk_start, min(units[i]["startSec"], span_end))
            if t <= prev + min_gap:
                t = prev + min_gap
            units[i]["startSec"] = round(t, 3)
            prev = t
        return

    for k, i in enumerate(timed_idx):
        frac = k / max(n - 1, 1) if n > 1 else 0.0
        units[i]["startSec"] = round(chunk_start + frac * (span_end - chunk_start), 3)


def compute_chunk_units(
    lyric_chunks: list[str],
    whisper_words: list[WhisperWord],
    audio_duration: float,
    intro_offset: float = 0.0,
    curve_cache: CharCurveCache | None = None,
    timed_chunks: list["TimedChunk"] | None = None,
) -> list[list[dict]]:
    """For each chunk, return a list of karaoke units {text, startSec, isLineBreak}.

    Splitting rules:
      * ``\\n`` → entry with ``isLineBreak=True`` (no startSec).
      * Whitespace / punctuation → entry with ``startSec=None``.
      * CJK char → its own animated unit.
      * Latin/digit word → one unit that lights up at its first char's start.
    """
    if not lyric_chunks:
        return []

    cache = curve_cache or CharCurveCache()
    cache.fill(lyric_chunks, whisper_words, audio_duration, intro_offset)
    curve = cache.curve
    chunk_char_lists = cache.chunk_char_lists

    base_offsets: list[int] = []
    cum = 0
    for cl in chunk_char_lists:
        base_offsets.append(cum)
        cum += len(cl)

    all_units: list[list[dict]] = []
    for chunk_idx, chunk in enumerate(lyric_chunks):
        units: list[dict] = []
        char_pos = 0  # alignment-meaningful chars seen within this chunk
        i = 0
        while i < len(chunk):
            ch = chunk[i]
            if ch == "\n":
                units.append({"text": "", "startSec": None, "isLineBreak": True})
                i += 1
                continue
            if ch.isspace() or _normalize_for_alignment(ch) == "":
                units.append({"text": ch, "startSec": None, "isLineBreak": False})
                i += 1
                continue
            global_pos = base_offsets[chunk_idx] + char_pos
            if is_cjk_char(ch):
                units.append(
                    {
                        "text": ch,
                        "startSec": round(curve.time_at_start(global_pos), 3),
                        "isLineBreak": False,
                    }
                )
                char_pos += 1
                i += 1
                continue
            # Latin / digit word — accumulate until whitespace, newline,
            # punctuation, or CJK.
            j = i
            while (
                j < len(chunk)
                and chunk[j] != "\n"
                and not chunk[j].isspace()
                and _normalize_for_alignment(chunk[j]) != ""
                and not is_cjk_char(chunk[j])
            ):
                j += 1
            word = chunk[i:j]
            word_len = sum(1 for c in word if _normalize_for_alignment(c))
            units.append(
                {
                    "text": word,
                    "startSec": round(curve.time_at_start(global_pos), 3),
                    "isLineBreak": False,
                }
            )
            char_pos += word_len
            i = j
        if timed_chunks and chunk_idx < len(timed_chunks):
            tc = timed_chunks[chunk_idx]
            _redistribute_chunk_unit_times(units, tc.start, tc.end)
        all_units.append(units)
    return all_units


def _format_srt_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms >= 1000:
        ms = 0
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(chunks: list[TimedChunk], output_path: Path) -> None:
    lines = []
    for i, c in enumerate(chunks, start=1):
        lines.append(str(i))
        lines.append(f"{_format_srt_time(c.start)} --> {_format_srt_time(c.end)}")
        lines.append(c.text)
        lines.append("")
    output_path.write_text("\n".join(lines), encoding="utf-8")


def render_via_remotion(
    audio_path: Path,
    title: str,
    composer: str,
    language: str,
    timed: list[TimedChunk],
    background_paths: list[Path | None],
    audio_duration: float,
    intro_duration: float,
    work_dir: Path,
    output_path: Path,
    on_progress: ProgressCb = None,
    karaoke_units: list[list[dict]] | None = None,
    primary_font_size: int | None = None,
    secondary_font_size: int | None = None,
    line_spacing_multiplier: float | None = None,
    show_page_numbers: bool = False,
    padding_style: str = "dark",
    sheet_crop_paths: list[Path] | None = None,
) -> None:
    """Copy assets into a per-job public dir, write props.json, run Remotion."""
    project_dir = settings.REMOTION_PROJECT_DIR
    if not project_dir.exists():
        raise RuntimeError(
            f"Remotion project not found at {project_dir}. "
            "Run `cd remotion && npm install` first."
        )

    public_dir = work_dir / "remotion_public"
    public_dir.mkdir(parents=True, exist_ok=True)

    audio_name = f"audio{audio_path.suffix.lower() or '.mp3'}"
    shutil.copy2(audio_path, public_dir / audio_name)

    def _make_asset_copier(prefix: str):
        cache: dict[str, str] = {}

        def name_for(p: Path | None) -> str | None:
            if not p or not p.exists():
                return None
            key = str(p.resolve())
            if key in cache:
                return cache[key]
            safe = f"{prefix}_{len(cache):03d}{p.suffix.lower()}"
            shutil.copy2(p, public_dir / safe)
            cache[key] = safe
            return safe

        return name_for

    _bg_name_for = _make_asset_copier("bg")
    _sheet_name_for = _make_asset_copier("sheet")

    title_bg_name = _bg_name_for(background_paths[0]) if background_paths else None
    content_bgs: list[Path | None] = (
        background_paths[1:] if len(background_paths) > 1 else list(background_paths)
    )
    if not content_bgs:
        content_bgs = [None]

    sheets: list[Path] = list(sheet_crop_paths) if sheet_crop_paths else []

    chunks_payload = []
    for i, tc in enumerate(timed):
        bg = content_bgs[i % len(content_bgs)]
        chunk_dict: dict = {
            "text": tc.text,
            "startSec": round(float(tc.start), 3),
            "endSec": round(float(tc.end), 3),
            "backgroundSrc": _bg_name_for(bg),
        }
        if sheets:
            # Cycle the available crops so a score with N systems covers
            # M>N slides (typical when verses repeat).
            chunk_dict["sheetImageSrc"] = _sheet_name_for(sheets[i % len(sheets)])
        if karaoke_units and i < len(karaoke_units):
            chunk_dict["units"] = karaoke_units[i]
        chunks_payload.append(chunk_dict)

    props = {
        "title": title or "",
        "composer": composer or "",
        "language": language or "auto",
        "audioSrc": audio_name,
        "audioDurationSec": round(float(audio_duration), 3),
        "introDurationSec": round(float(intro_duration), 3),
        "chunks": chunks_payload,
        "titleBackgroundSrc": title_bg_name,
        "karaokeMode": bool(karaoke_units),
        "primaryFontSizePt": primary_font_size,
        "secondaryFontSizePt": secondary_font_size,
        "lineSpacingMultiplier": line_spacing_multiplier,
        "showPageNumbers": bool(show_page_numbers),
        "paddingStyle": padding_style,
    }

    props_path = work_dir / "props.json"
    props_path.write_text(
        json.dumps(props, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if on_progress:
        on_progress("Encoding video with Remotion", 85)

    cmd = [
        "npx", "remotion", "render",
        "src/index.ts",
        "WorshipVideo",
        str(output_path),
        f"--props={props_path}",
        f"--public-dir={public_dir}",
        "--concurrency=1",
        "--log=error",
    ]
    logger.info("Running remotion: %s", " ".join(cmd))
    result = subprocess.run(
        cmd,
        cwd=str(project_dir),
        capture_output=True,
        text=True,
        timeout=settings.REMOTION_RENDER_TIMEOUT_SEC,
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "")[-2000:]
        logger.error("remotion render failed:\n%s", tail)
        raise RuntimeError(f"Remotion render failed: {tail[-500:]}")


_FILENAME_SANITIZE_RE = re.compile(r"[^A-Za-z0-9._\-\u4e00-\u9fff]+")


def _sanitize_stem(stem: str, default: str = "worship_video") -> str:
    """Make a string safe for use as a filename: keep ASCII alphanum, dot, dash,
    underscore, and CJK ideographs; collapse everything else to underscores.
    Strips a leading dot/underscore and caps length to 80 chars.
    """
    cleaned = _FILENAME_SANITIZE_RE.sub("_", stem).strip("._- ")
    if not cleaned:
        return default
    return cleaned[:80]


def _unique_output_path(output_dir: Path, stem: str, suffix: str) -> Path:
    """Return a Path inside ``output_dir`` that doesn't collide with an
    existing file: tries ``stem.suffix`` first, then ``stem_2.suffix``, etc.
    """
    candidate = output_dir / f"{stem}{suffix}"
    if not candidate.exists():
        return candidate
    counter = 2
    while True:
        candidate = output_dir / f"{stem}_{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


@dataclass
class AudioPlan:
    """Pre-computed transcription + stanza-match + expanded slide plan.

    Produced by :func:`analyze_audio`, consumed by :func:`build_video_from_plan`.
    Serializable via :func:`plan_to_dict` / :func:`plan_from_dict` so the
    /analyze endpoint can cache it to disk and the /create endpoint can
    render from it without re-transcribing.
    """

    whisper_words: list[WhisperWord]
    audio_duration: float
    intro_end: float
    language: str
    stanzas: list[str]
    occurrences: list[StanzaOccurrence]
    lyric_chunks: list[str]
    chunk_stanza_idx: list[int]
    # Finalized per-slide timings. Populated by ``finalize_plan_timings``
    # during /analyze and cached on disk so the render step doesn't run the
    # SequenceMatcher alignment pass a second time.
    timed: list[TimedChunk] = field(default_factory=list)
    # Per-slide karaoke unit timings. Populated during /analyze alongside
    # ``timed`` (shares the same SequenceMatcher curve) and persisted so
    # GET /plan and the render step can read without rebuilding the O(n²)
    # alignment. Cleared by /rerender when timing overrides change.
    karaoke_units: list[list[dict]] = field(default_factory=list)


def plan_to_dict(plan: AudioPlan) -> dict:
    return {
        "whisper_words": [
            {"text": w.text, "start": w.start, "end": w.end}
            for w in plan.whisper_words
        ],
        "audio_duration": plan.audio_duration,
        "intro_end": plan.intro_end,
        "language": plan.language,
        "stanzas": plan.stanzas,
        "occurrences": [
            {
                "stanza_idx": o.stanza_idx,
                "start_sec": o.start_sec,
                "end_sec": o.end_sec,
                "score": o.score,
            }
            for o in plan.occurrences
        ],
        "lyric_chunks": plan.lyric_chunks,
        "chunk_stanza_idx": plan.chunk_stanza_idx,
        "timed": [
            {"text": tc.text, "start": tc.start, "end": tc.end}
            for tc in plan.timed
        ],
        "karaoke_units": plan.karaoke_units,
    }


def plan_from_dict(d: dict) -> AudioPlan:
    return AudioPlan(
        whisper_words=[
            WhisperWord(text=w["text"], start=float(w["start"]), end=float(w["end"]))
            for w in d["whisper_words"]
        ],
        audio_duration=float(d["audio_duration"]),
        intro_end=float(d["intro_end"]),
        language=d.get("language", "auto"),
        stanzas=list(d.get("stanzas", [])),
        occurrences=[
            StanzaOccurrence(
                stanza_idx=int(o["stanza_idx"]),
                start_sec=float(o["start_sec"]),
                end_sec=float(o["end_sec"]),
                score=float(o.get("score", 0.0)),
            )
            for o in d.get("occurrences", [])
        ],
        lyric_chunks=list(d["lyric_chunks"]),
        chunk_stanza_idx=list(d.get("chunk_stanza_idx", [])),
        timed=[
            TimedChunk(text=tc["text"], start=float(tc["start"]), end=float(tc["end"]))
            for tc in d.get("timed", [])
        ],
        karaoke_units=list(d.get("karaoke_units", [])),
    )


def _clamp_intro_end(whisper_words: list[WhisperWord], audio_duration: float) -> float:
    """The title slide stays visible until the first sung word.

    Clamps to (a) a 0.5s minimum so the title is visible even on songs with
    no intro, and (b) 90% of the audio so a pathological whisper detection
    can't leave us with an all-title video.
    """
    intro = (
        whisper_words[0].start
        if whisper_words
        else min(3.0, audio_duration * 0.05)
    )
    return max(0.5, min(float(intro), audio_duration * 0.9))


def analyze_audio(
    audio_path: Path,
    lyrics_text: str,
    language: str = "auto",
    max_lines_per_slide: int = 6,
    max_width_per_row: int = 12,
    on_progress: ProgressCb = None,
) -> AudioPlan:
    """Transcribe, match stanzas, expand to slides — everything up to render.

    Produces an :class:`AudioPlan` that captures the whisper output plus the
    audio-ordered expansion of user stanzas. The plan can be cached so the
    render step doesn't re-transcribe.
    """
    words, audio_duration = transcribe_audio(
        audio_path,
        language=language,
        on_progress=on_progress,
        initial_prompt=lyrics_text,
    )
    if audio_duration <= 0:
        audio_duration = words[-1].end if words else 0.0

    if on_progress:
        on_progress("Matching lyrics to audio order", 55)

    from app.services.lyrics_service import parse_lyrics  # local import avoids cycle

    stanzas = split_text_into_stanzas(lyrics_text)
    occurrences = identify_stanza_sequence(stanzas, words)

    lyric_chunks: list[str] = []
    chunk_stanza_idx: list[int] = []

    for occ in occurrences:
        stanza_text = stanzas[occ.stanza_idx]
        for s in parse_lyrics(
            stanza_text,
            max_lines=max_lines_per_slide,
            max_width_per_row=max_width_per_row,
        ):
            if s.text.strip():
                lyric_chunks.append(s.text)
                chunk_stanza_idx.append(occ.stanza_idx)

    if not lyric_chunks:
        # No stanza match — parse the whole text so the video still has
        # something to render.
        for s in parse_lyrics(
            lyrics_text,
            max_lines=max_lines_per_slide,
            max_width_per_row=max_width_per_row,
        ):
            if s.text.strip():
                lyric_chunks.append(s.text)
                chunk_stanza_idx.append(-1)

    return AudioPlan(
        whisper_words=words,
        audio_duration=audio_duration,
        intro_end=_clamp_intro_end(words, audio_duration),
        language=language,
        stanzas=stanzas,
        occurrences=occurrences,
        lyric_chunks=lyric_chunks,
        chunk_stanza_idx=chunk_stanza_idx,
    )


def _snap_slides_to_gaps(
    timed: list[TimedChunk],
    words: list[WhisperWord],
    window_sec: float = 0.5,
    min_gap_sec: float = 0.2,
) -> None:
    """Snap each slide boundary to the nearest whisper-word silence gap.

    A "gap" is a period between two consecutive whisper words longer than
    ``min_gap_sec`` — typically a breath or sustained-note release. Snapping
    prevents a slide transition from happening mid-syllable when the
    char-level alignment lands inside an ongoing word.
    """
    if not words or len(timed) < 2:
        return
    gap_midpoints: list[float] = []
    for i in range(len(words) - 1):
        a_end = words[i].end
        b_start = words[i + 1].start
        if b_start - a_end >= min_gap_sec:
            gap_midpoints.append((a_end + b_start) / 2.0)
    if not gap_midpoints:
        return
    for i in range(1, len(timed)):
        boundary = timed[i].start
        best = None
        best_dist = window_sec
        for mid in gap_midpoints:
            dist = abs(mid - boundary)
            if dist < best_dist:
                best_dist = dist
                best = mid
            if mid > boundary + window_sec:
                break
        if best is not None:
            timed[i].start = best
            timed[i - 1].end = best


def finalize_plan_timings(
    plan: AudioPlan,
    curve_cache: CharCurveCache | None = None,
) -> list[TimedChunk]:
    """Run the char-alignment pass and normalize chunk boundaries.

    Memoizes on ``plan.timed`` so /analyze and /create share one pass. The
    invariant ``chunk[i].end == chunk[i+1].start`` is enforced so Remotion's
    per-slide sequences crossfade back-to-back without exposing the outer
    black background during silence gaps.
    """
    if plan.timed:
        return plan.timed

    timed = align_chunks_to_timeline(
        plan.lyric_chunks, plan.whisper_words, plan.audio_duration,
        intro_offset=plan.intro_end,
        curve_cache=curve_cache,
    )
    for i, tc in enumerate(timed):
        if tc.start < plan.intro_end:
            tc.start = plan.intro_end + i * 0.1
        if tc.end > plan.audio_duration:
            tc.end = plan.audio_duration
    for i in range(len(timed) - 1):
        timed[i].end = timed[i + 1].start
    _snap_slides_to_gaps(timed, plan.whisper_words)
    for tc in timed:
        if tc.end <= tc.start:
            tc.end = min(tc.start + 0.5, plan.audio_duration)
    plan.timed = timed
    return timed


def build_video_from_plan(
    audio_path: Path,
    plan: AudioPlan,
    title: str,
    composer: str,
    background_paths: list[Path | None],
    output_dir: Path,
    work_dir: Path,
    on_progress: ProgressCb = None,
    karaoke_mode: bool = False,
    output_stem: str | None = None,
    primary_font_size: int | None = None,
    secondary_font_size: int | None = None,
    line_spacing_multiplier: float | None = None,
    show_page_numbers: bool = False,
    padding_style: str = "dark",
    sheet_crop_paths: list[Path] | None = None,
) -> tuple[Path, Path]:
    """Render MP4 + SRT from a pre-computed plan. Does NOT re-transcribe."""
    work_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    curve_cache = CharCurveCache()
    timed = finalize_plan_timings(plan, curve_cache=curve_cache)

    karaoke_units: list[list[dict]] | None = None
    if karaoke_mode:
        if plan.karaoke_units:
            karaoke_units = plan.karaoke_units
        else:
            karaoke_units = compute_chunk_units(
                plan.lyric_chunks, plan.whisper_words, plan.audio_duration,
                intro_offset=plan.intro_end,
                curve_cache=curve_cache,
                timed_chunks=timed,
            )

    stem = _sanitize_stem(output_stem) if output_stem else f"worship_video_{uuid.uuid4().hex[:8]}"
    video_path = _unique_output_path(output_dir, stem, ".mp4")
    srt_path = _unique_output_path(output_dir, stem, ".srt")

    render_via_remotion(
        audio_path=audio_path,
        title=title,
        composer=composer,
        language=plan.language,
        timed=timed,
        background_paths=background_paths,
        audio_duration=plan.audio_duration,
        intro_duration=plan.intro_end,
        work_dir=work_dir,
        karaoke_units=karaoke_units,
        output_path=video_path,
        on_progress=on_progress,
        primary_font_size=primary_font_size,
        secondary_font_size=secondary_font_size,
        line_spacing_multiplier=line_spacing_multiplier,
        show_page_numbers=show_page_numbers,
        padding_style=padding_style,
        sheet_crop_paths=sheet_crop_paths,
    )

    write_srt(timed, srt_path)

    if on_progress:
        on_progress("Done", 100)

    return video_path, srt_path


