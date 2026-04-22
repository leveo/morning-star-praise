import { createPersistedGlobalState } from './usePersistedGlobalState';

/** Per-user LLM routing — stored in localStorage, sent to the backend via
 *  X-LLM-* headers on every /api call. API keys never leave the backend;
 *  only provider names and model names travel. */
export type LLMMode = 'local' | 'api';

export interface LLMSettings {
  /** 'local' = use Ollama with the configured text/vision models;
   *  'api' = use one of the cloud providers chosen by textProvider/visionProvider. */
  mode: LLMMode;
  textProvider: string;      // e.g. 'gemini', 'openai' — API mode only
  visionProvider: string;
  /** Models are stored PER MODE so a stale Ollama model name (e.g.
   *  'qwen3-vl:8b') can't leak into an API-mode Gemini request and
   *  produce a 404 NOT_FOUND. `resolveLLMHeaders` picks the pair that
   *  matches the currently active mode. Empty = provider default. */
  apiTextModel: string;
  apiVisionModel: string;
  localTextModel: string;
  localVisionModel: string;
  /** Optional: path to the Ollama models folder. Informational / for future
   *  features that might launch a local model runtime directly. Not used
   *  for routing today — routing goes through whatever Ollama server is
   *  on OLLAMA_BASE_URL, which reads its own OLLAMA_MODELS env var. */
  ollamaModelsDir: string;
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  mode: 'local',
  textProvider: '',
  visionProvider: '',
  apiTextModel: '',
  apiVisionModel: '',
  localTextModel: '',
  localVisionModel: '',
  ollamaModelsDir: '',
};

/** Migrate pre-split-model settings: older versions stored `textModel` /
 *  `visionModel` as a single pair that could leak across modes. Route each
 *  legacy value to the mode-appropriate slot — Ollama-style tags (with ':')
 *  go to local; anything else is assumed to be an API model. Called from
 *  `read()` so migration happens the first time a user opens the new build. */
function migrateLegacyModelFields(raw: Record<string, unknown>): Record<string, unknown> {
  const legacyText = typeof raw.textModel === 'string' ? raw.textModel : '';
  const legacyVision = typeof raw.visionModel === 'string' ? raw.visionModel : '';
  if (!legacyText && !legacyVision) return raw;

  const looksLocal = (m: string) => m.includes(':');
  const out = { ...raw };

  if (legacyText && !out.apiTextModel && !out.localTextModel) {
    if (looksLocal(legacyText)) out.localTextModel = legacyText;
    else out.apiTextModel = legacyText;
  }
  if (legacyVision && !out.apiVisionModel && !out.localVisionModel) {
    if (looksLocal(legacyVision)) out.localVisionModel = legacyVision;
    else out.apiVisionModel = legacyVision;
  }
  delete out.textModel;
  delete out.visionModel;
  return out;
}

const store = createPersistedGlobalState<LLMSettings>({
  storageKey: 'app.llmSettings',
  eventName: 'app.llmSettings.changed',
  factoryDefaults: DEFAULT_LLM_SETTINGS,
  migrate: migrateLegacyModelFields,
});

/** Derive the X-LLM-* headers for the current mode. Local forces Ollama on
 *  both modalities; API forwards the user's per-modality provider choice.
 *  Each mode reads its OWN model fields so switching modes can't leak a
 *  stale model name (e.g. an Ollama tag) into the other provider's API. */
export function resolveLLMHeaders(s: LLMSettings): Record<string, string> {
  const headers: Record<string, string> = {};
  if (s.mode === 'local') {
    headers['X-LLM-Text-Provider'] = 'ollama';
    headers['X-LLM-Vision-Provider'] = 'ollama';
    if (s.localTextModel) headers['X-LLM-Text-Model'] = s.localTextModel;
    if (s.localVisionModel) headers['X-LLM-Vision-Model'] = s.localVisionModel;
    return headers;
  }
  if (s.textProvider) headers['X-LLM-Text-Provider'] = s.textProvider;
  if (s.visionProvider) headers['X-LLM-Vision-Provider'] = s.visionProvider;
  if (s.apiTextModel) headers['X-LLM-Text-Model'] = s.apiTextModel;
  if (s.apiVisionModel) headers['X-LLM-Vision-Model'] = s.apiVisionModel;
  return headers;
}

/** Subscribe to current settings — updates reactively when the Settings page saves. */
export const useLLMSettings = store.useValue;

/** Editor-side helper — save+reset, broadcasts to other mounted readers. */
export function useLLMSettingsEditor() {
  const { value, save, reset } = store.useEditor();
  return { settings: value, save, reset };
}

/** Non-hook read — for the axios interceptor which runs outside React.
 *  Caches in-module, invalidated by the 'storage' + custom event so
 *  polling-heavy flows (video job status every ~1s) don't re-parse JSON. */
let _cache: LLMSettings | null = null;

if (typeof window !== 'undefined') {
  const invalidate = () => {
    _cache = null;
  };
  window.addEventListener('app.llmSettings.changed', invalidate);
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === 'app.llmSettings') invalidate();
  });
}

export function currentLLMSettings(): LLMSettings {
  if (_cache) return _cache;
  _cache = store.read();
  return _cache;
}
