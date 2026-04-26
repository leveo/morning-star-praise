// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Leo Song
import { useEffect, useState } from 'react';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import {
  FACTORY_TEMPLATE_DEFAULTS,
  useTemplateDefaultsEditor,
  type TemplateDefaults,
  type PaddingStyle,
} from '../hooks/useTemplateDefaults';
import {
  DEFAULT_LLM_SETTINGS,
  useLLMSettingsEditor,
  type LLMSettings,
} from '../hooks/useLLMSettings';
import {
  getLLMStatus,
  getOllamaModels,
  type LLMProviderInfo,
  type LLMStatusResponse,
  type OllamaModels,
} from '../api/client';

type LLMLabels = typeof UI_TEXT['zh']['templates'];

/** Per-provider suggested model names. Surfaced as a datalist beside the
 *  ModelField input so users can pick a known model without typing it,
 *  while still allowing any custom value for new models Google/etc. ship.
 *  Update when new models appear; irrelevant entries in a list (e.g. an
 *  embedding model listed under vision) are a deliberate discoverability
 *  choice — user can select and see if it works for their flow. */
const PROVIDER_MODEL_SUGGESTIONS: {
  [key: string]: { text: string[]; vision: string[] };
} = {
  gemini: {
    text: [
      'gemini-3.1-flash',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
    vision: [
      'gemini-3.1-flash-image-preview',
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-embedding-2',
    ],
  },
  openai: {
    text: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
    vision: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  anthropic: {
    text: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
    vision: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  },
  qwen: { text: ['qwen-plus', 'qwen-max'], vision: ['qwen-vl-plus', 'qwen-vl-max'] },
  glm: { text: ['glm-4-flash', 'glm-4-plus'], vision: ['glm-4v-flash', 'glm-4v-plus'] },
  minimax: { text: ['abab6.5s-chat'], vision: ['abab6.5s-chat'] },
};

export default function TemplatesPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].templates;
  const { template, save: saveTemplate, reset: resetTemplate } = useTemplateDefaultsEditor();
  const { settings: llmSettings, save: saveLLM, reset: resetLLM } = useLLMSettingsEditor();

  // One-shot draft seeding — re-syncing on reader updates would stomp the
  // user's in-progress edits every time a sibling tab fires a storage event.
  const [templateDraft, setTemplateDraft] = useState<TemplateDefaults>(() => template);
  const [llmDraft, setLLMDraft] = useState<LLMSettings>(() => llmSettings);
  const [status, setStatus] = useState<LLMStatusResponse | null>(null);
  const [ollama, setOllama] = useState<OllamaModels | null>(null);

  const refreshOllama = () => {
    getOllamaModels().then(setOllama).catch(() => setOllama(null));
  };

  useEffect(() => {
    Promise.all([
      getLLMStatus().then(setStatus).catch(() => setStatus(null)),
      getOllamaModels().then(setOllama).catch(() => setOllama(null)),
    ]);
  }, []);

  const setTpl = <K extends keyof TemplateDefaults>(key: K, value: TemplateDefaults[K]) =>
    setTemplateDraft((d) => ({ ...d, [key]: value }));
  const setLLM = <K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) =>
    setLLMDraft((d) => ({ ...d, [key]: value }));

  const handleResetAll = () => {
    if (!window.confirm(t.resetConfirm)) return;
    resetTemplate();
    resetLLM();
    setTemplateDraft(FACTORY_TEMPLATE_DEFAULTS);
    setLLMDraft(DEFAULT_LLM_SETTINGS);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-white">{t.title}</h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">{t.description}</p>
      </div>

      <TemplateDefaultsSection
        draft={templateDraft}
        setField={setTpl}
        onSave={() => saveTemplate(templateDraft)}
        labels={t}
      />

      <LLMSection
        draft={llmDraft}
        setField={setLLM}
        status={status}
        ollama={ollama}
        onRefreshOllama={refreshOllama}
        onSave={() => saveLLM(llmDraft)}
        labels={t}
      />

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleResetAll}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          {t.resetToFactory}
        </button>
      </div>
    </div>
  );
}

