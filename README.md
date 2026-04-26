# Morning Star Praise / 晨星赞美

Automated workflow that turns lyrics, sheet music, and web resources into multilingual worship slides and videos.

一键把歌词、乐谱、网络资源转化为多语种敬拜 PPT 与同步视频的工作流平台。

---

## Who it's for

Worship teams and church media volunteers who currently spend hours every week hand-building slide decks before each service. If any of these sound familiar, this project is for you:

- **"I have lyrics in a text file / Word doc — I just want a PPT with our backgrounds and fonts."** Paste the lyrics, pick backgrounds, download a finished `.pptx`.
- **"Someone sent me a YouTube link of the song we want to sing — now I have to transcribe it."** Paste the URL; the app pulls captions (or runs OCR on frames if there are none) and produces the slides.
- **"We have a printed sheet-music score and want each slide to show the music + lyrics."** Upload the sheet image or PDF; the app auto-segments staff systems, crops per-slide fragments, and pairs each fragment with a lyrics box.
- **"We have an MP3 of the song and want a karaoke / worship video to project."** Upload the MP3 + lyrics; the app aligns lyrics to the audio (handles repeated choruses) and renders an MP4 with slides that change exactly when each line is sung — including per-character karaoke highlight.
- **"Our songs are bilingual (Chinese + English) and translating + formatting them is painful."** Translation runs through your chosen LLM; both languages render side-by-side on the same slide.
- **"We can't / won't send our church's data to a cloud LLM."** Run in pure-local mode — `faster-whisper` for audio + Ollama for OCR / translation, fully offline.

如果你的敬拜团每周都要花几个小时手动做 PPT 或敬拜视频,这个项目就是为你而做。无论是把歌词文件变 PPT、把 YouTube 视频转成 PPT、把乐谱扫描件做成带歌词的幻灯片,还是把一段 MP3 + 歌词渲染成 slide 与人声同步切换的视频,都可以一键完成。完全支持纯本地模式(无需任何 API key),也支持中英双语自动翻译排版。

---

## Features

- **Lyric → PPT** — Paste text, a YouTube URL, a `.pptx`, a PDF, or an image; get a finished `.pptx` with your background pool, fonts, and optional bilingual translation.
- **Sheet-music → PPT** (Phase 1) — Optionally upload a printed sheet-music image or PDF on the Lyrics page; `oemer` detects staff systems, the app crops the original scan into per-slide fragments, and each slide shows the sheet fragment on top with a draggable lyrics textbox below (white backdrop). No re-rendering — the pixels are always your upload. Handwritten sheets may misdetect.
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
- **poppler** (only if you want to upload PDF sheet music) — `brew install poppler` / `apt-get install poppler-utils`. Used by `pdf2image` to rasterize PDFs before OMR.
- **homr + Python 3.11 + Poetry** for the sheet-music-on-PPT feature — see Setup § 3.5. First homr run downloads ~300 MB of transformer models into its venv.
- **~200 MB** extra for `oemer` (fallback OMR) — downloads 4 ONNX/H5 weight files into `site-packages/oemer/checkpoints/` on first use. Prefetch to avoid a request-time stall:
  ```bash
  cd backend && source .venv/bin/activate
  python -c "from app.services.sheet_music_service import _ensure_oemer_weights; _ensure_oemer_weights()"
  ```

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

# Prefetch OMR weights (optional but strongly recommended — otherwise the
# FIRST sheet-music analysis stalls the request for minutes while downloading
# 4 files totalling ~200 MB).
python -c "from app.services.sheet_music_service import _ensure_oemer_weights; _ensure_oemer_weights()"

python run.py          # → http://127.0.0.1:8000
```

### 3.5. homr — default OMR backend for sheet-music feature

The sheet-music-on-PPT feature needs homr for clean grand-staff recognition on printed hymnals. Because homr pins Python 3.11 + Poetry, it runs in its own venv that the backend shells out to.

```bash
# Python 3.11 (pyenv is the easiest route)
pyenv install 3.11
# Poetry (user-level install keeps it out of the backend venv)
pip install --user poetry

