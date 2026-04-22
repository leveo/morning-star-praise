import { useEffect, useState } from 'react';
import { getLLMStatus, type LLMStatusResponse, type LLMProviderInfo } from '../api/client';
import { useLLMSettings } from './useLLMSettings';

/** Single source of truth for "which provider+model will actually be called
 *  if the user clicks Extract / Generate right now".
 *
 *  Resolution chain (highest priority first):
 *    1. User's mode — local forces ollama for both modalities
 *    2. User's explicit provider choice in Settings
 *    3. Server env default (LLM_TEXT_PROVIDER / LLM_VISION_PROVIDER)
 *    4. Empty string ⇒ feature disabled
 *
 *  The status payload is cached module-level so this hook is cheap to
 *  mount anywhere — every component gets the same object without a new
 *  round-trip. */
export interface ActiveLLM {
  textProvider: string;
  textModel: string;
  visionProvider: string;
  visionModel: string;
  textLabel: string;   // human-facing provider label for UI badge
  visionLabel: string;
  textConfigured: boolean;   // false ⇒ provider has no API key ⇒ call will error
  visionConfigured: boolean;
}

let _statusCache: LLMStatusResponse | null = null;
let _statusInflight: Promise<LLMStatusResponse> | null = null;

function loadStatus(): Promise<LLMStatusResponse> {
  if (_statusCache) return Promise.resolve(_statusCache);
  if (!_statusInflight) {
    _statusInflight = getLLMStatus()
      .then((s) => { _statusCache = s; _statusInflight = null; return s; })
      .catch((e) => { _statusInflight = null; throw e; });
  }
  return _statusInflight;
}

function findProvider(status: LLMStatusResponse | null, key: string): LLMProviderInfo | undefined {
  return status?.providers.find((p) => p.key === key);
}

export function useActiveLLM(): ActiveLLM {
  const settings = useLLMSettings();
  const [status, setStatus] = useState<LLMStatusResponse | null>(_statusCache);

  useEffect(() => {
    if (_statusCache) return;
    let mounted = true;
    loadStatus().then((s) => { if (mounted) setStatus(s); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const envText = status?.env_defaults?.text_provider || '';
  const envVision = status?.env_defaults?.vision_provider || '';

  let textProvider: string;
  let visionProvider: string;
  if (settings.mode === 'local') {
    textProvider = 'ollama';
    visionProvider = 'ollama';
  } else {
    textProvider = settings.textProvider || envText;
    visionProvider = settings.visionProvider || envVision;
  }

  const textMeta = findProvider(status, textProvider);
  const visionMeta = findProvider(status, visionProvider);

  const textModel =
    settings.textModel || textMeta?.default_text_model || '';
  const visionModel =
    settings.visionModel || visionMeta?.default_vision_model || '';

  return {
    textProvider,
    textModel,
    visionProvider,
    visionModel,
    textLabel: textMeta?.label || textProvider,
    visionLabel: visionMeta?.label || visionProvider,
    textConfigured: textMeta?.configured ?? false,
    visionConfigured: visionMeta?.configured ?? false,
  };
}

/** Escape hatch for the axios interceptor, which runs outside React and
 *  just needs the already-fetched status (if any). Does not trigger a
 *  fetch — the first render of `useActiveLLM` primes the cache. */
export function cachedLLMStatus(): LLMStatusResponse | null {
  return _statusCache;
}
