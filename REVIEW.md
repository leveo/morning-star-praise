# Code Review Rules

Every change that lands on `main` — whether through a pull request or a direct push — must be reviewed before the next change is started. No exceptions, even for "one-line" fixes.

## 1. When review is required

- **Pull requests to `main`**: review happens before merge.
- **Direct pushes to `main`** (solo branches, hotfixes, batched housekeeping): review happens immediately after the push, before the next change is started. If the review catches a problem, fix it as a new commit — do not force-push over the reviewed commit.
- Every commit must state in the message, or in the PR description, what was reviewed and what was smoke-tested. A commit with no review trail is the next reviewer's first blocker.

## 2. Review checklist

Reviewers walk the diff once through each of these three lenses. Findings go into the PR thread (or a follow-up commit message for direct pushes) with concrete file:line references.

### Reuse
- Does any new code duplicate an existing helper in this repo? Check utility directories and files adjacent to the change.
- Does any inline logic (string manipulation, path handling, CJK detection, environment checks) overlap with a canonical helper? Name the helper.

### Quality
- Redundant or derived state that could come from a single source.
- Parameter sprawl (>8 params on one function is a smell — consider a dataclass / options object).
- Copy-paste with minor variation — unify or justify.
- Leaky abstractions or stringly-typed code where a type / enum already exists.
- Unnecessary comments (what-narration, task references) — delete; keep only non-obvious why.
- Unnecessary JSX nesting / wrapper elements that add no layout value.

### Efficiency
- Unnecessary work in hot paths (per-request, per-render, startup).
- Sequential operations that could run in parallel.
- Recurring no-op updates inside polling loops / intervals / effect handlers — verify a change-detection guard exists and actually short-circuits.
- Unbounded data structures, missing cleanup, event listener leaks.
- TOCTOU existence checks before a filesystem / network call — operate directly and handle the error.
- Overly broad reads (full file when only a field is needed, full table when one row is needed).

## 3. Smoke test — mandatory capability verification

Every review must include a smoke test that actually exercises the changed capability end to end. Compilation clean and type-check green are **not** smoke tests — they verify syntax, not behavior.

### What qualifies

- **Backend route / service change**: call the endpoint (or the service function) with a realistic input and confirm the response body / return value / generated artifact matches the expected shape. For jobs, confirm the terminal state is `done`, not just `pending`.
- **Frontend change**: start the dev server, open the affected page in a browser, reproduce the user flow the change was meant to fix, and confirm the UI state / generated output is correct. Check one golden path and at least one adjacent feature for regression.
- **Remotion composition change**: render a short (≤10s) MP4 via the CLI or open the composition in `@remotion/player` and scrub through several frames.
- **Pipeline / alignment / transcription change**: run the change against at least one real sample (audio + lyrics pair) and verify the artifact (slide timings, stanza match, karaoke units) makes sense.
- **Build / dependency change**: run the build from a cold `node_modules` or `.venv` to confirm it succeeds with no warnings added by the change.
- **Docs change** (README / CLAUDE.md / REVIEW.md / ops runbooks): walk through the documented procedure end-to-end, tracing each referenced file path, command, and trigger phrase. Confirm the docs match current code / infrastructure — a rule that contradicts the codebase is worse than no rule.

### What does not qualify

- "I ran `tsc --noEmit` and it was clean."
- "I ran `pytest` and it passed." (Valid supplement. Not a substitute — the tests may not cover the changed capability.)
- "The warning disappeared from my terminal." (Valid for warning fixes. Not enough for a behavior change.)
- "Looks right to me." — this is a visual inspection, not a smoke test.

### What to record

Every PR / commit message includes a `Smoke test:` line (or section) stating:

1. What was exercised (endpoint, page, service, composition).
2. What input was used (file name, payload, parameters, or "pasted in the UI").
3. What output was observed (status code, filename, UI state, frame count, rendered duration).
4. Any adjacent feature that was also verified.

If the change cannot be smoke-tested in the current environment — missing credentials, no physical device, third-party dependency offline — say so explicitly in the PR. Do not silently skip.

## 4. What reviewers can block on

Any finding in §2 or a missing / insufficient smoke test in §3. A missing smoke test is a blocker on the same footing as a bug — the reviewer cannot verify the capability without it.

Taste nits go in the review thread but are not blockers unless the reviewer marks them as such.

## 5. Trigger phrase

Saying **"code review"**, **"/code review"**, **"代码审查"**, or any obvious variant to Claude Code runs this entire procedure end to end — scope identification, three parallel review agents, aggregation + fixes, mandatory smoke test, and a final commit with a `Smoke test:` section. See `CLAUDE.md` for the operational details.

