# Morning Star Praise / 晨星赞美

Morning Star Praise is a local-first workflow for turning confirmed lyrics,
Word documents, sheet music, audio, and web sources into editable worship
slides and synchronized lyric videos.

晨星赞美是一套本地优先的敬拜制作工作流，可将已确认歌词、Word 文档、乐谱、音频和
网络素材整理为可编辑的敬拜 PPT 与同步歌词视频。

## Who it's for / 适用对象

This project is for worship teams and church media volunteers who regularly
prepare multilingual lyrics, slides, or videos and want a repeatable workflow
without giving up editorial control.

本项目适合需要长期制作多语种歌词、幻灯片或视频的敬拜团队和教会媒体同工。系统负责
提取、分段、排版和时间对齐，最终歌词、结构、背景及时间点仍由使用者确认。

- Import a bilingual `.docx`, review every Verse and Chorus, then send the
  result directly to Slides or Video.
- Paste lyrics or extract them from YouTube, PowerPoint, images, or PDFs and
  generate an editable 16:9 `.pptx`.
- Upload sheet music and place detected score sections above editable lyrics.
- Upload an audio performance, calibrate every sung cue, then render a 1080p
  MP4 and SRT without replacing the supplied lyrics with transcription text.
- Run speech alignment locally and choose either local Ollama models or cloud
  providers for OCR and translation.

- 导入中英双语 `.docx`，逐节校对 Verse 与副歌，再直接发送到幻灯片或视频页面。
- 粘贴歌词，或从 YouTube、PowerPoint、图片及 PDF 提取内容，生成可编辑的 16:9 PPTX。
- 上传乐谱，在每张歌词页上方放置自动识别的乐谱片段。
- 上传实际演唱音频，逐页校准开唱时间，再生成 1080p MP4 与 SRT；转写文字不会覆盖
  用户提供的歌词。
- 音频对齐可完全在本地运行；OCR 与翻译可选择 Ollama 或云端模型。

## Core workflows / 核心工作流

| Workflow | What it does | 主要能力 |
|---|---|---|
| Word Lyrics | Deterministically imports bilingual `.docx` files, shows parse confidence and source coverage, requires review for unresolved text, and exports a normalized `_v2.docx`. | 确定性解析双语 `.docx`，显示置信度与原文覆盖率；未归类文字必须人工处理，并可导出规范化 `_v2.docx`。 |
| Slides | Creates editable PPTX files with separate title metadata, bilingual lyrics, page numbers, reusable backgrounds, and optional score images. | 生成可编辑 PPTX，支持独立标题元数据、双语歌词、页码、背景与乐谱图片。 |
| Sheet Music | Supports clean notation rebuild, deterministic source cropping, and vision-model crop detection. | 支持重新扒谱排版、本地截图识别及视觉模型截图识别。 |
| Worship Video | Analyzes audio, expands the actual sung stanza order, previews timing, supports per-slide calibration and backgrounds, then renders MP4 + SRT. | 分析音频并展开实际演唱顺序，预览及逐页校准时间与背景，再生成 MP4 + SRT。 |
| Local Drafts | Preserves form values, selected files, analysis plans, timing edits, and generated results while navigating; explicit Clear actions remove the current draft. | 页面切换时保留表单、文件、分析、时间调整与成品；仅在用户点击清除时删除当前草稿。 |
| Songs Library | Stores generated PPT/video records and resumable snapshots when PostgreSQL is available. | PostgreSQL 可用时保存 PPT/视频记录及可恢复快照。 |

### Confirmed lyrics stay authoritative / 以确认歌词为准

Audio transcription is used only to locate where supplied lyrics are sung.
The text shown in slides, video frames, and subtitles comes from the user's
reviewed lyrics. This avoids silently publishing Whisper hallucinations or
formatting changes as final worship text.

音频转写只用于定位已提供歌词的演唱时间。幻灯片、视频画面和字幕中的文字来自用户校对后
的歌词，系统不会把 Whisper 幻觉或自动改写静默当成最终敬拜歌词。

## Word Lyrics workflow / Word 歌词工作流

The **Lyrics** page accepts one `.docx` file up to 10 MB and parses it locally.
It understands common bilingual hymn layouts, including:

- Chinese and English language blocks;
- stanza-interleaved and line-interleaved lyrics;
- two-column and stanza tables;
- Word automatic numbering, soft/page breaks, hyperlinks, tracked insertions,
  and text boxes;
