import { useEffect, useState } from 'react';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import {
  FACTORY_TEMPLATE_DEFAULTS,
  useTemplateDefaultsEditor,
  type TemplateDefaults,
} from '../hooks/useTemplateDefaults';
import {
  DEFAULT_LLM_SETTINGS,
  useLLMSettingsEditor,
  type LLMSettings,
} from '../hooks/useLLMSettings';
import { getLLMStatus, type LLMProviderInfo, type LLMStatusResponse } from '../api/client';

export default function TemplatesPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].templates;
  const { template, save: saveTemplate, reset: resetTemplate } = useTemplateDefaultsEditor();
  const { settings: llmSettings, save: saveLLM, reset: resetLLM } = useLLMSettingsEditor();

  // Draft is seeded from the stored value ONCE on mount. Re-syncing on every
  // reader update would stomp the user's in-progress edits every time a
  // sibling tab / component fires a storage event. Reset() explicitly
  // overwrites the draft by clearing storage + re-mounting the form.
  const [templateDraft, setTemplateDraft] = useState<TemplateDefaults>(() => template);
  const [llmDraft, setLLMDraft] = useState<LLMSettings>(() => llmSettings);
  const [status, setStatus] = useState<LLMStatusResponse | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    getLLMStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const setTpl = <K extends keyof TemplateDefaults>(key: K, value: TemplateDefaults[K]) =>
    setTemplateDraft((d) => ({ ...d, [key]: value }));
  const setLLM = <K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) =>
    setLLMDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => {
    saveTemplate(templateDraft);
    saveLLM(llmDraft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleReset = () => {
    if (!window.confirm(t.resetConfirm)) return;
    resetTemplate();
    resetLLM();
    // Reflect the reset in the draft too — the reader hooks will re-fire,
    // but the draft is intentionally one-shot so we set it directly.
    setTemplateDraft(FACTORY_TEMPLATE_DEFAULTS);
    setLLMDraft(DEFAULT_LLM_SETTINGS);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-white">{t.title}</h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">{t.description}</p>
      </div>

      <Section title={t.sectionDefaults}>
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label={t.maxLines}
            value={templateDraft.maxLinesPerSlide}
            onChange={(v) => setTpl('maxLinesPerSlide', Math.max(1, v))}
            min={1}
          />
          <NumberField
            label={t.maxChars}
            value={templateDraft.maxWidthPerRow}
            onChange={(v) => setTpl('maxWidthPerRow', Math.max(1, v))}
            min={1}
          />
          <NumberField
            label={t.maxSlides}
            value={templateDraft.maxSlides}
            onChange={(v) => setTpl('maxSlides', Math.max(0, v))}
            min={0}
            hint={t.noLimit}
          />
          <NullableNumberField
            label={t.primaryFontSize}
            value={templateDraft.primaryFontSize}
            onChange={(v) => setTpl('primaryFontSize', v)}
            placeholder={t.auto}
            step={1}
          />
          <NullableNumberField
            label={t.lineSpacing}
            value={templateDraft.lineSpacing}
            onChange={(v) => setTpl('lineSpacing', v)}
            placeholder={t.auto}
            step={0.1}
          />
          <div>
            <label className="flex items-center gap-2 text-xs text-slate-300 mt-6">
              <input
                type="checkbox"
                checked={templateDraft.showPageNumbers}
                onChange={(e) => setTpl('showPageNumbers', e.target.checked)}
                className="accent-gold-500"
              />
              {t.showPageNumbers}
            </label>
          </div>
        </div>
      </Section>

      <Section title={t.sectionLLM}>
        <p className="text-xs text-slate-400 leading-relaxed">{t.llmDescription}</p>

        <div className="flex flex-col gap-2">
          {(['default', 'api', 'local'] as const).map((m) => (
            <ModeRadio
              key={m}
              checked={llmDraft.mode === m}
              onSelect={() => setLLM('mode', m)}
              title={
                m === 'default' ? t.modeDefault : m === 'api' ? t.modeAPI : t.modeLocal
              }
              hint={
                m === 'default'
                  ? t.modeDefaultHint
                  : m === 'api'
                    ? t.modeAPIHint
                    : t.modeLocalHint
              }
            />
          ))}
        </div>

        {llmDraft.mode === 'api' && (
          <APIProviderPicker
            draft={llmDraft}
            onChange={setLLM}
            status={status}
            labels={t}
          />
        )}
        {llmDraft.mode === 'local' && (
          <LocalProviderPicker draft={llmDraft} onChange={setLLM} labels={t} />
        )}
        {llmDraft.mode !== 'default' && (
          <p className="text-xs text-slate-500 italic">{t.restartRequired}</p>
        )}
      </Section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          {t.resetToFactory}
        </button>
        <div className="flex items-center gap-3">
          {savedFlash && <span className="text-xs text-green-400">✓ {t.saved}</span>}
          <button
            type="button"
            onClick={handleSave}
            className="bg-gold-600 hover:bg-gold-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5 space-y-4">
      <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      {children}
    </div>
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
    <button
      type="button"
      onClick={onSelect}
      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
        checked
          ? 'border-gold-500 bg-gold-900/20'
          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-3 h-3 rounded-full border ${
            checked ? 'bg-gold-500 border-gold-500' : 'border-slate-500'
          }`}
        />
        <span className="text-slate-100 font-medium">{title}</span>
      </div>
      <p className="text-slate-400 mt-1 ml-5">{hint}</p>
    </button>
  );
}

type LLMLabels = typeof UI_TEXT['zh']['templates'];

function APIProviderPicker({
  draft, onChange, status, labels,
}: {
  draft: LLMSettings;
  onChange: <K extends keyof LLMSettings>(k: K, v: LLMSettings[K]) => void;
  status: LLMStatusResponse | null;
  labels: LLMLabels;
}) {
  const apiProviders = (status?.providers ?? []).filter((p) => p.key !== 'ollama');
  const textProviders = apiProviders.filter((p) => p.supports_text);
  const visionProviders = apiProviders.filter((p) => p.supports_vision);

  const findMeta = (key: string) => apiProviders.find((p) => p.key === key);
  const textMeta = findMeta(draft.textProvider);
  const visionMeta = findMeta(draft.visionProvider);

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
          value={draft.textModel}
          placeholder={textMeta?.default_text_model || labels.modelPlaceholderDefault}
          onChange={(v) => onChange('textModel', v)}
        />
        <ModelField
          label={labels.visionModel}
          value={draft.visionModel}
          placeholder={visionMeta?.default_vision_model || labels.modelPlaceholderDefault}
          onChange={(v) => onChange('visionModel', v)}
        />
      </div>
      {textMeta && !textMeta.configured && (
        <ConfigureHint meta={textMeta} labels={labels} />
      )}
      {visionMeta && !visionMeta.configured && visionMeta.key !== textMeta?.key && (
        <ConfigureHint meta={visionMeta} labels={labels} />
      )}
    </div>
  );
}

function LocalProviderPicker({
  draft, onChange, labels,
}: {
  draft: LLMSettings;
  onChange: <K extends keyof LLMSettings>(k: K, v: LLMSettings[K]) => void;
  labels: LLMLabels;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <ModelField
        label={labels.textModel}
        value={draft.textModel}
        placeholder="gemma4:e4b"
        onChange={(v) => onChange('textModel', v)}
      />
      <ModelField
        label={labels.visionModel}
        value={draft.visionModel}
        placeholder="qwen3-vl:8b"
        onChange={(v) => onChange('visionModel', v)}
      />
    </div>
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

function ModelField({
  label, value, placeholder, onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-gold-500"
      />
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