function TemplateDefaultsSection({
  draft, setField, onSave, labels,
}: {
  draft: TemplateDefaults;
  setField: <K extends keyof TemplateDefaults>(k: K, v: TemplateDefaults[K]) => void;
  onSave: () => void;
  labels: LLMLabels;
}) {
  return (
    <SectionWithSave title={labels.sectionDefaults} onSave={onSave} saveLabel={labels.save} savedLabel={labels.saved}>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label={labels.maxLines}
          value={draft.maxLinesPerSlide}
          onChange={(v) => setField('maxLinesPerSlide', Math.max(1, v))}
          min={1}
        />
        <NumberField
          label={labels.maxChars}
          value={draft.maxWidthPerRow}
          onChange={(v) => setField('maxWidthPerRow', Math.max(1, v))}
          min={1}
        />
        <NullableNumberField
          label={labels.maxSlides}
          value={draft.maxSlides > 0 ? draft.maxSlides : null}
          onChange={(v) => setField('maxSlides', v == null ? 0 : Math.max(0, v))}
          placeholder={labels.noLimit}
          step={1}
        />
        <NullableNumberField
          label={labels.primaryFontSize}
          value={draft.primaryFontSize}
          onChange={(v) => setField('primaryFontSize', v)}
          placeholder={labels.auto}
          step={1}
        />
        <NullableNumberField
          label={labels.lineSpacing}
          value={draft.lineSpacing}
          onChange={(v) => setField('lineSpacing', v)}
          placeholder={labels.auto}
          step={0.1}
        />
        <div>
          <label className="flex items-center gap-2 text-xs text-slate-300 mt-6">
            <input
              type="checkbox"
              checked={draft.showPageNumbers}
              onChange={(e) => setField('showPageNumbers', e.target.checked)}
              className="accent-gold-500"
            />
            {labels.showPageNumbers}
          </label>
        </div>
      </div>

      <PaddingStylePicker
        value={draft.paddingStyle}
        onChange={(v) => setField('paddingStyle', v)}
        labels={labels}
      />
    </SectionWithSave>
  );
}

function PaddingStylePicker({
  value, onChange, labels,
}: {
  value: PaddingStyle;
  onChange: (v: PaddingStyle) => void;
  labels: LLMLabels;
}) {
  const options: { key: PaddingStyle; label: string; preview: React.ReactNode }[] = [
    {
      key: 'dark',
      label: labels.paddingStyleDark,
      preview: (
        <div className="w-full h-12 rounded bg-slate-900 flex items-center justify-center text-white text-xs font-bold">
          歌词 / Lyrics
        </div>
      ),
    },
    {
      key: 'light',
      label: labels.paddingStyleLight,
      preview: (
        <div className="w-full h-12 rounded bg-slate-100 flex items-center justify-center text-slate-900 text-xs font-bold">
          歌词 / Lyrics
        </div>
      ),
    },
  ];
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-2">{labels.paddingStyle}</label>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <OptionCard
            key={o.key}
            selected={value === o.key}
            onSelect={() => onChange(o.key)}
            className="p-2"
          >
            <div className="text-slate-200 font-medium mb-1.5">{o.label}</div>
            {o.preview}
          </OptionCard>
        ))}
      </div>
    </div>
  );
}

function LLMSection({
  draft, setField, status, ollama, onRefreshOllama, onSave, labels,
}: {
  draft: LLMSettings;
  setField: <K extends keyof LLMSettings>(k: K, v: LLMSettings[K]) => void;
  status: LLMStatusResponse | null;
  ollama: OllamaModels | null;
  onRefreshOllama: () => void;
  onSave: () => void;
  labels: LLMLabels;
}) {
  return (
    <SectionWithSave title={labels.sectionLLM} onSave={onSave} saveLabel={labels.save} savedLabel={labels.saved}>
      <p className="text-xs text-slate-400 leading-relaxed">{labels.llmDescription}</p>

      <div className="flex flex-col gap-2">
        {(['local', 'api'] as const).map((m) => (
          <ModeRadio
            key={m}
            checked={draft.mode === m}
            onSelect={() => setField('mode', m)}
            title={m === 'local' ? labels.modeLocal : labels.modeAPI}
            hint={m === 'local' ? labels.modeLocalHint : labels.modeAPIHint}
          />
        ))}
      </div>

      {draft.mode === 'api' && (
        <APIProviderPicker draft={draft} onChange={setField} status={status} labels={labels} />
      )}
      {draft.mode === 'local' && (
        <LocalProviderPicker
          draft={draft}
          onChange={setField}
          ollama={ollama}
          onRefresh={onRefreshOllama}
          labels={labels}
        />
      )}

      {draft.mode === 'api' && (
        <p className="text-xs text-slate-500 italic">{labels.restartRequired}</p>
      )}
    </SectionWithSave>
  );
}