- labeled or unlabeled verses, multi-digit verse numbers, repeated or
  referenced refrains, and a final `Amen` ending.

Each import reports the selected layout, alternative candidates, confidence,
classified fragment count, and any unresolved source text. A low-confidence or
incomplete result must be reviewed before it can be copied, exported, or sent
to another workflow. Refrains are expanded after each Verse, while `Amen` is
emitted once at the end.

**歌词**页面接收一个不超过 10 MB 的 `.docx` 并在本地解析，支持中英文整块、逐节中英、
逐行中英、表格双栏、Word 自动编号、软换行/分页、超链接、修订插入、文本框、无标签
Verse、多位数节号、副歌引用及结尾 Amen。页面会显示候选版式、置信度、已归类原文数量
和未归类片段；低置信度或不完整结果必须人工确认后才能复制、导出或发送。副歌会在每节
Verse 后展开，Amen 只在最后输出一次。

## Slides and sheet music / 幻灯片与乐谱

Generated presentations use a 16:9 layout and editable text boxes. Chinese and
English titles, collection names, and composer metadata remain separate, so
they can be repositioned in PowerPoint. Primary and secondary lyrics can use
independent font sizes and line spacing.

Three sheet modes are available on the Sheet Music page and in the Video
workflow:

| Mode | Pipeline | Best for |
|---|---|---|
| Rebuild / 扒谱 | `homr` -> MusicXML -> Verovio -> clean render | Printed music that benefits from clean notation |
| Crop / 截图 | Local staff-line detection -> crop source pixels | Preserving the exact scan, including printed lyrics |
| AI Crop / 截图 (AI) | Active vision model -> tight score regions | Complex layouts where local detection is insufficient |

`rebuild` falls back to source cropping when OMR or Verovio is unavailable.
PDF uploads require Poppler. The optional `homr` installation must use Python
3.11; `oemer` is installed through `backend/requirements.txt` as the local
staff-detection fallback.

生成的演示文稿采用 16:9 比例和可编辑文本框。中英文歌名、诗集名称及作者信息分别保存，
便于在 PowerPoint 中继续调整；中英文歌词可分别设置字号和行距。`rebuild` 失败时会自动
退回原图裁切。PDF 需要 Poppler，可选的 `homr` 环境使用 Python 3.11，`oemer` 则由后端
依赖安装。

## Worship video timing / 敬拜视频时间校准

The video flow is deliberately split into three stages:

1. **Analyze** — transcribe timing locally with `faster-whisper`, match the
   supplied stanzas to the performance, expand repeats, and cache the plan.
2. **Calibrate** — preview the shared Remotion composition, edit the sung start
   of each slide, set a cue from the current playhead, and override title or
   lyric backgrounds.
3. **Render / re-render** — create MP4 and SRT from the cached plan without
   transcribing the audio again.

Display timing and sung timing are stored separately. By default, a lyric slide
is fully visible 0.5 seconds before singing starts. After an instrumental gap
longer than eight seconds, the next slide appears five seconds early. SRT and
karaoke timing continue to use the actual sung range. User edits are clamped to
the audio duration and display starts stay monotonic.

视频流程分为“分析 → 校准 → 渲染/重新渲染”。系统缓存分析计划，重新生成时不会再次转写。
画面时间与实际演唱时间分别保存：普通页面默认提前 0.5 秒完整出现，超过 8 秒的间奏后提前
5 秒显示下一页；SRT 与卡拉 OK 高亮仍使用实际演唱时间。人工时间点会限制在音频长度内，
画面开始时间也会保持递增。

Additional video controls include:

- per-slide title and lyric background replacement with image/video filtering
  and search;
- stable Verse + Chorus background grouping, including repeated choruses and
  variable slide counts;
- independent Chinese/English font sizes and line spacing;
- optional page numbers, static-background motion, sheet overlays, and a
  three-second end slide;
- analysis/output retention while a browser draft references them, plus
  explicit cleanup when the draft is cleared.

## Pages / 页面

- **Lyrics / 歌词** — import, review, normalize, and hand off bilingual Word lyrics.
- **Slides / 幻灯片** — format text or bilingual lyrics and generate PPTX.
- **YouTube** — use caption extraction or frame analysis as a lyric source.
- **Sheet Music / 乐谱** — OCR lyrics and segment notation for slides.
- **Video / 视频** — analyze audio, calibrate cues, preview, render, and re-render.
- **Songs / 诗歌库** — reopen saved PPT and video work.
- **Settings / 设置** — save browser-local layout defaults and select local or
  cloud text/vision models.

