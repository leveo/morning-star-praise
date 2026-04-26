# Architecture & development notes

Internal notes on the codebase's trickier corners. Skim this before changing the Whisper alignment pipeline, the Remotion composition, the `/analyze` → `/create` → `/rerender` flow, or the LLM dispatch logic. New contributors: see [CONTRIBUTING.md](./CONTRIBUTING.md) for workflow; this file is for the *why* behind specific design choices.

## Commands

All commands run from the sub-project directory, not the repo root.

**Backend** (`backend/`)
```bash
python run.py                          # dev server on :8000 (uvicorn --reload)
pytest                                  # full test suite
pytest tests/test_api.py::test_name    # single test
```

**Frontend** (`frontend/`)
```bash
npm run dev                             # Vite dev server on :5173 (proxies /api + /static to :8000)
npm run build                           # tsc -b && vite build
npm run lint                            # eslint
npx tsc --noEmit                        # type check without emit
```

**Remotion** (`remotion/`) — only when iterating on the composition itself; the backend shells out to the Remotion CLI directly during `/api/videos/create`.
```bash
npm run dev                             # Remotion Studio on :3000
npm run build                           # remotion bundle
```

## Architecture

### The Remotion composition is shared between three contexts

`remotion/src/WorshipVideo.tsx` is imported by:

1. **Backend CLI renderer** — `video_service.render_via_remotion` writes rendered props to a JSON file, then shells out to `@remotion/cli` which bundles `remotion/src/index.ts` and produces MP4.
2. **Frontend `@remotion/player`** — `VideoEditor.tsx` imports `WorshipVideo` directly via the Vite alias `@remotion-composition` (defined in `frontend/vite.config.ts` → `../remotion/src`). `server.fs.allow` must include the remotion dir or Vite will block the read.
3. **Remotion Studio** — `remotion/src/Root.tsx` registers the composition for local preview.

Because the same file is rendered in three places, its props must use URLs that work in both contexts. `resolveAssetUrl` inside `WorshipVideo.tsx` distinguishes absolute URLs (Player reads them over HTTP from the FastAPI `/static/*` mount) from filenames (CLI reads them relative to a public dir copied into the bundle).

### Whisper alignment pipeline (`backend/app/services/video_service.py`)

The hardest logic in the codebase. Flow:

1. **`analyze_audio`** — runs `faster-whisper` (large-v3, VAD **off** because music confuses VAD; hallucinations handled by `_strip_hallucinated_repeats`). Returns an `AudioPlan` dataclass.
2. **`_CharTimeCurve`** — wraps `difflib.SequenceMatcher` over normalized user lyrics vs. normalized whisper chars. Answers "at what second does user-char `i` start being sung?" for any `i`. This is O(n²) to build, so `_build_char_curve` + `curve_cache` dict is passed between `finalize_plan_timings` and `compute_chunk_units` to build once per render.
3. **Stanza occurrences** — user writes each stanza once; audio may repeat chorus. `identify_stanza_sequence` does a greedy char-window search over the whisper transcription so `V/C` written expands to `V/C/V/C` sung.
4. **`AudioPlan` persists on disk** — `plan_to_dict` / `plan_from_dict` are the JSON boundary. `/analyze` writes `backend/data/video_work/analyses/<id>/plan.json` + the audio file; `/create` and `/rerender` load from that cache so nothing re-transcribes. `plan.timed` is memoized onto the plan to share alignment across the `/analyze` → `/create` boundary.
5. **`/analyses/{id}/plan`** strips `whisper_words` before returning (often >1 MB) — the Edit Video panel only needs `timed`.

### `/analyze` → `/create` → `/rerender` split

`routers/videos.py` intentionally splits the pipeline so the frontend can preview slide ordering **before** committing to a full MP4 render. `/analyze` returns the slide list and audio URL; the user picks backgrounds + fonts; `/create` renders. After rendering, `VideoEditor` can call `/rerender` with `timing_overrides` and `background_overrides` (per-slide, by chunk index — title slide is bg_paths[0], lyric chunks start at bg_paths[1]) and the backend rebuilds from the same cached plan without re-transcribing.

### Background cleanup (`backend/app/main.py`)

`_cleanup_old_files` runs once at startup. It recurses **one level** into container dirs like `analyses/` because the parent's mtime refreshes every time a new child is added — a top-level-only sweep would never delete the grandchildren. If you add a new cache dir, it needs to be registered in the `lifespan` hook.

### Frontend state + i18n

- **`useUILanguage`** (`frontend/src/hooks/useLanguage.ts`) — persisted state, default `'zh'`, paired with a `UI_TEXT: Record<UILanguage, TextDict>` dict. All user-facing strings live in `UI_TEXT` with `zh` and `en` keys; pages do `UI_TEXT[uiLanguage].section.key`. When adding UI text, add the `en` translation in the same commit — there's no fallback.
- **`usePersistedState`** — sessionStorage-backed state for form inputs that should survive tab switches within a session but not across reloads.
- **`getBackgrounds`** (`frontend/src/api/client.ts`) — module-level promise cache shared by `WorshipVideoPage`, `BackgroundPicker`, and `SlideDeck`. Call `invalidateBackgroundsCache()` after uploads.

### Background picker tile performance

`LazyVideoTile` in `BackgroundPicker.tsx` uses an `IntersectionObserver` to pause off-screen `<video>` tiles. Without this, 30+ autoplay videos saturate the browser's video decoder. Any new grid of video previews should follow the same pattern.

### Secrets

`backend/app/secrets.py` loads from `backend/.env` in development and Google Secret Manager in production (Cloud Run). `.env` is gitignored; never commit one.

## Project layout

```
backend/     FastAPI — routers (HTTP) + services (logic)
frontend/    React 19 + Vite + Tailwind v4 — pages, components, hooks
remotion/    Shared composition (imported by both CLI render AND @remotion/player)
```

Backgrounds (~192 MB of bundled defaults) live in `backend/data/backgrounds/defaults/` and are committed to the repo because they're runtime assets the app ships with.

## Smoke-testing changes

Type checks and the test suite are supplements, not substitutes. Before submitting a change, exercise the affected capability end-to-end:

- **Backend endpoint change** — call it via `curl` or the frontend; verify the response shape and side effects on disk
- **Frontend UI change** — start the dev server (`npm run dev`) and click through the user flow in a real browser; check the network tab for unexpected calls
- **Remotion composition change** — render a short MP4 via `/api/videos/create` (CLI path) **and** open the Edit Video panel (`@remotion/player` path) — both must work, since the same composition is used by both
- **Whisper alignment change** — run an analysis on a sample MP3 with known repeated stanzas; confirm `plan.timed[*]` gets the right `lyric_index` and `start_sec`
- **Docs-only change** — walk through the documented procedure on a clean machine (or a fresh checkout); fix what doesn't match reality

Report in the PR what you exercised, the input, and the observed output. "It compiles" is not a smoke test.
