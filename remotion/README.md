# PPT Maker — Worship Video (Remotion)

This is the Remotion video project used by the **Worship Video Maker** feature
of the PPT Maker app. The Python backend (`backend/app/services/video_service.py`)
runs Whisper transcription, aligns lyrics to the audio timeline, then invokes
`npx remotion render` on the composition defined here to produce the final MP4.

## Structure

```
remotion/
├── public/
│   └── audio.mp3            # placeholder audio so Studio default props work
├── src/
│   ├── index.ts             # Remotion entry point
│   ├── Root.tsx             # registers the WorshipVideo composition
│   └── WorshipVideo.tsx     # the actual video component (edit this)
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

## Live-editing the video

```bash
cd remotion
npm run dev          # opens Remotion Studio in your browser
```

In Studio you can:

- See the `WorshipVideo` composition rendered with the **default props** in
  `Root.tsx` (a 2-chunk Amazing Grace sample over a black background).
- Scrub the timeline to inspect any frame.
- Edit `WorshipVideo.tsx` and see changes hot-reload.
- Override props live in the right-hand panel (the panel is generated from the
  Zod schema `worshipVideoSchema`).

## Customizing

Most visual changes live in `src/WorshipVideo.tsx`:

| What to change      | Where in `WorshipVideo.tsx`                    |
| ------------------- | ---------------------------------------------- |
| Font family         | `interFamily` (Latin), `CJK_FONT_STACK` (CJK)  |
| Font size           | `primarySize` calc inside `Slide`              |
| Text color / shadow | the `<div>` style inside `Slide`'s text block  |
| Overlay opacity     | the `rgba(0,0,0,0.4)` rect in `Slide`          |
| Padding / margins   | `pad`, `inner_pad`, `padding: 130` in `Slide`  |
| Fade-in duration    | `fadeFrames = fps * 0.4`                       |
| Fade-in easing      | `Easing.out(Easing.cubic)`                     |
| Background fit      | the `<Img>` `objectFit` style                  |
| Output resolution   | `VIDEO_WIDTH/HEIGHT/FPS` in `Root.tsx`         |

After editing, the next render kicked off from the Worship Video page in the
PPT Maker frontend will pick up the changes — no rebuild step needed.

## How the backend invokes this project

The Python pipeline calls (roughly):

```bash
npx remotion render \
    src/index.ts WorshipVideo /path/to/output.mp4 \
    --props=/path/to/props.json \
    --public-dir=/path/to/per-job-public \
    --concurrency=1 --log=error
```

For each render job the backend:

1. Copies the user's audio + chosen background images into a per-job temp dir
   passed via `--public-dir` (so concurrent jobs don't clash).
2. Writes a `props.json` matching the `worshipVideoSchema` shape.
3. Runs the command above.
4. Cleans up the temp dir after the MP4 is written.

So **the source of truth for the JSON shape is `worshipVideoSchema` in
`WorshipVideo.tsx`** — keep it in sync with whatever Python writes in
`render_via_remotion()`.

## Fonts

The composition loads **Inter** via `@remotion/google-fonts/Inter` (proper
`delayRender` integration). Chinese text falls back through the system stack:

```
"PingFang SC", "Hiragino Sans GB", "Noto Sans SC",
"Microsoft YaHei", "Heiti SC", sans-serif
```

This works on macOS (where Chromium picks PingFang automatically) but is
non-deterministic on Linux. For fully reproducible CJK rendering across
machines, drop a `.woff2` into `public/fonts/` and load it via `@remotion/fonts`
(install with `npm i @remotion/fonts`).

## Render performance

A 4-minute song at 1920x1080 30fps takes roughly 1–2 minutes on Apple Silicon
(CPU bound). To speed up, edit `remotion.config.ts` or pass `--concurrency` to
the render CLI — the backend currently passes `--concurrency=1` to keep memory
usage predictable while the Whisper model is also loaded.
