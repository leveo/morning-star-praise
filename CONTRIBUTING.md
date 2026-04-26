# Contributing to Morning Star Praise

Thanks for your interest in contributing! This document outlines the principles and workflow for contributing to the project.

> 中文贡献者请直接看英文部分;一些常用提示在文末"中文速览"。

---

## License agreement

By submitting a contribution (pull request, patch, issue with code, etc.) you agree that your work will be licensed under **GNU GPL-3.0-or-later**, the same license as the rest of the project. We do not require a separate CLA — the GPL itself governs your contribution.

If you copy code from another project, that project's license must be compatible with GPL-3.0-or-later, and you must preserve attribution and the original license header.

## Code of conduct

Be kind. Be specific. Assume good faith. We expect contributors to be respectful regardless of background, experience level, or native language. Discussion happens in English, Chinese, or a mix — both are welcome.

Behavior that is **not** welcome: harassment, personal attacks, racism, dismissiveness toward newcomers, or weaponized "well actually"s. Maintainers may close issues or PRs from contributors who repeatedly violate this.

---

## Before you open a pull request

1. **Open an issue first** for anything non-trivial (new feature, behavior change, dependency addition, refactor that touches >5 files). A 5-minute discussion saves a 5-hour rewrite. Trivial fixes (typo, broken link, obvious one-line bug) can skip this.
2. **Search existing issues / PRs** so you don't duplicate work in flight.
3. **Bug reports** should include: what you expected, what happened, exact reproduction steps, your OS + Python + Node versions, and any logs (with API keys redacted).

## Development setup

See the **Setup** section in [README.md](./README.md) — it covers Python 3.11 (homr requires it), Node 20+, Postgres setup, and `.env` configuration. The one-shot launcher is `./praise.sh` from the repo root.

You should be able to run the project end-to-end on a machine with **no API keys** (pure-local mode using `faster-whisper` + Ollama). If your change breaks pure-local mode, that's a regression — call it out explicitly in the PR.

## Project layout

See the **Project layout** section in [README.md](./README.md). Three workspaces:

- `backend/` — FastAPI, Python 3.11
- `frontend/` — React 19 + Vite + TypeScript + Tailwind v4
- `remotion/` — Shared Remotion composition (imported by both the CLI renderer and the in-browser `@remotion/player`)

The architectural notes in [CLAUDE.md](./CLAUDE.md) cover the trickier corners (Remotion three-way sharing, Whisper alignment pipeline, `/analyze` → `/create` → `/rerender` split). Read them before touching those areas.

---

## Coding standards

### General

- **Match the surrounding style.** Don't reformat unrelated code in the same PR.
- **No new abstractions without a use case.** Three similar lines is better than a premature framework. We'd rather refactor when the need is real.
- **Comments explain WHY, not WHAT.** Well-named identifiers do the "what." Use comments for hidden constraints, subtle invariants, workarounds for specific bugs.
- **No commented-out code.** Delete it; git remembers.

### Python (`backend/`)

- Follow PEP 8. Aim for type hints on public functions.
- Run `pytest` from `backend/` before opening a PR. New features should add a test in `backend/tests/`.
- New routers go in `backend/app/routers/`, new business logic in `backend/app/services/`. Keep routers thin (request parsing + service call); push logic into services.
- Don't introduce sync I/O in async request handlers. Use `asyncio.to_thread` or run the heavy work in a background job (`video_job_service` is the existing pattern).

### Frontend (`frontend/`)

- Run `npm run lint` and `npx tsc --noEmit` before opening a PR. Both must pass.
- New UI strings go in `UI_TEXT` (`hooks/useLanguage.ts`) with **both `zh` and `en` keys in the same commit** — there is no fallback. A PR that adds `zh` only (or `en` only) will be asked to fill in the other.
- For form inputs that should survive tab switches within a session, use `usePersistedState` (sessionStorage) instead of plain `useState`.
- For background-related UI grids: lazy-pause off-screen videos using the `LazyVideoTile` pattern (`BackgroundPicker.tsx`). Don't autoplay 30+ videos.

### Remotion (`remotion/`)

