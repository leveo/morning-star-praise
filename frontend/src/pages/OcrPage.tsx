import { useState, useRef } from 'react';
import BackgroundPicker from '../components/ppt/BackgroundPicker';
import FontSettings from '../components/ppt/FontSettings';
import SlideDeck from '../components/ppt/SlideDeck';
import UsageBadge from '../components/shared/UsageBadge';
import { usePersistedState } from '../hooks/usePersistedState';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { useTemplateDefaults } from '../hooks/useTemplateDefaults';
import { useUsageTracker } from '../hooks/useUsageTracker';
import {
  parseLyrics,
  generatePPT,
  getDownloadUrl,
  uploadSheet,
  analyzeSheet,
  deleteSheet,
  type SheetCrop,
  type SheetMode,
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
  // ``rawLyrics`` is the full OCR output (kept untouched so the user can
  // switch filter modes without re-running OCR). ``lyrics`` is the filtered
  // view shown in the textarea and used for PPT generation.
  const [rawLyrics, setRawLyrics] = usePersistedState('ocr.rawLyrics', '');
  const [lyrics, setLyrics] = usePersistedState('ocr.lyrics', '');
  const [language, setLanguage] = usePersistedState<'en' | 'zh-hans' | 'zh-hant'>(
    'ocr.language',
    'en',
  );
  type LangFilter = 'both' | 'zh' | 'en';
  const [langFilter, setLangFilter] = usePersistedState<LangFilter>('ocr.langFilter', 'both');
  const template = useTemplateDefaults();
  const [maxLines, setMaxLines] = usePersistedState('ocr.maxLines', template.maxLinesPerSlide);
  const [maxWidth, setMaxWidth] = usePersistedState('ocr.maxWidth', template.maxWidthPerRow);
  const [primaryFontSize, setPrimaryFontSize] = usePersistedState<number | null>(
    'ocr.primaryFontSize',
    template.primaryFontSize,
  );
  const [secondaryFontSize, setSecondaryFontSize] = usePersistedState<number | null>(
    'ocr.secondaryFontSize',
    null,
  );
  const [lineSpacing, setLineSpacing] = usePersistedState<number | null>(
    'ocr.lineSpacing',
    template.lineSpacing,
  );
  const [selectedBgIds, setSelectedBgIds] = usePersistedState<number[]>('ocr.selectedBgIds', []);

  // Transient
  const [pages, setPages] = useState(0);
  interface StructuredVerse { number: number; lines: string[] }
  const [structuredVerses, setStructuredVerses] = useState<StructuredVerse[] | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [preview, setPreview] = useState<{ text: string; background_url: string }[]>([]);
  const [filename, setFilename] = useState('');
  const [generating, setGenerating] = useState(false);
  const { usage, refreshUsage } = useUsageTracker();

  // Sheet music pipeline — reuse the file the user already uploaded for OCR.
  // Upload fires during extract so the OMR pipeline runs in parallel; analyze
  // is triggered once we know the slide count (after parsing).
  //
  // sheetMode: 'rebuild' = homr→Verovio clean re-render (扒谱); 'crop' = pixel
  // crop from original scan (截图). Persisted because users have strong
  // preferences — one mode is rarely right for every song they own.
  const [sheetSession, setSheetSession] = useState<string | null>(null);
  const [sheetCrops, setSheetCrops] = useState<SheetCrop[]>([]);
  const [sheetAnalyzing, setSheetAnalyzing] = useState(false);
  const [sheetMode, setSheetMode] = usePersistedState<SheetMode>('ocr.sheetMode', 'rebuild');

  // Flatten [verse × system] into one slide per (verse, system). Each slide's
  // text is the single line that verse sings under that system. When a verse
  // has fewer lines than there are systems (LLM miscounted), we pad with
  // blanks so the verse still consumes systemCount slides — that way verse N+1
  // still starts on system 0 and the sheet cycling stays aligned.
  function expandVersesBySystem(
    verses: StructuredVerse[],
    systemCount: number,
    fallbackText: string,
  ): string[] {
    if (!verses.length || systemCount <= 0) return [fallbackText];
    const out: string[] = [];
    for (const v of verses) {
      const padded = v.lines.slice(0, systemCount);
      while (padded.length < systemCount) padded.push('');
      for (const line of padded) out.push(line);
    }
    return out;
  }

  // Keep lines whose language matches the filter.
  //   both → keep everything
  //   zh   → keep lines containing at least one CJK char
  //   en   → keep lines with no CJK char and at least one Latin letter/digit
  // Blank lines are preserved in both/zh/en so verse/chorus section breaks survive.
  const applyLangFilter = (text: string, mode: LangFilter): string => {
    if (mode === 'both') return text;
    const hasCJK = (s: string) => /[\u4e00-\u9fff]/.test(s);
    const hasLatin = (s: string) => /[A-Za-z0-9]/.test(s);
    const kept: string[] = [];
    for (const line of text.split('\n')) {
      if (line.trim() === '') { kept.push(line); continue; }
      const keep = mode === 'zh' ? hasCJK(line) : (hasLatin(line) && !hasCJK(line));
      if (keep) kept.push(line);
    }
    // Collapse runs of blank lines left behind by dropped lines so the
    // verse-break spacing still reads naturally.
    const out: string[] = [];
    let prevBlank = false;
    for (const line of kept) {
      const blank = line.trim() === '';
      if (blank && prevBlank) continue;
      out.push(line);
      prevBlank = blank;
    }
    while (out.length && out[0].trim() === '') out.shift();
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    return out.join('\n');
  };

  const runSheetAnalyze = async (session: string, chunkCount: number, mode: SheetMode = sheetMode) => {
    if (chunkCount <= 0) return;
    setSheetAnalyzing(true);
    try {
      const result = await analyzeSheet(session, chunkCount, mode);
      setSheetCrops(result.crops);
    } catch {
      setSheetCrops([]);
    } finally {
      setSheetAnalyzing(false);
    }
  };

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

    // Clear any prior sheet session — each extract is a fresh upload.
    if (sheetSession) {
      await deleteSheet(sheetSession).catch(() => {});
      setSheetSession(null);
      setSheetCrops([]);
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      // OCR extract + sheet upload run in parallel: OCR pulls lyrics while
      // the sheet upload primes the OMR pipeline for the same file.
      const [ocrResult, sheetUploadResult] = await Promise.all([
        axios.post<{
          lyrics: string;
          language: string;
          pages: number;
          structured?: { verses: StructuredVerse[] };
        }>('/api/ocr/extract', formData),
        uploadSheet(file).catch(() => null),
      ]);
      const data = ocrResult.data;
      setRawLyrics(data.lyrics);
      const filtered = applyLangFilter(data.lyrics, langFilter);
      setLyrics(filtered);
      setLanguage(data.language as typeof language);
      setPages(data.pages);

      const verses = data.structured?.verses ?? null;
      setStructuredVerses(verses);

      // Sheet upload & analyze — start now so OMR runs in parallel with parse.
      let sheetSystemCount = 0;
      if (sheetUploadResult?.session_id) {
        setSheetSession(sheetUploadResult.session_id);
        setSheetAnalyzing(true);
        try {
          // First probe just to learn the true system count; we re-analyze
          // below once we know the final slide count to produce per-slide crops.
          const probe = await analyzeSheet(sheetUploadResult.session_id, 1, sheetMode);
          sheetSystemCount = probe.system_count;
        } catch {
          sheetSystemCount = 0;
        } finally {
          setSheetAnalyzing(false);
        }
      }

      // Chunking strategy:
      //   A) verses + sheet ⇒ verse × system expansion (each "line" = one slide)
      //   B) verses only     ⇒ each line is one slide, no parseLyrics chunking
      //   C) neither         ⇒ fall back to parseLyrics text chunking
      if (verses && sheetSystemCount > 0) {
        const expanded = expandVersesBySystem(verses, sheetSystemCount, filtered);
        setSlides(expanded.map((text) => ({ text })));
        if (sheetUploadResult?.session_id) {
          const res = await analyzeSheet(sheetUploadResult.session_id, expanded.length, sheetMode);
          setSheetCrops(res.crops);
        }
      } else if (verses && verses.length > 0) {
        const flat = verses.flatMap((v) => v.lines.map((ln) => ({ text: ln } as SlideData)));
        setSlides(flat);
      } else {
        const parsed = await parseLyrics(filtered, data.language, maxLines, 0, maxWidth);
        setSlides(parsed.slides);
        if (sheetUploadResult?.session_id) {
          void runSheetAnalyze(sheetUploadResult.session_id, parsed.slides.length);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'OCR extraction failed');
    } finally {
      setExtracting(false);
      refreshUsage();
    }
  };

  // Filter a structured verses list against the language mode — one line
  // at a time, drop lines that don't match. Empty verses are dropped too.
  const filterVerses = (
    verses: StructuredVerse[], mode: LangFilter,
  ): StructuredVerse[] => {
    if (mode === 'both') return verses;
    const hasCJK = (s: string) => /[\u4e00-\u9fff]/.test(s);
    const hasLatin = (s: string) => /[A-Za-z0-9]/.test(s);
    const keep = (line: string) =>
      mode === 'zh' ? hasCJK(line) : (hasLatin(line) && !hasCJK(line));
    return verses
      .map((v) => ({ number: v.number, lines: v.lines.filter(keep) }))
      .filter((v) => v.lines.length > 0);
  };

  const handleLangFilterChange = async (next: LangFilter) => {
    setLangFilter(next);
    if (!rawLyrics.trim()) return;
    const filtered = applyLangFilter(rawLyrics, next);
    setLyrics(filtered);
    const nextLang: 'en' | 'zh-hans' = /[\u4e00-\u9fff]/.test(filtered) ? 'zh-hans' : 'en';
    setLanguage(nextLang);

    // Preserve verse-aware chunking across filter switches.
    if (structuredVerses && sheetSession) {
      const verses = filterVerses(structuredVerses, next);
      if (verses.length > 0) {
        const systemCount = sheetCrops.length > 0
          ? Math.max(1, Math.round(sheetCrops.length / (structuredVerses.length || 1)))
          : 1;
        const expanded = expandVersesBySystem(verses, systemCount, filtered);
        setSlides(expanded.map((text) => ({ text })));
        void runSheetAnalyze(sheetSession, expanded.length, sheetMode);
        return;
      }
    }

    if (filtered.trim()) {
      const parsed = await parseLyrics(filtered, nextLang, maxLines, 0, maxWidth);
      setSlides(parsed.slides);
      if (sheetSession && parsed.slides.length > 0) {
        void runSheetAnalyze(sheetSession, parsed.slides.length);
      }
    } else {
      setSlides([]);
    }
  };

  const handleSheetModeChange = async (next: SheetMode) => {
    if (next === sheetMode) return;
    setSheetMode(next);
    // Re-run analysis in the new mode against the current slide count so the
    // preview crops immediately reflect the user's choice.
    if (sheetSession && slides.length > 0) {
      await runSheetAnalyze(sheetSession, slides.length, next);
    }
  };

  const handleReparse = async () => {
    if (!lyrics.trim()) return;
    const parsed = await parseLyrics(lyrics, language, maxLines, 0, maxWidth);
    setSlides(parsed.slides);
    // Re-analyze the sheet against the new chunk count so the crops still
    // line up with the regenerated slides.
    if (sheetSession && parsed.slides.length > 0) {
      void runSheetAnalyze(sheetSession, parsed.slides.length);
    }
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
        template.paddingStyle,
        sheetSession && sheetCrops.length > 0
          ? {
              sessionId: sheetSession,
              cropNames: sheetCrops.map((c) => c.filename),
            }
          : undefined,
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
                {[
                  { value: 'both', label: '保持中英文' },
                  { value: 'zh', label: '中文 Only' },
                  { value: 'en', label: '英文 Only' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleLangFilterChange(opt.value as LangFilter)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      langFilter === opt.value
                        ? 'bg-gold-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
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
              {sheetSession ? (
                <span className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-500">
                  自动
                </span>
              ) : (
                <select value={maxLines} onChange={(e) => setMaxLines(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white">
                  {[4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Max chars/row:</label>
              {sheetSession ? (
                <span className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-500">
                  自动
                </span>
              ) : (
                <select value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white">
                  {[8,10,12,14,16,20].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
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

          {slides.length > 0 && sheetSession && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">乐谱模式:</span>
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                {[
                  { value: 'rebuild' as SheetMode, label: '扒谱', hint: 'homr → Verovio 干净排版' },
                  { value: 'crop' as SheetMode, label: '截图', hint: '直接使用原图像素' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSheetModeChange(opt.value)}
                    title={opt.hint}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      sheetMode === opt.value
                        ? 'bg-gold-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {slides.length > 0 && (
            <SheetStatusBanner
              analyzing={sheetAnalyzing}
              cropCount={sheetCrops.length}
              hasSession={!!sheetSession}
            />
          )}

          {sheetCrops.length > 0 && !preview.length && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-medium text-slate-300 mb-3">乐谱片段预览</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {slides.map((slide, idx) => {
                  const crop = sheetCrops[idx];
                  return (
                    <div key={idx} className="rounded-lg border border-slate-700 bg-slate-900/60 overflow-hidden">
                      {crop ? (
                        <img
                          src={crop.url}
                          alt={`Slide ${idx + 1} sheet`}
                          className="w-full h-24 object-contain bg-white"
                        />
                      ) : (
                        <div className="w-full h-24 grid place-items-center text-xs text-slate-500 bg-slate-900">
                          无乐谱
                        </div>
                      )}
                      <div className="px-2 py-1 text-[11px] text-slate-300 truncate">
                        {idx + 1}. {slide.text || <span className="italic text-slate-500">(空白)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {slides.length > 0 && preview.length === 0 && (
            <>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <h3 className="text-sm font-medium text-slate-300 mb-3">{t.backgrounds}</h3>
                <BackgroundPicker selectedIds={selectedBgIds} onSelect={setSelectedBgIds} />
              </div>
              <button onClick={handleGenerate} disabled={generating || !title.trim() || sheetAnalyzing}
                className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors">
                {generating
                  ? 'Generating...'
                  : sheetAnalyzing
                    ? 'Waiting for sheet analysis...'
                    : 'Generate PPT'}
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

function SheetStatusBanner({
  analyzing, cropCount, hasSession,
}: {
  analyzing: boolean;
  cropCount: number;
  hasSession: boolean;
}) {
  if (!hasSession) return null;
  if (analyzing) {
    return (
      <div className="rounded-lg border border-sky-700/60 bg-sky-900/20 px-4 py-2 text-xs text-sky-200">
        正在从原图切分乐谱片段…（首次识别会下载 OMR 模型，约 2-3 分钟）
      </div>
    );
  }
  if (cropCount > 0) {
    return (
      <div className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 px-4 py-2 text-xs text-emerald-200">
        ✓ 已识别 {cropCount} 段乐谱，PPT 生成时每张 slide 会显示对应片段
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 px-4 py-2 text-xs text-amber-200">
      未识别到五线谱（可能是手抄谱或多栏排版），PPT 将仅显示歌词
    </div>
  );
}
