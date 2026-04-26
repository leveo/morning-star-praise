# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Process-local job state for worship-video generation.

We previously persisted to Postgres so jobs could survive backend restarts,
but worship-video jobs only live for a few minutes at most and this is a
single-user local tool. Requiring a Postgres install was friction for no
real benefit, so state lives in a process-local dict now. Restarting the
backend clears in-flight state, which is fine — the user just retries.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def create_job(job_id: str, title: str, language: str) -> None:
    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "status": "pending",
            "stage": "queued",
            "progress": 0,
            "title": title,
            "language": language,
            "video_filename": None,
            "srt_filename": None,
            "error": None,
        }


def update_job(
    job_id: str,
    status: str | None = None,
    stage: str | None = None,
    progress: int | None = None,
    video_filename: str | None = None,
    srt_filename: str | None = None,
    error: str | None = None,
) -> None:
    with _lock:
        row = _jobs.get(job_id)
        if row is None:
            logger.warning("update_job for unknown job %s", job_id)
            return
        if status is not None:
            row["status"] = status
        if stage is not None:
            row["stage"] = stage
        if progress is not None:
            row["progress"] = progress
        if video_filename is not None:
            row["video_filename"] = video_filename
        if srt_filename is not None:
            row["srt_filename"] = srt_filename
        if error is not None:
            row["error"] = error


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        row = _jobs.get(job_id)
        return dict(row) if row is not None else None