- Any prop you add to `WorshipVideo.tsx` must work in **all three contexts**: the CLI renderer (file paths), the in-browser `@remotion/player` (HTTP URLs to `/static/*`), and Remotion Studio. The `resolveAssetUrl` helper exists for exactly this — use it.
- Run `npx tsc --noEmit` from `remotion/` before opening a PR.

### SPDX headers

Every new source file (`.py`, `.ts`, `.tsx`, `.js`, `.jsx`) must start with:

```
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 <Your Name>
```

(Use `//` instead of `#` for TypeScript / JavaScript.) If you copy a file from another GPL-compatible project, preserve the original copyright line and add yours below it.

### Commit messages

- Write commit messages in **English**, present tense, imperative mood ("add X", not "added X").
- One commit, one logical change. Don't bundle unrelated fixes.
- Style is loose but follow existing patterns in `git log`. A subject like `feat: per-stanza karaoke timing override` or `fix(video): plan cache miss after rerender` is fine.
- For larger changes, add a body explaining the *why*. The diff shows the *what*.
- If your PR fixes an issue, reference it: `Closes #42`.

---

## Adding an LLM provider

The dispatch logic lives in [`backend/app/services/llm_service.py`](./backend/app/services/llm_service.py). Concretely:

1. If the provider is OpenAI-compatible (most are): add to `_OPENAI_COMPAT_BASE_URLS`, `DEFAULT_TEXT_MODELS`, `DEFAULT_VISION_MODELS`. That's it.
2. If it's not OpenAI-compatible (like Anthropic / Gemini): add a `_yourprovider_text` and `_yourprovider_vision` function pair next to the existing ones, and dispatch from `text_chat` / `vision_chat`.
3. Add the API key to `backend/app/config.py` (read via `get_secret`, never hardcoded).
4. Add a row to `_PROVIDERS_META` in [`backend/app/routers/llm.py`](./backend/app/routers/llm.py) so the Settings page picks it up automatically.
5. Add the SDK to `backend/requirements.txt` only if it's not already pulled in.
6. Test in both API mode and Local mode (Ollama) — provider switching must not leak across requests (this is what the `contextvars` plumbing in `llm_service.set_request_overrides` exists for).

---

## Security

- **Never commit secrets.** `.env` is gitignored; keep it that way. If you accidentally commit a real key, rotate it immediately and `git filter-repo` the history.
- New environment variables should have an entry in `backend/.env.example` with a placeholder value.
- User-uploaded files (audio, images, PDFs) hit the disk under `backend/data/`. Don't trust filenames — see how `routers/backgrounds.py` derives paths from UUIDs + content-type.
- Don't open new CORS holes. The `allow_origins` list is intentionally narrow.

## Reporting security vulnerabilities

Do **not** open a public GitHub issue for security bugs. Email the maintainer directly (see the repo's `About` page or commit history). We'll acknowledge within a few days and coordinate a fix + disclosure timeline.

---

## Pull request checklist

Before clicking "Create pull request", check that:

- [ ] You've run the relevant test/lint/typecheck commands and they pass
- [ ] New UI text has both `zh` and `en` translations
- [ ] New source files have an SPDX header
- [ ] No secrets or personal info committed
- [ ] Commit messages are in English and follow the existing style
- [ ] You've smoke-tested the changed feature end-to-end (not just type-checked it)
- [ ] If you changed Remotion props, you've verified all three render paths still work
- [ ] If you added an env var, it's in `backend/.env.example`
- [ ] You've described the *why* in the PR body, not just the *what*

We may ask for changes. That's not personal — it's the same standard maintainers hold themselves to. Iteration is normal.

---

## 中文速览

- 提交即同意以 **GPL-3.0-or-later** 授权,无需另签 CLA
- 任何超出 typo / 一行 bug fix 的改动,请先开 issue 讨论
- UI 文案添加时,**中英双语必须同一个 commit 提交**(`useLanguage.ts` → `UI_TEXT` 的 `zh` 和 `en` 两个 key 都要写)
- Commit message 用英文,present tense (`feat: ...`, `fix: ...`, `chore: ...`)
- 新源文件首行加 SPDX header (`# SPDX-License-Identifier: GPL-3.0-or-later`)
- 不要 commit `.env` 或任何 API key;模板写在 `backend/.env.example`
- 安全漏洞请私下邮件给维护者,不要开公开 issue

感谢你的贡献!🌟
