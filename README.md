# Morning Star Praise / 晨星赞美

Automated workflow that turns lyrics, sheet music, and web resources into multilingual worship slides and videos.

一键把歌词、乐谱、网络资源转化为多语种敬拜 PPT 与同步视频的工作流平台。

---

## Features

- **Lyric → PPT** — Paste text, a YouTube URL, a `.pptx`, a PDF, or an image; get a finished `.pptx` with your background pool, fonts, and optional bilingual translation.
- **Worship video** — Upload MP3 + lyrics; render an MP4 whose slide transitions lock to the moment each line is sung. Repeated verses/choruses expand automatically when the audio order differs from the written lyrics.
- **Karaoke mode** — Per-character (CJK) or per-word (Latin) highlight that lights up with the vocal.
- **Edit video** — After a render, open the MP4 in an embedded `@remotion/player`, nudge slide timings / swap backgrounds, and re-render from the cached plan without re-transcribing.
- **Songs Library** — Every PPT and video render is saved with a resumable snapshot. Return later to re-download or restore the form state and keep editing.
- **Settings page** — One place to edit the default template (max lines, font sizes, line spacing, page numbers) and pick which LLM powers OCR / translation / YouTube-frame analysis. Toggle between *API mode* (cloud providers) and *Local mode* (Ollama) without restarting the backend.
- **Background library** — 84 bundled backgrounds (gradients, radial glows, landscape motion loops) plus user uploads, with a tag-filterable picker and lazy-paused autoplay so 30+ video tiles don't saturate the decoder.
- **OCR + lyric extraction** — Vision LLM first (qwen3-vl / Gemini / GPT-4o — beats PaddleOCR on sheet music because it filters out chord symbols and notation), PaddleOCR as fallback. `python-pptx` walker for decks; `youtube-transcript-api` + `yt-dlp` for YouTube captions.
- **Multi-language UI** — Chinese default with English toggle; Terms / Privacy pages ship bilingual.

---

## Two operating modes

You choose how much LLM capacity to wire up. Both modes use the same codebase — change `.env` and features light up or gracefully degrade.

### Pure-local mode (no API keys)

Set `LLM_TEXT_PROVIDER=""` and `LLM_VISION_PROVIDER=""`. Everything that doesn't need an LLM keeps working. What you lose:

| Feature | Pure-local | LLM-powered |
|---|---|---|
| Lyric → PPT (text paste, already-extracted lyrics) | ✅ | ✅ |
| Worship video (MP3 + lyrics paste) | ✅ (`faster-whisper` + `wav2vec2` run on your machine) | ✅ |
| Karaoke highlight | ✅ | ✅ |
| Songs Library / Settings / Edit Video | ✅ | ✅ |
| Background library + uploads | ✅ | ✅ |
| YouTube caption extraction (CC tracks) | ✅ (via `youtube-transcript-api`) | ✅ |
| **OCR of sheet-music images / PDFs** | ⚠️ PaddleOCR only (no LLM to filter out chord symbols / notation) | ✅ Vision LLM first, PaddleOCR fallback — cleanly separates lyrics from notation |
| **Translation** (e.g. English lyrics → Chinese) | ❌ | ✅ |
| **YouTube frame-based lyric extraction** (when no captions exist) | ❌ | ✅ |
| **Gemini 16:9 outpainting** for non-16:9 backgrounds | ⚠️ falls back to blurred edge fill | ✅ (Gemini only) |

Pure-local mode is zero-cost and fully offline once dependencies are installed.

### LLM-powered mode

Pick one provider for text and one for vision (they can differ). Supported:

| Provider key | Text models | Vision models | API endpoint |
|---|---|---|---|
| `openai` | `gpt-4o-mini` (default) / `gpt-4o` / ... | `gpt-4o` (default) | api.openai.com |
| `anthropic` | `claude-haiku-4-5-20251001` (default) / `claude-sonnet-4-6` | `claude-sonnet-4-6` (default) | api.anthropic.com |
| `gemini` | `gemini-2.5-flash` (default) | `gemini-2.5-flash` (default) | generativelanguage.googleapis.com |
| `minimax` | `abab6.5s-chat` (default) | `abab6.5s-chat` | api.minimax.chat |
| `qwen` | `qwen-plus` (default) | `qwen-vl-plus` (default) | DashScope (Alibaba) |
| `glm` | `glm-4-flash` (default) | `glm-4v-flash` (default) | open.bigmodel.cn (Zhipu) |
| `ollama` | `gemma4:e4b` (default) / `qwen3.5:9b` | `qwen3-vl:8b` (default) / `qwen2.5vl:7b` / `llava` | your local Ollama (`http://localhost:11434/v1`) |

OpenAI, MiniMax, Qwen, GLM, and Ollama all use OpenAI-compatible endpoints under the hood and share one code path. Anthropic and Gemini use their native SDKs. See `backend/app/services/llm_service.py` for the dispatch logic.

Only the provider(s) you select need their SDK installed and key configured:

- `openai` / `minimax` / `qwen` / `glm` / `ollama` → requires `openai` Python package (in `requirements.txt`)
- `anthropic` → requires `anthropic` package (in `requirements.txt`)
- `gemini` → requires `google-genai` package (in `requirements.txt`)

### Switching providers at runtime (Settings page)

You don't have to pick one provider in `.env` and live with it. The **Settings** page in the UI exposes a three-way toggle:

- **Follow server default** — use whatever `.env` has (no override, empty headers)
- **API mode** — pick a cloud provider for text and for vision (they can differ)
- **Local mode** — route both modalities to your local Ollama

The selection is persisted in the browser's `localStorage` and travels to the backend on each request via `X-LLM-Text-Provider`, `X-LLM-Text-Model`, `X-LLM-Vision-Provider`, `X-LLM-Vision-Model` headers. A per-request `contextvars` scope in `llm_service.py` reads those headers and overrides the env defaults for that request only, so two browser tabs can use different providers simultaneously.

**API keys never leave the backend.** Only provider *names* and model *names* travel over the wire. Keys stay in `backend/.env` (or Google Secret Manager in production). If you switch to a provider whose key isn't configured yet, the Settings page shows an amber hint with the env var name, where to get the key, and a reminder to restart the backend.

`GET /api/llm/status` returns the full per-provider readiness + active selection so the UI can display "ready" / "API key missing" pills.

---

## Stack

| Layer       | Tech |
|---|---|
| Backend     | FastAPI · `faster-whisper` (large-v3) · `python-pptx` · `yt-dlp` · pluggable LLMs |
| Frontend    | React 19 · Vite · TypeScript · Tailwind v4 · `@remotion/player` |
| Composition | Remotion 4.0 (one React composition shared between CLI renderer and in-browser player) |
| Storage     | Filesystem for analyses + renders · PostgreSQL for Songs Library · browser `localStorage` for Settings (default template + LLM routing) |

---

## Project layout

```
.
├── backend/          FastAPI app
│   ├── app/
│   │   ├── routers/  HTTP (lyrics, ppt, videos, youtube, ocr, library, templates, …)
│   │   └── services/ whisper alignment, ppt gen, stanza matching, llm_service, library_service, …
│   ├── data/
│   │   └── backgrounds/defaults/   84 bundled background assets (~192 MB)
│   └── requirements.txt
├── frontend/         React + Vite UI
│   └── src/
│       ├── pages/    LyricsPage · WorshipVideoPage · YouTubePage · OcrPage · SongsLibraryPage · TemplatesPage (rendered as "Settings")
│       ├── components/
│       └── hooks/    useLanguage · usePersistedState · usePersistedGlobalState · useTemplateDefaults · useResumeSnapshot · useLLMSettings
├── remotion/         Shared Remotion composition (WorshipVideo.tsx)
└── praise.sh         One-shot launcher: kills old servers, ensures Postgres, starts backend + frontend
```

---

## Setup

### 1. System requirements

