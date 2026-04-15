# Morning Star Praise / 晨星赞美

An automated workflow platform that instantly transforms lyrics, sheet music, and web resources into multilingual worship presentations and videos.

一键将歌词、乐谱和网络资源转化为多语种敬拜 PPT 与展示视频的自动化工作流平台。

---

## Features

- **Lyric to PPT** — Paste plain text, a YouTube URL, a `.pptx`, a PDF, or an image and get a finished `.pptx` with your chosen background pool, fonts, and optional bilingual translation.
- **Worship video** — Upload an MP3 + lyrics and render an MP4 whose slide transitions are locked to the moment each line is actually sung. Supports repeated verses/choruses when the audio pattern differs from the written lyrics.
- **Audio-aware stanza matching** — `faster-whisper` transcribes the song, and a `SequenceMatcher` char-level aligner maps the user's lyrics onto the transcription so each chunk boundary fires on the right syllable.
- **Karaoke mode** — Per-character (CJK) or per-word (Latin) highlight that lights up with the vocal.
- **Edit video** — After a render, open the MP4 in an embedded `@remotion/player` and nudge slide timings or swap backgrounds, then re-render from the cached plan without re-transcribing.
- **Background library** — 84 curated defaults (gradients, radial glows, landscape motion loops) plus user uploads. Tag-filterable picker with lazy-paused autoplay so 30+ tiles don't saturate the video decoder.
- **OCR + lyric extraction** — Gemini Vision for image/PDF lyric sheets, `python-pptx` shape walker for slide decks, `youtube-transcript-api` + `yt-dlp` for YouTube captions.
- **Multi-language UI** — Interface defaults to Chinese with English toggle; Terms / Privacy pages ship bilingual.

## Stack

| Layer       | Tech |
|-------------|------|
| Backend     | FastAPI, `faster-whisper` (large-v3), `python-pptx`, Google Gemini, `yt-dlp` |
| Frontend    | React 19, Vite, TypeScript, Tailwind v4, `@remotion/player` |
| Composition | Remotion 4.0 (shared React composition used by both the CLI renderer and the in-browser player) |
| Storage     | Filesystem for analyses + renders; optional PostgreSQL for songs library |

## Project structure

```
.
├── backend/          FastAPI app
│   ├── app/
│   │   ├── routers/  HTTP endpoints (lyrics, ppt, videos, youtube, ocr, …)
│   │   └── services/ whisper alignment, ppt generation, stanza matching, …
│   ├── data/
│   │   └── backgrounds/defaults/   84 bundled background assets (~192 MB)
│   └── requirements.txt
├── frontend/         React + Vite UI
│   └── src/
│       ├── pages/    LyricsPage, WorshipVideoPage, YouTubePage, OcrPage, …
│       ├── components/
│       └── hooks/    useLanguage (i18n), usePersistedState
└── remotion/         Shared Remotion composition (WorshipVideo.tsx)
```

The Remotion composition is imported by both the backend CLI renderer (via `@remotion/cli bundle`) and the frontend live-preview player through a Vite alias, so the edit panel shows pixel-accurate frames before you commit to a full render.

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in GOOGLE_API_KEY, PEXELS_API_KEY, etc.
python run.py          # → http://127.0.0.1:8000
```

The first `/api/videos/analyze` call downloads the `faster-whisper` large-v3 model (~3 GB) into the HuggingFace cache.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # → http://localhost:5173
```

Vite proxies `/api/*` to the backend.

### 3. Remotion (optional — only needed to iterate on the composition itself)

```bash
cd remotion
npm install
npm run dev            # Remotion Studio on http://localhost:3000
```

The backend invokes the Remotion CLI directly during `/api/videos/create`, so you do **not** need to run the studio to render videos end-to-end.

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Key               | Purpose |
|-------------------|---------|
| `GOOGLE_API_KEY`  | Gemini Vision (OCR + translation) |
| `PEXELS_API_KEY`  | Pull stock motion backgrounds via the fetch scripts |
| `DATABASE_URL`    | Optional PostgreSQL for the songs library |
| `FRONTEND_URL`    | CORS allowlist |
| `GCP_PROJECT_ID`  | Secret Manager in production |

In Cloud Run, these are loaded from Google Secret Manager instead of `.env`.

## How the alignment pipeline works

1. `faster-whisper` transcribes the MP3 with word-level timestamps (VAD off — music confuses the VAD).
2. Transcript text and user lyrics are normalized and fed to a char-level `SequenceMatcher`.
3. The matching opcodes are turned into a `_CharTimeCurve`, which answers "at what second does user-char `i` get sung?" for any position.
4. Stanza occurrences in the audio are identified via a greedy char-window match, so a song written as `V / C` but sung `V / C / V / C` expands automatically.
5. The curve + occurrence list becomes an `AudioPlan`, cached on disk under `backend/data/video_work/analyses/<id>/` so `/create` and `/rerender` can share the same alignment without re-transcribing.

## License

Private — all rights reserved.
