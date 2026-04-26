# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""
Secret management utility.

In production (Cloud Run), secrets are loaded from Google Secret Manager.
In development, secrets fall back to environment variables / .env file.
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend directory
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

logger = logging.getLogger(__name__)

_client = None
_cache: dict[str, str] = {}
_GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID', '1021441549102')


def _get_client():
    """Lazy-init the Secret Manager client."""
    global _client
    if _client is None:
        try:
            from google.cloud import secretmanager
            _client = secretmanager.SecretManagerServiceClient()
        except Exception as e:
            logger.debug("Secret Manager client unavailable: %s", e)
            _client = False  # sentinel: don't retry
    return _client if _client is not False else None


def _fetch_from_gsm(secret_id: str, project_id: str = _GCP_PROJECT_ID) -> str | None:
    """Fetch the latest version of a secret from Google Secret Manager."""
    client = _get_client()
    if client is None:
        return None
    try:
        name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        logger.debug("GSM fetch failed for %s: %s", secret_id, e)
        return None


def get_secret(key: str, default: str = '') -> str:
    """
    Resolve a secret value.

    Priority order:
      1. Environment variable (always wins — allows per-deploy overrides)
      2. Google Secret Manager (production)
      3. Default value
    """
    value = os.environ.get(key)
    if value:
        return value

    if os.environ.get('K_SERVICE'):
        if key in _cache:
            return _cache[key]
        gsm_value = _fetch_from_gsm(key)
        if gsm_value:
            _cache[key] = gsm_value
            return gsm_value

    return default