## Processing modes / 处理模式

The core PPT and supplied-lyrics video workflows do not require an API key.
`faster-whisper` runs audio alignment locally. Features that require text or
vision inference can use either Ollama or a configured cloud provider.

| Mode | Text and vision | Data path |
|---|---|---|
| Local | Ollama models selected in Settings | Requests stay on the machine |
| API | OpenAI, Anthropic, Gemini, MiniMax, Qwen, or GLM | Relevant OCR/translation input is sent to the selected provider |

Provider and model names are sent to the backend in request headers, but API
keys remain server-side. The Settings page only enables cloud providers whose
keys are configured.

PPT 和“已提供歌词”的视频工作流不需要 API key，音频时间由本机 `faster-whisper` 处理。
OCR、翻译和部分图片分析可选择 Ollama 或已配置的云端模型。浏览器只发送服务商与模型名称，
API key 始终保留在后端。

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python 3.11, `faster-whisper`, `python-pptx`, `python-docx`, `yt-dlp` |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4 |
| Video | Remotion 4; one composition shared by CLI rendering, the browser player, and Remotion Studio |
| Storage | Filesystem drafts and outputs, browser `sessionStorage`/`localStorage`, optional PostgreSQL library |

## Setup / 安装

### Requirements / 环境要求

- macOS or Linux (Windows through WSL is untested)
- Python 3.11
- Node.js 20+
- `ffmpeg`
- Chrome or Chromium for Remotion rendering
- `poppler` for PDF sheet music
- PostgreSQL 14+ only if the Songs Library is needed
- Ollama only if local text/vision inference is needed

macOS system packages:

```bash
brew install ffmpeg poppler postgresql@18
brew services start postgresql@18
createdb ppt_maker
```

On Linux, install the equivalent `ffmpeg`, `poppler-utils`, and PostgreSQL
packages with the system package manager.

