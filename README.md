# Morning Star Praise / 晨星赞美

Morning Star Praise is a local-first tool for preparing worship lyrics, editable
PowerPoint slides, sheet-music slides, and audio-synced lyric videos.

晨星赞美是一套本地优先的敬拜制作工具，可整理歌词、生成可编辑 PPT、制作乐谱歌词页，
并将用户确认的歌词与音频对齐后生成歌词视频。

## Features / 核心功能

| Workflow | English | 中文 |
|---|---|---|
| Lyrics | Import and review bilingual `.docx` lyrics, titles, hymn numbers, verses, and choruses. | 导入并校对中英双语 `.docx` 歌词、歌名、诗集编号、主歌与副歌。 |
| Slides | Create editable 16:9 PPTX files with title cards, bilingual lyrics, page numbers, and reusable backgrounds. | 生成 16:9 可编辑 PPTX，支持标题页、双语歌词、页码和背景素材。 |
| Sheet music | Extract lyrics from images or PDFs and optionally place recognized score sections above the lyrics. | 从图片或 PDF 提取歌词，并可将识别后的乐谱片段放在歌词上方。 |
| Worship video | Align supplied lyrics to an audio performance, calibrate every cue, and render 1080p MP4 and SRT files. | 将用户提供的歌词与音频对齐，逐页校准时间，并输出 1080p MP4 与 SRT。 |
| Backgrounds | Use static or motion backgrounds, reorder selections, and keep one background across each Verse + Chorus section. | 使用静态或动态背景，调整素材顺序，并让同一组主歌与副歌默认使用同一背景。 |
| Local drafts | Keep page content, uploaded files, analysis data, timing edits, and generated results while navigating. Clear only when requested. | 切换页面时保留输入、上传文件、分析结果、时间校准和成品；仅在用户主动清除时删除。 |

Audio transcription is used only to locate sung phrases. The confirmed lyrics
provided by the user remain the text shown in the video; this version does not
treat automatic audio transcription as the final lyric source.

音频转写只用于定位演唱时间，视频中显示的文字始终以用户确认的歌词为准；当前版本不会把
自动转写结果直接当作最终歌词。

## Main Pages / 主要页面

- **Lyrics / 歌词**: import and review bilingual Word lyrics / 导入并校对双语 Word 歌词
- **Slides / 幻灯片**: format lyrics and generate PPTX / 排版歌词并生成 PPTX
- **YouTube**: use available captions or frame analysis / 使用字幕或画面分析提取内容
- **Sheet Music / 乐谱**: OCR and score segmentation / 乐谱 OCR 与分段
- **Video / 视频**: audio alignment, calibration, preview, and rendering / 音频对齐、校准、预览与渲染
- **Songs / 诗歌库**: reopen saved PPT and video work / 重新打开已保存的 PPT 与视频项目
- **Settings / 设置**: template and local or cloud model choices / 模板及本地或云端模型设置

## Processing Modes / 处理模式

| Mode | English | 中文 |
|---|---|---|
| Local | `faster-whisper` handles audio timing; Ollama can provide OCR and translation. | `faster-whisper` 处理音频时间；Ollama 可用于 OCR 和翻译。 |
| API | OpenAI, Anthropic, Gemini, MiniMax, Qwen, or GLM can provide text and vision models. | 可选 OpenAI、Anthropic、Gemini、MiniMax、通义千问或智谱模型。 |

API keys stay on the backend. Provider and model choices can be changed from
the Settings page without exposing keys to the browser.

API 密钥只保存在后端；用户可在设置页切换模型服务，而浏览器不会读取或保存密钥。

## Quick Start / 快速开始

### Requirements / 环境要求

- macOS or Linux / macOS 或 Linux
- Python 3.11+
- Node.js 20+
- `ffmpeg`
- Chrome or Chromium for video rendering / 视频渲染需要 Chrome 或 Chromium
- `poppler` for PDF sheet music / PDF 乐谱需要 `poppler`
- PostgreSQL for the Songs Library; other workflows can run without it / 诗歌库需要 PostgreSQL，其他功能可独立运行

macOS dependencies / macOS 依赖：

```bash
brew install ffmpeg poppler postgresql@18
brew services start postgresql@18
createdb ppt_maker
```

