import { createPersistedGlobalState } from './usePersistedGlobalState';

/** Per-user LLM routing — stored in localStorage, sent to the backend via
 *  X-LLM-* headers on every /api call. API keys never leave the backend;
 *  only provider names and model names travel. */
export type LLMMode = 'default' | 'api' | 'local';

export interface LLMSettings {
  /** 'default' = fall through to server env; 'api' = use one of the cloud
   *  providers chosen by ``textProvider``/``visionProvider``; 'local' = use
   *  Ollama with the configured ``textModel``/``visionModel``. */
  mode: LLMMode;
  textProvider: string;      // e.g. 'gemini', 'openai'
  visionProvider: string;
  textModel: string;          // empty = provider default
  visionModel: string;        // empty = provider default
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  mode: 'default',
  textProvider: '',
  visionProvider: '',
  textModel: '',
  visionModel: '',
};

const store = createPersistedGlobalState<LLMSettings>({
  storageKey: 'app.llmSettings',
  eventName: 'app.llmSettings.changed',
  factoryDefaults: DEFAULT_LLM_SETTINGS,
});

/** Derive the X-LLM-* headers to attach to outgoing /api requests. Returns
 *  an empty object when the user's mode is 'default' — in that case the
 *  backend uses its env configuration unchanged. */
export function resolveLLMHeaders(s: LLMSettings): Record<string, string> {
  if (s.mode === 'default') return {};
  const headers: Record<string, string> = {};
  if (s.mode === 'local') {
    headers['X-LLM-Text-Provider'] = 'ollama';
    headers['X-LLM-Vision-Provider'] = 'ollama';
    if (s.textModel) headers['X-LLM-Text-Model'] = s.textModel;
    if (s.visionModel) headers['X-LLM-Vision-Model'] = s.visionModel;
    return headers;
  }
  // 'api' — route each modality to the user's chosen cloud provider.
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
