import { useState, useRef } from 'react';
import BackgroundPicker from '../components/ppt/BackgroundPicker';
import FontSettings from '../components/ppt/FontSettings';
import SlideDeck from '../components/ppt/SlideDeck';
import UsageBadge from '../components/shared/UsageBadge';
import { usePersistedState } from '../hooks/usePersistedState';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { useUsageTracker } from '../hooks/useUsageTracker';
import {
  parseLyrics,
  generatePPT,
  getDownloadUrl,
  convertChinese,
} from '../api/client';
import type { SlideData } from '../types';
import axios from 'axios';

export default function OcrPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].ocr;
  const fileInputRef = useRef<HTMLInputElement>(null);
  // File cannot be persisted — it's only meaningful while the user is on this tab
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');

  // Persisted inputs
  const [title, setTitle] = usePersistedState('ocr.title', '');
  const [composer, setComposer] = usePersistedState('ocr.composer', '');
  const [lyrics, setLyrics] = usePersistedState('ocr.lyrics', '');
  const [language, setLanguage] = usePersistedState<'en' | 'zh-hans' | 'zh-hant'>(
    'ocr.language',
    'en',
  );
  const [maxLines, setMaxLines] = usePersistedState('ocr.maxLines', 6);
  const [maxWidth, setMaxWidth] = usePersistedState('ocr.maxWidth', 12);
  const [primaryFontSize, setPrimaryFontSize] = usePersistedState<number | null>(
    'ocr.primaryFontSize',
    null,
  );
  const [secondaryFontSize, setSecondaryFontSize] = usePersistedState<number | null>(
    'ocr.secondaryFontSize',
    null,
  );
  const [lineSpacing, setLineSpacing] = usePersistedState<number | null>(
    'ocr.lineSpacing',
    null,
  );
  const [selectedBgIds, setSelectedBgIds] = usePersistedState<number[]>('ocr.selectedBgIds', []);

  // Transient
  const [pages, setPages] = useState(0);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [preview, setPreview] = useState<{ text: string; background_url: string }[]>([]);
  const [filename, setFilename] = useState('');
  const [generating, setGenerating] = useState(false);
  const { usage, refreshUsage } = useUsageTracker();

  const handleFile = (f: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(f.type)) {
      setError('Unsupported file type. Use JPG, PNG, WebP, or PDF.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File too large. Max 10MB.');
      return;
    }
    setFile(f);
    setError('');
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    setError('');
    setPreview([]);
    setFilename('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await axios.post<{ lyrics: string; language: string; pages: number }>(
        '/api/ocr/extract',
        formData
      );
      setLyrics(data.lyrics);
      setLanguage(data.language as typeof language);
      setPages(data.pages);
      // Auto-parse
      const parsed = await parseLyrics(data.lyrics, data.language, maxLines, 0, maxWidth);
      setSlides(parsed.slides);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'OCR extraction failed');
    } finally {
      setExtracting(false);
      refreshUsage();
    }
  };

  const handleLanguageChange = async (newLang: 'en' | 'zh-hans' | 'zh-hant') => {
    const oldLang = language;
    setLanguage(newLang);
    if (!lyrics.trim()) return;
    if (oldLang.startsWith('zh') && newLang.startsWith('zh') && oldLang !== newLang) {
      const target = newLang === 'zh-hans' ? 'simplified' : 'traditional';
      try {
        const converted = await convertChinese(lyrics, target);
        setLyrics(converted);
        if (slides.length > 0) {
          const parsed = await parseLyrics(converted, newLang, maxLines, 0, maxWidth);
          setSlides(parsed.slides);
        }
      } catch { setError('Conversion failed'); }
    }
  };

  const handleReparse = async () => {
    if (!lyrics.trim()) return;
    const parsed = await parseLyrics(lyrics, language, maxLines, 0, maxWidth);
    setSlides(parsed.slides);
  };

  const handleGenerate = async () => {
    if (!title.trim() || slides.length === 0) return;
    setGenerating(true);
    setError('');
    try {
      const result = await generatePPT(
        title, slides, language,
        selectedBgIds.length > 0 ? selectedBgIds : undefined, composer, false,
        primaryFontSize ?? undefined,
        secondaryFontSize ?? undefined,
        lineSpacing ?? undefined,
      );
      setPreview(result.slides_preview);
      setFilename(result.filename);
    } catch { setError('Failed to generate PPT'); }
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">{t.title}</h2>
      <p className="text-sm text-slate-400">{t.subtitle}</p>

      {/* Upload Zone */}
      {!lyrics && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-gold-500 bg-gold-500/10' : 'border-slate-600 hover:border-slate-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          <svg className="w-12 h-12 mx-auto mb-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {file ? (
            <p className="text-white font-medium">{file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)</p>
          ) : (
            <p className="text-slate-400">Drop sheet music here or click to browse<br />
              <span className="text-xs">JPG, PNG, WebP, PDF (max 10MB)</span>
            </p>
          )}
        </div>
      )}

      {file && !lyrics && (
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors"
        >
          {extracting ? 'Extracting lyrics with AI...' : 'Extract Lyrics'}
        </button>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">{error}</div>
      )}

      {/* Extracted Lyrics Editor */}
      {lyrics && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title..."
                className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500 w-56"
              />
              <input
                type="text"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Composer..."
                className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 w-44"
              />
              <span className="text-xs text-slate-500">{pages} page(s)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                {[{ value: 'en', label: 'EN' }, { value: 'zh-hans', label: '简' }, { value: 'zh-hant', label: '繁' }].map((opt) => (
                  <button key={opt.value} onClick={() => handleLanguageChange(opt.value as typeof language)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${language === opt.value ? 'bg-gold-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </div>

          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={10}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-gold-500"
          />

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Max lines/slide:</label>
              <select value={maxLines} onChange={(e) => setMaxLines(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white">
                {[4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Max chars/row:</label>
              <select value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white">
                {[8,10,12,14,16,20].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <FontSettings
              primaryFontSize={primaryFontSize}
              setPrimaryFontSize={setPrimaryFontSize}
              secondaryFontSize={secondaryFontSize}
              setSecondaryFontSize={setSecondaryFontSize}
              lineSpacing={lineSpacing}
              setLineSpacing={setLineSpacing}
              showSecondary={false}
            />
            <button onClick={handleReparse} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
              Re-parse ({slides.length} slides)
            </button>
            <button onClick={() => { setLyrics(''); setFile(null); setSlides([]); setPreview([]); }} className="text-xs text-slate-500 hover:text-slate-300">
              Upload new file
            </button>
          </div>

          {slides.length > 0 && preview.length === 0 && (
            <>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h3 className="text-sm font-medium text-slate-300 mb-3">{t.backgrounds}</h3>
                <BackgroundPicker selectedIds={selectedBgIds} onSelect={setSelectedBgIds} />
              </div>
              <button onClick={handleGenerate} disabled={generating || !title.trim()}
                className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors">
                {generating ? 'Generating...' : 'Generate PPT'}
              </button>
            </>
          )}
        </div>
      )}

      {preview.length > 0 && (
        <>
          <SlideDeck
            title={title}
            slides={preview}
            filename={filename}
            primaryFontSize={primaryFontSize ?? undefined}
            secondaryFontSize={secondaryFontSize ?? undefined}
            lineSpacingMultiplier={lineSpacing ?? undefined}
            language={language}
            onDownload={async () => {
            if (!filename) return;
            await refreshUsage();
            const a = document.createElement('a');
            a.href = getDownloadUrl(filename);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }} onSlidesChange={setPreview} />
          <UsageBadge usage={usage} />
        </>
      )}
    </div>
  );
}