function SectionWithSave({
  title, children, onSave, saveLabel, savedLabel,
}: {
  title: string;
  children: React.ReactNode;
  onSave: () => void;
  saveLabel: string;
  savedLabel: string;
}) {
  const [flash, setFlash] = useState(false);
  const handleSave = () => {
    onSave();
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
  };
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5 space-y-4">
      <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      {children}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700">
        {flash && <span className="text-xs text-green-400">✓ {savedLabel}</span>}
        <button
          type="button"
          onClick={handleSave}
          className="bg-gold-600 hover:bg-gold-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function OptionCard({
  selected, onSelect, className = '', children,
}: {
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-lg border text-xs transition-colors ${
        selected
          ? 'border-gold-500 bg-gold-900/20'
          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function ModeRadio({
  checked, onSelect, title, hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <OptionCard selected={checked} onSelect={onSelect} className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-3 h-3 rounded-full border ${
            checked ? 'bg-gold-500 border-gold-500' : 'border-slate-500'
          }`}
        />
        <span className="text-slate-100 font-medium">{title}</span>
      </div>
      <p className="text-slate-400 mt-1 ml-5">{hint}</p>
    </OptionCard>
  );
}

function APIProviderPicker({
  draft, onChange, status, labels,
}: {
  draft: LLMSettings;
  onChange: <K extends keyof LLMSettings>(k: K, v: LLMSettings[K]) => void;
  status: LLMStatusResponse | null;
  labels: LLMLabels;
}) {
  const allApi = (status?.providers ?? []).filter((p) => p.key !== 'ollama');
  // Only offer providers whose API key is present in the server's .env.
  // Exception: keep the user's currently-selected provider visible even
  // without a key, so a stale choice doesn't silently reset to blank.
  const enabledApi = allApi.filter((p) => p.configured);
  const include = (list: LLMProviderInfo[], key: string) => {
    if (!key) return list;
    return list.some((p) => p.key === key)
      ? list
      : [...list, ...allApi.filter((p) => p.key === key)];
  };
  const textProviders = include(
    enabledApi.filter((p) => p.supports_text),
    draft.textProvider,
  );
  const visionProviders = include(
    enabledApi.filter((p) => p.supports_vision),
    draft.visionProvider,
  );

  const findMeta = (key: string) => allApi.find((p) => p.key === key);
  const textMeta = findMeta(draft.textProvider);
  const visionMeta = findMeta(draft.visionProvider);
  const showVisionHint = visionMeta && !visionMeta.configured && visionMeta.key !== textMeta?.key;

  if (status && enabledApi.length === 0) {
    return (
      <div className="rounded-lg border border-amber-700/50 bg-amber-900/10 px-4 py-3 text-xs text-amber-200 space-y-1">
        <p>{labels.noApiKeysConfigured}</p>
        <p className="text-amber-300/80">{labels.noApiKeysHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ProviderSelect
          label={labels.textProvider}
          value={draft.textProvider}
          options={textProviders}
          onChange={(v) => onChange('textProvider', v)}
        />
        <ProviderSelect
          label={labels.visionProvider}
          value={draft.visionProvider}
          options={visionProviders}
          onChange={(v) => onChange('visionProvider', v)}
        />
        <ModelField
          label={labels.textModel}
          value={draft.apiTextModel}
          placeholder={textMeta?.default_text_model || labels.modelPlaceholderDefault}
          onChange={(v) => onChange('apiTextModel', v)}
          suggestions={PROVIDER_MODEL_SUGGESTIONS[draft.textProvider]?.text}
        />
        <ModelField
          label={labels.visionModel}
          value={draft.apiVisionModel}
          placeholder={visionMeta?.default_vision_model || labels.modelPlaceholderDefault}
          onChange={(v) => onChange('apiVisionModel', v)}
          suggestions={PROVIDER_MODEL_SUGGESTIONS[draft.visionProvider]?.vision}
        />
      </div>
      {textMeta && !textMeta.configured && <ConfigureHint meta={textMeta} labels={labels} />}
      {showVisionHint && visionMeta && <ConfigureHint meta={visionMeta} labels={labels} />}
    </div>
  );
}

function LocalProviderPicker({
  draft, onChange, ollama, onRefresh, labels,
}: {
  draft: LLMSettings;
  onChange: <K extends keyof LLMSettings>(k: K, v: LLMSettings[K]) => void;
  ollama: OllamaModels | null;
  onRefresh: () => void;
  labels: LLMLabels;
}) {
  const textOptions = ollama?.available ? ollama.text : [];
  const visionOptions = ollama?.available ? ollama.vision : [];

  return (
    <div className="space-y-4">
      <ModelsDirectoryPicker
        value={draft.ollamaModelsDir}
        onChange={(v) => onChange('ollamaModelsDir', v)}
        labels={labels}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {ollama?.available
            ? `${textOptions.length} models detected`
            : labels.modelsUnavailable}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-slate-400 hover:text-slate-200 underline"
        >
          {labels.modelsRefresh}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ModelDropdown
          label={labels.textModel}
          value={draft.localTextModel}
          options={textOptions}
          placeholder={labels.modelPlaceholderDefault}
          onChange={(v) => onChange('localTextModel', v)}
        />
        <ModelDropdown
          label={labels.visionModel}
          value={draft.localVisionModel}
          options={visionOptions}
          placeholder={labels.modelPlaceholderDefault}
          onChange={(v) => onChange('localVisionModel', v)}
        />
      </div>
    </div>
  );
}

function ModelsDirectoryPicker({
  value, onChange, labels,
}: {
  value: string;
  onChange: (v: string) => void;
  labels: LLMLabels;
}) {
  const pickFolder = async () => {
    // Prefer the modern File System Access API (Chrome / Edge) — it opens
    // a native OS folder picker WITHOUT enumerating the folder's blobs, so
    // choosing ``~/.ollama/models`` (multi-GB) is instant.
    const anyWindow = window as unknown as {
      showDirectoryPicker?: () => Promise<{ name: string }>;
    };
    if (typeof anyWindow.showDirectoryPicker === 'function') {
      try {
        const handle = await anyWindow.showDirectoryPicker();
        if (handle?.name) onChange(handle.name);
      } catch {
        /* user cancelled — no-op */
      }
      return;
    }
    // Safari / Firefox fallback via <input webkitdirectory>. Browsers
    // privacy-restrict absolute paths, so we store the leaf folder name
    // (same as the modern API) — users type the full path if they need it.
    const input = document.createElement('input');
    input.type = 'file';
    (input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    input.onchange = () => {
      const first = input.files?.[0] as (File & { webkitRelativePath?: string }) | undefined;
      const leaf = first?.webkitRelativePath?.split('/')[0];
      if (leaf) onChange(leaf);
    };
    input.click();
  };

  return (
    <div>
      <label className="text-xs text-slate-400">{labels.modelsDir}</label>
      <p className="text-[11px] text-slate-500 mb-1.5 whitespace-pre-line">{labels.modelsDirHint}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={pickFolder}
          title={labels.modelsDir}
          aria-label={labels.modelsDir}
          className="shrink-0 bg-slate-700 hover:bg-slate-600 text-slate-200 w-9 h-9 rounded flex items-center justify-center"
        >
          <FolderIcon />
        </button>
        <div className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm truncate">
          {value ? (
            <span className="text-white">{value}</span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 text-slate-500 hover:text-slate-300 text-sm"
            aria-label="clear"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.79a1.5 1.5 0 0 1 1.06.44L9.7 5.5h6.8A1.5 1.5 0 0 1 18 7v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 14.5v-9Z" />
    </svg>
  );
}

function ProviderSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: LLMProviderInfo[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-gold-500"
      >
        <option value="">—</option>
        {options.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
            {p.configured ? '' : '  (key missing)'}
          </option>
        ))}
      </select>
    </div>
  );
}

function ModelDropdown({
  label, value, options, placeholder, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  // If the currently stored value isn't in the detected list, still render
  // it as an option so the select reflects the user's choice even when the
  // Ollama daemon is off or the model was uninstalled.
  const effective = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-gold-500"
      >
        <option value="">{placeholder}</option>
        {effective.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

function ModelField({
  label, value, placeholder, onChange, suggestions,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  /** Optional datalist of known model names for the current provider.
   *  Rendered as a native combobox — user still sees a text input and
   *  can type any custom value, but gets autocomplete + a dropdown arrow. */
  suggestions?: string[];
}) {
  const listId = suggestions && suggestions.length > 0
    ? `modelfield-${label.replace(/\s+/g, '-').toLowerCase()}`
    : undefined;
  return (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-gold-500"
      />
      {listId && (
        <datalist id={listId}>
          {suggestions!.map((m) => <option key={m} value={m} />)}
        </datalist>
      )}
    </div>
  );
}

function ConfigureHint({ meta, labels }: { meta: LLMProviderInfo; labels: LLMLabels }) {
  if (!meta.env_var) return null;
  return (
    <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 p-3 text-xs text-amber-200">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">
          {meta.label} — {labels.providerMissingKey}
        </span>
        <span className="text-amber-400">{labels.howToConfigure}</span>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-amber-100/90">
        {labels.howToConfigureBody(meta.env_var, meta.get_key_url)}
      </pre>
    </div>
  );
}

function NumberField({
  label, value, onChange, min, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-gold-500"
      />
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function NullableNumberField({
  label, value, onChange, placeholder, step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  step?: number;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="number"
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-gold-500"
      />
    </div>
  );
}