# Vendor + install homr
mkdir -p third_party && cd third_party
git clone --depth=1 https://github.com/liebharc/homr.git
cd homr
echo "3.11.14" > .python-version   # match whatever 3.11.x you got
~/.local/bin/poetry env use "$(pyenv prefix 3.11)/bin/python3.11"
~/.local/bin/poetry install --only main
```

That's all — the backend auto-discovers `third_party/homr/` and `~/.local/bin/poetry` and shells out per sheet. If either is missing, the sheet pipeline falls back to `oemer` (pip-only, less accurate on grand staves).

The UI exposes two modes:

- **扒谱 (`rebuild`, default)** — **homr → MusicXML → Verovio render → clean PNG crop**. The PPT / video shows re-rendered notation with no scan artefacts or printed lyrics baked in. OMR mistakes (e.g. missed fermatas) become visible in the output.
- **截图 (`crop`)** — **oemer staff detection → pixel crop from the original scan**. Preserves the source exactly, including watermarks, chord symbols and printed lyrics. Right when pixel fidelity matters more than clean typography.

Both modes are available on the **乐谱** page and inside the **视频** (Worship Video) preview — the user picks per song via a segmented control, and the choice persists across reloads. When `rebuild` fails (homr not installed, Verovio crash, atypical engraving) the pipeline transparently falls back to `crop` so the request still succeeds.

A future Phase 2 enhancement will use homr's MusicXML for note-level audio-to-score alignment inside videos.

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
| `DATABASE_URL` | ✅ for Songs Library | `postgresql://user[:pass]@host:port/dbname` — e.g. `postgresql://user@127.0.0.1:5432/ppt_maker` |
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

## Sheet-music pipeline

1. User uploads a sheet-music image or PDF on the Lyrics / OCR page (`POST /api/sheet/upload`). PDFs are rasterized via `pdf2image`.
2. **homr** (in its Python 3.11 Poetry venv, called via subprocess) reads the scan and emits MusicXML. Fallback to `oemer` if homr isn't installed.
3. **Verovio** loads the MusicXML and renders a clean SVG; `cairosvg` converts it to a PNG per Verovio page. The clean render has no scan artefacts and no printed lyrics.
4. Classical-CV blank-band segmentation walks row-by-row across the clean PNG and splits on blank runs ≥18 rows, yielding one bounding box per visual staff system. Grand staves stay intact because Verovio's brace keeps treble+bass visually connected.
5. Systems are distributed across the user's N lyric chunks — greedy partition when systems ≥ chunks, cyclic repeat when systems < chunks (hymnals: 3 systems cycling across 12 verses).
6. `POST /api/sheet/analyze` writes `crop_XX.png` per chunk and returns preview URLs.
7. PPT generation (`/api/ppt/generate` with `sheet_session_id` + `sheet_crop_names`) switches those slides to a "sheet on top, draggable lyrics textbox below, white backdrop" layout. The user fine-tunes textbox position in PowerPoint after download.

**Why re-render instead of crop the original scan?** The user doesn't want the printed lyrics bleeding into the crop, and doesn't want scan watermarks / chord symbols on the slide. Verovio renders the notation cleanly with no lyrics attached. The tradeoff: OMR misreads (e.g. homr sometimes mis-detects fermatas as ties) become visible in the output. Phase 1.x accepts that tradeoff; a Phase 2 improvement would be to reconcile against the original pixels for accuracy.

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

## Contributing

Pull requests, bug reports, and feature ideas are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR — it covers the dev workflow, code style, the bilingual UI-text rule, the SPDX header requirement, and how to extend the LLM provider list. For non-trivial changes, open an issue first to discuss the approach.

---

## License

GNU General Public License v3.0 or later (GPL-3.0-or-later). See `LICENSE` for the full text.

Copyright (C) 2026 Leo Song.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
details.
