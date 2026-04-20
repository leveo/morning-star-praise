import { createPersistedGlobalState } from './usePersistedGlobalState';

/** Per-user LLM routing — stored in localStorage, sent to the backend via
 *  X-LLM-* headers on every /api call. API keys never leave the backend;
 *  only provider names and model names travel. */
export type LLMMode = 'local' | 'api';

export interface LLMSettings {
  /** 'local' = use Ollama with the configured text/vision models;
   *  'api' = use one of the cloud providers chosen by textProvider/visionProvider. */
  mode: LLMMode;
  textProvider: string;      // e.g. 'gemini', 'openai'
  visionProvider: string;
  textModel: string;          // empty = provider default
  visionModel: string;        // empty = provider default
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
  textModel: '',
  visionModel: '',
  ollamaModelsDir: '',
};

const store = createPersistedGlobalState<LLMSettings>({
  storageKey: 'app.llmSettings',
  eventName: 'app.llmSettings.changed',
  factoryDefaults: DEFAULT_LLM_SETTINGS,
});

/** Derive the X-LLM-* headers for the current mode. Local forces Ollama on
 *  both modalities; API forwards the user's per-modality provider choice. */
export function resolveLLMHeaders(s: LLMSettings): Record<string, string> {
  const headers: Record<string, string> = {};
  if (s.mode === 'local') {
    headers['X-LLM-Text-Provider'] = 'ollama';
    headers['X-LLM-Vision-Provider'] = 'ollama';
    if (s.textModel) headers['X-LLM-Text-Model'] = s.textModel;
    if (s.visionModel) headers['X-LLM-Vision-Model'] = s.visionModel;
    return headers;
  }
  if (s.textProvider) headers['X-LLM-Text-Provider'] = s.textProvider;
  if (s.visionProvider) headers['X-LLM-Vision-Provider'] = s.visionProvider;
  if (s.textModel) headers['X-LLM-Text-Model'] = s.textModel;
  if (s.visionModel) headers['X-LLM-Vision-Model'] = s.visionModel;
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