### Backend / 后端

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Backend: [http://127.0.0.1:8000](http://127.0.0.1:8000)

The first audio analysis downloads the configured Whisper model. The default
`medium` + `int8` configuration is intended for a 16 GB laptop; choose a smaller
model in `.env` when memory is limited.

首次分析音频会下载所选 Whisper 模型。默认 `medium` + `int8` 面向 16 GB 笔记本；内存
较小时请在 `.env` 中选择更小的模型。

### Frontend and Remotion / 前端与视频渲染

```bash
cd frontend
npm install
npm run dev
```

In a second terminal, install the Remotion workspace used by the backend
renderer:

```bash
cd remotion
npm install
```

Frontend: [http://localhost:5173](http://localhost:5173)

### One-command development / 一键开发

After both workspaces are installed and `backend/.venv` exists, run from the
repository root:

```bash
./praise.sh
```

The launcher uses `backend/.venv/bin/python`, attempts to start a local
PostgreSQL service when available, starts ports 8000 and 5173, and tails logs in
`.dev-logs/`. `Ctrl+C` stops both development servers.

该脚本固定使用 `backend/.venv/bin/python`，在可用时尝试启动 PostgreSQL，并启动 8000、
5173 端口；日志写入 `.dev-logs/`。按 `Ctrl+C` 可停止两个开发服务。

### Persistent macOS service / macOS 常驻服务

```bash
./scripts/morning-star-service.sh install
```

This builds the frontend and installs user-level LaunchAgents. It does not
require `sudo` and restarts after login.

```bash
./scripts/morning-star-service.sh status
./scripts/morning-star-service.sh restart
./scripts/morning-star-service.sh logs
./scripts/morning-star-service.sh stop
./scripts/morning-star-service.sh start
./scripts/morning-star-service.sh uninstall
```

## Configuration / 配置

Copy `backend/.env.example` to `backend/.env` and configure only the services
you use.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection for Songs Library records |
| `FRONTEND_URL` | Allowed frontend origin; defaults to `http://localhost:5173` |
| `LLM_TEXT_PROVIDER` | `openai`, `anthropic`, `gemini`, `minimax`, `qwen`, `glm`, `ollama`, or empty |
| `LLM_VISION_PROVIDER` | Provider used for OCR and image analysis |
| `LLM_TEXT_MODEL` / `LLM_VISION_MODEL` | Optional provider-specific model overrides |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Gemini API key |
| `MINIMAX_API_KEY` | MiniMax API key |
| `DASHSCOPE_API_KEY` | Qwen / Alibaba DashScope API key |
| `ZHIPU_API_KEY` | GLM / Zhipu API key |
| `OLLAMA_BASE_URL` | Ollama OpenAI-compatible endpoint, normally `http://localhost:11434/v1` |
| `OLLAMA_TEXT_MODEL` / `OLLAMA_VISION_MODEL` | Default local text and vision models |
| `WHISPER_MODEL` | Local speech model; defaults to `medium` |
| `WHISPER_COMPUTE_TYPE` | Whisper compute type; defaults to `int8` |
| `WHISPER_CPU_THREADS` / `WHISPER_NUM_WORKERS` | Local transcription concurrency controls |
| `REMOTION_BROWSER_EXECUTABLE` | Optional absolute path to Chrome/Chromium; macOS Chrome is auto-detected |

Example Ollama setup:

```bash
ollama pull qwen3.5:4b
ollama pull qwen3-vl:4b
```

Keep `.env` out of version control. API keys never belong in commits, browser
storage, screenshots, or issue reports.

## Project layout / 项目结构

```text
.
├── backend/
│   ├── app/routers/       HTTP endpoints
│   ├── app/services/      DOCX, OCR, PPT, alignment, video, and library logic
│   ├── data/              bundled background assets
│   └── tests/             backend and parser regression tests
├── frontend/
│   └── src/
│       ├── pages/         workflow pages
│       ├── components/    PPT, video, layout, and shared UI
│       ├── hooks/         language, drafts, files, settings, and resume state
│       └── utils/         cross-page handoff helpers
├── remotion/              shared worship-video composition
├── scripts/               local service and background maintenance scripts
├── praise.sh              development launcher
├── CONTRIBUTING.md        contribution workflow and standards
├── REVIEW.md              mandatory review and smoke-test rules
└── CLAUDE.md              architecture notes
```

## Validation / 验证

Run all relevant checks before opening a pull request:

```bash
cd backend
./.venv/bin/python -m pytest -q

cd ../frontend
npm run lint
npm run build

cd ../remotion
npm run lint
```

The backend suite includes one live YouTube caption test. It requires internet
access and can fail or time out when YouTube is unavailable; report that
separately from offline test results.

Compilation is not a substitute for the smoke test required by `REVIEW.md`.
Exercise the affected endpoint or page with realistic input and record the
input, observed output, and one adjacent regression check in the PR body.

后端测试包含一个真实 YouTube 字幕用例，需要联网，并可能因 YouTube 暂时不可用而失败或
超时。请将该结果与离线测试分开记录。编译不能代替 `REVIEW.md` 要求的功能烟雾测试；PR
中应写明实际输入、观察结果及至少一项相邻功能验证。

## Data, copyright, and privacy / 数据、版权与隐私

- Users are responsible for obtaining permission to project or distribute
  copyrighted lyrics, sheet music, recordings, and generated media.
- Uploaded files, generated artifacts, and analysis drafts remain local unless
  a selected cloud model is used for the relevant OCR or translation request.
- Browser drafts intentionally survive page navigation. Use **Clear current
  content** to remove the active draft and its unreferenced analysis artifacts.
- Large speech, OMR, and vision models can exceed the memory available on
  smaller computers; select smaller models when needed.

- 用户应自行取得歌词、乐谱、录音投影及成品分发所需的版权许可。
- 除非相关 OCR 或翻译请求主动选择云端模型，上传文件、成品和分析草稿均保留在本机。
- 页面草稿会在切换页面后继续保留；使用“清除当前内容”可删除当前草稿及未被引用的分析文件。
- 大型语音、OMR 与视觉模型可能超出小型电脑内存，请按机器配置选择较小模型。

## Contributing / 参与贡献

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before starting non-trivial work,
and follow the review and smoke-test requirements in [`REVIEW.md`](./REVIEW.md).
Architecture details for Remotion sharing, audio plans, LLM routing, and file
cleanup are documented in [`CLAUDE.md`](./CLAUDE.md).

开始较大改动前请阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)，并遵守
[`REVIEW.md`](./REVIEW.md) 的代码审查与烟雾测试要求。Remotion 共享组件、音频计划、
模型路由和文件清理等架构说明见 [`CLAUDE.md`](./CLAUDE.md)。

## License / 许可证

GNU General Public License v3.0 or later (`GPL-3.0-or-later`). See
[`LICENSE`](./LICENSE).

本项目采用 GNU 通用公共许可证第三版或更高版本，完整条款见 [`LICENSE`](./LICENSE)。

Copyright (C) 2026 Leo Song.