### Backend / 后端

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Backend URL / 后端地址: [http://127.0.0.1:8000](http://127.0.0.1:8000)

### Frontend / 前端

```bash
cd frontend
npm install
npm run dev
```

App URL / 应用地址: [http://localhost:5173](http://localhost:5173)

### One-command Development / 一键开发启动

From the repository root / 在项目根目录运行：

```bash
./praise.sh
```

This starts the backend and frontend in the foreground. `Ctrl+C` stops both.

该命令会在前台启动后端和前端；按 `Ctrl+C` 会同时停止服务。

### Persistent macOS Service / macOS 常驻服务

```bash
./scripts/morning-star-service.sh install
```

The user-level service stays active after Terminal closes and starts again after
login. It does not require `sudo`.

该用户级服务在终端关闭后仍会运行，并在登录后自动启动，不需要 `sudo`。

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

将 `backend/.env.example` 复制为 `backend/.env`，只需配置实际使用的服务。

| Variable | Purpose / 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL connection for the Songs Library / 诗歌库数据库连接 |
| `LLM_TEXT_PROVIDER` | Default text provider; leave empty to disable / 默认文字模型服务，留空则禁用 |
| `LLM_VISION_PROVIDER` | Default OCR and vision provider / 默认 OCR 与视觉模型服务 |
| `LLM_TEXT_MODEL` | Text model override / 指定文字模型 |
| `LLM_VISION_MODEL` | Vision model override / 指定视觉模型 |
| `OLLAMA_BASE_URL` | Local Ollama endpoint, normally `http://localhost:11434/v1` / 本地 Ollama 地址 |
| `WHISPER_MODEL` | Audio alignment model; choose a smaller model on low-memory computers / 音频对齐模型，低内存电脑应选择较小模型 |

Example local models / 本地模型示例：

```bash
ollama pull qwen3.5:4b
ollama pull qwen3-vl:4b
```

The first audio analysis downloads the selected Whisper model. Vision OCR and
translation require either a configured API provider or a compatible Ollama
model.

首次分析音频时会下载所选 Whisper 模型。视觉 OCR 和翻译需要已配置的 API 服务，
或兼容的 Ollama 模型。

## Optional Sheet-Music Tools / 可选乐谱工具

- `homr` + Verovio rebuild recognized notation as clean sheet-music images.
- `oemer` provides staff detection and original-image crop fallback.
- When either tool fails, the app keeps the original upload available for manual review.

- `homr` 与 Verovio 可将识别结果重新排版为干净的乐谱图片。
- `oemer` 用于谱表检测及原图裁切回退。
- 自动识别失败时，应用仍保留原始上传内容供人工检查。

## Project Layout / 项目结构

```text
backend/    FastAPI, OCR, alignment, PPT and video services
frontend/   React, TypeScript, editing and preview UI
remotion/   Shared video composition and renderer
scripts/    Local service management
```

```text
backend/    FastAPI、OCR、音频对齐、PPT 与视频服务
frontend/   React、TypeScript、编辑与预览界面
remotion/   视频画面组件与渲染器
scripts/    本地服务管理脚本
```

## Validation / 验证

```bash
cd backend && ./.venv/bin/pytest -q
cd frontend && npm run build
cd remotion && npm run lint
```

The live YouTube extraction test requires internet access.

YouTube 在线提取测试需要网络连接。

## Notes / 注意事项

- Users are responsible for obtaining permission to project or distribute copyrighted lyrics and recordings.
- Generated files, uploaded media, and analysis drafts remain local unless an external API provider is selected.
- Large local speech or vision models can exceed the memory available on smaller computers; choose compact models when needed.

- 用户应自行取得歌词投影、录音使用及成品分发所需的版权许可。
- 除非主动选择外部 API，生成文件、上传素材和分析草稿均保留在本机。
- 大型语音或视觉模型可能超出小型电脑的可用内存，请按机器配置选择较小模型。

## Contributing / 参与贡献

Bug reports, feature ideas, and pull requests are welcome. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for development conventions.

欢迎提交问题、功能建议和 Pull Request。开发规范请参阅
[`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## License / 许可证

GNU General Public License v3.0 or later (`GPL-3.0-or-later`). See [`LICENSE`](./LICENSE).

本项目采用 GNU 通用公共许可证第三版或更高版本，完整条款见 [`LICENSE`](./LICENSE)。

Copyright (C) 2026 Leo Song.