- **macOS or Linux** (Windows may work via WSL; untested)
- **Python 3.11+**
- **Node.js 20+** (for frontend + Remotion)
- **PostgreSQL 14+** (required for Songs Library; skip if you don't need history)
- **ffmpeg** (required by `yt-dlp` and audio decode) — `brew install ffmpeg` / `apt-get install ffmpeg`
- **~4 GB disk** for the first `/api/videos/analyze` run — `faster-whisper large-v3` downloads once into the HuggingFace cache.

### 2. PostgreSQL

#### macOS (Homebrew)
```bash
brew install postgresql@18
brew services start postgresql@18
createdb ppt_maker
```

#### Linux (apt)
```bash
sudo apt-get install postgresql
sudo systemctl start postgresql
sudo -u postgres createdb ppt_maker
# Option: give your user access with your own role
sudo -u postgres createuser --superuser "$USER"
```

Tables are created automatically on the first backend boot (`init_tables()` in `backend/app/database.py`). No migrations to run.

If you skip Postgres, the app still starts — Songs Library shows a "database unavailable" banner, but Settings (template defaults + LLM routing) keeps working because it's stored in the browser's `localStorage`.

### 3. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL + optional LLM keys
python run.py          # → http://127.0.0.1:8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev            # → http://localhost:5173
```

Vite proxies `/api/*` and `/static/*` to the backend.

### 5. One-command dev loop

From the repo root:
```bash
./praise.sh
```

It kills any existing dev servers on `:8000` and `:5173`, auto-starts Postgres if installed but not running (via `brew services` on macOS or `systemctl` on Linux), then launches backend + frontend and tails both logs. `Ctrl+C` stops everything.

### 6. Remotion Studio (optional)

Only needed if you're iterating on the composition itself (`remotion/src/WorshipVideo.tsx`). The backend shells out to `@remotion/cli` during rendering, so the Studio doesn't need to run for normal use.

```bash
cd remotion
npm install
npm run dev            # http://localhost:3000
```

---

## Environment variables

Copy `backend/.env.example` → `backend/.env`.

### Core

| Key | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ for Songs Library | `postgresql://user[:pass]@host:port/dbname` — e.g. `postgresql://leosong@127.0.0.1:5432/ppt_maker` |
| `FRONTEND_URL` | — | CORS allowlist (default `http://localhost:5173`) |
| `GCP_PROJECT_ID` | prod only | Google Secret Manager fallback (Cloud Run deploys read secrets from here) |
| `PEXELS_API_KEY` | optional | Only used by the background-fetch scripts in `backend/scripts/` |

### LLM routing

These are the **server-side defaults**. The UI Settings page can override them per-request without restarting the backend.

| Key | Values |
|---|---|
| `LLM_TEXT_PROVIDER` | `openai` · `anthropic` · `gemini` (default) · `minimax` · `qwen` · `glm` · `ollama` · `""` (disabled) |
| `LLM_VISION_PROVIDER` | same set as above — **defaults to `ollama`** with `qwen3-vl:8b`, which beats PaddleOCR on sheet-music lyrics and runs fully local |
| `LLM_TEXT_MODEL` | Override the default text model for the selected provider |
| `LLM_VISION_MODEL` | Override the default vision model for the selected provider |

### Provider API keys (set only the ones you route to)

| Key | Where to get |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_API_KEY` | makersuite.google.com / AI Studio |
| `MINIMAX_API_KEY` | api.minimax.chat |
| `DASHSCOPE_API_KEY` | dashscope.console.aliyun.com (Qwen) |
| `ZHIPU_API_KEY` | open.bigmodel.cn (GLM) |

### Ollama (local LLM)

Local mode splits models into two roles — **text** (translation, text prompts) and **vision / OCR** (image-to-text). They're pulled separately:

| Key | Default | Alternatives | Notes |
|---|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | — | Append `/v1` so the OpenAI SDK talks to it |
| `OLLAMA_TEXT_MODEL` | `gemma4:e4b` | `qwen3.5:9b`, `llama3.1`, etc. | Any Ollama chat model works |
| `OLLAMA_VISION_MODEL` | `qwen3-vl:8b` | `qwen2.5vl:7b`, `minicpm-v`, `llava` | Any Ollama vision chat model works |

Pull whichever you need:

```bash
ollama pull gemma4:e4b        # text default
ollama pull qwen3.5:9b        # text alternative (slightly stronger CJK)
ollama pull qwen3-vl:8b       # vision — OCR and reasoning (used by OCR page, YouTube frame filter, dedup)
```

`qwen3-vl:8b` handles both raw OCR extraction and image reasoning (KEEP/SKIP classification for YouTube frames, dedup-by-content) in one model, which is why it's the default. Any OpenAI-compatible chat-vision model on Ollama works as a drop-in; just swap `OLLAMA_VISION_MODEL`.

#### Hardware requirements

Running `gemma4:e4b` (8B) and `qwen3-vl:8b` (8.8B) comfortably — i.e. first-token in a few seconds, full OCR in ~10s — needs **~10–14 GB of unified / VRAM** once both are resident. Concretely:

- **Apple Silicon Mac with 16 GB+ unified memory** (M1/M2/M3/M4 — any tier)
- **PC with an 8 GB+ discrete GPU** (RTX 3060 8 GB is the practical floor; 4070 / 4080 run noticeably faster)
- **CPU-only works but is slow** — expect 60–120 s per OCR call on a modern x86 CPU. Fine for occasional use, painful for batch YouTube-frame workflows.

If your machine doesn't hit that bar, swap `qwen3-vl:8b` for the smaller 4B sibling:

```bash
ollama pull qwen3-vl:4b
# then in .env:
# OLLAMA_VISION_MODEL=qwen3-vl:4b
```

`qwen3-vl:4b` runs on ~6 GB of memory — workable on 8 GB Macs and 4–6 GB GPUs — at the cost of slightly weaker OCR accuracy on dense / stylized Chinese text.

Browse other vision model options at [ollama.com/search?c=vision](https://ollama.com/search?c=vision). The app speaks OpenAI-compatible chat completions to any Ollama vision model, so it's a no-code swap.

---

## How the alignment pipeline works

1. `faster-whisper` transcribes the MP3 with word-level timestamps (VAD off — music confuses the VAD).
2. Transcript text and user lyrics are normalized and fed to a char-level `SequenceMatcher`.
3. The matching opcodes turn into a `_CharTimeCurve`, answering "at what second does user-char *i* get sung?" for any position.
4. Stanza occurrences in the audio are identified via a greedy char-window match, so a song written as `V/C` but sung `V/C/V/C` expands automatically.
5. The curve + occurrence list becomes an `AudioPlan`, cached on disk under `backend/data/video_work/analyses/<id>/` so `/create` and `/rerender` share the same alignment without re-transcribing. Karaoke units are precomputed during `/analyze` and persisted too, so the editor preview and the final render never rebuild the O(n²) alignment.

---

## Contributing / open-source notes

- Secrets never go in the repo. `.env` is gitignored; CI uses GitHub Actions secrets; prod uses Google Secret Manager. The Settings UI never reads or writes API keys — it only chooses provider and model names.
- The bundled background assets (`backend/data/backgrounds/defaults/`, ~192 MB) are committed because they're shipping defaults, not development data.
- Adding a new LLM provider: extend `_OPENAI_COMPAT_BASE_URLS` / `DEFAULT_TEXT_MODELS` / `DEFAULT_VISION_MODELS` in `backend/app/services/llm_service.py` and add the key in `config.py`. If the provider isn't OpenAI-compatible, add a `_yourprovider_text` / `_yourprovider_vision` pair alongside the existing Anthropic / Gemini ones. Then add a row to `_PROVIDERS_META` in `backend/app/routers/llm.py` so the Settings page picks it up automatically.
- The per-request LLM override plumbing lives in `llm_service.set_request_overrides` + the `llm_header_middleware` in `main.py`. It uses Python `contextvars` so overrides are scoped to one request and can't leak across concurrent requests — important for multi-user deployments.

---

## License

MIT. See `LICENSE`.
