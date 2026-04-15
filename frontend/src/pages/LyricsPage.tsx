import { useState } from 'react';
import BackgroundPicker from '../components/ppt/BackgroundPicker';
import FontSettings from '../components/ppt/FontSettings';
import SlideDeck from '../components/ppt/SlideDeck';
import UsageBadge from '../components/shared/UsageBadge';
import {
  parseLyrics,
  parseLyricsBilingual,
  generatePPT,
  getDownloadUrl,
  convertChinese,
  saveSong,
  translateLyrics,
} from '../api/client';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { usePersistedState } from '../hooks/usePersistedState';
import { useUsageTracker } from '../hooks/useUsageTracker';
import type { SlideData } from '../types';

const SAMPLE_LYRICS = `Amazing grace how sweet the sound
That saved a wretch like me
I once was lost but now am found
Was blind but now I see

'Twas grace that taught my heart to fear
And grace my fears relieved
How precious did that grace appear
The hour I first believed`;

// Bilingual parsing happens server-side via /api/lyrics/parse-bilingual:
// it splits verses, expands Chinese clauses progressively at middle punctuation
// to match the secondary line count, then interleaves/stacks and chunks in one
// pass — guaranteeing max_lines is respected and pairing stays aligned.

export default function LyricsPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage];
  const tl = t.lyrics;
  // Inputs the user typed/toggled — persisted across tab switches.
  const [title, setTitle] = usePersistedState('lyrics.title', '');
  const [composer, setComposer] = usePersistedState('lyrics.composer', '');
  const [lyrics, setLyrics] = usePersistedState('lyrics.lyrics', '');
  const [language, setLanguage] = usePersistedState<'zh-hans' | 'zh-hant'>(
    'lyrics.language',
    'zh-hans',
  );
  const [addTranslation, setAddTranslation] = usePersistedState('lyrics.addTranslation', false);
  const [translatedLyrics, setTranslatedLyrics] = usePersistedState('lyrics.translatedLyrics', '');
  const [bilingualMode, setBilingualMode] = usePersistedState<'interleaved' | 'stacked'>(
    'lyrics.bilingualMode',
    'interleaved',
  );
  const [maxLines, setMaxLines] = usePersistedState('lyrics.maxLines', 6);
  const [maxSlides, setMaxSlides] = usePersistedState('lyrics.maxSlides', 0);
  const [maxWidth, setMaxWidth] = usePersistedState('lyrics.maxWidth', 12);
  const [primaryFontSize, setPrimaryFontSize] = usePersistedState<number | null>(
    'lyrics.primaryFontSize',
    null,
  );
  const [secondaryFontSize, setSecondaryFontSize] = usePersistedState<number | null>(
    'lyrics.secondaryFontSize',
    null,
  );
  const [lineSpacing, setLineSpacing] = usePersistedState<number | null>(
    'lyrics.lineSpacing',
    null,
  );
  const [showPageNumbers, setShowPageNumbers] = usePersistedState('lyrics.showPageNumbers', false);
  const [selectedBgIds, setSelectedBgIds] = usePersistedState<number[]>('lyrics.selectedBgIds', []);

  // Transient / derived — reset on each visit. Generated filenames would
  // get 404s after the 1-hour output cleanup anyway, so don't persist.
  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [preview, setPreview] = useState<{ text: string; background_url: string }[]>([]);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const { sessionId, usage, refreshUsage } = useUsageTracker();

  const handleParse = async () => {
    if (!lyrics.trim()) return;
    setError('');
    try {
      // Ensure the output variant matches the selected language. If the user
      // pasted 繁體 but selected 简体 (or vice versa), convert first so the
      // slides render in their chosen script. opencc is a no-op when the
      // input is already in the target variant.
      const primaryText = isInputChinese()
        ? await convertChinese(lyrics, language === 'zh-hans' ? 'simplified' : 'traditional')
        : lyrics;
      if (primaryText !== lyrics) {
        setLyrics(primaryText);
      }

      const result =
        addTranslation && translatedLyrics.trim()
          ? await parseLyricsBilingual(primaryText, translatedLyrics, bilingualMode, maxLines, maxSlides, maxWidth)
          : await parseLyrics(primaryText, language, maxLines, maxSlides, maxWidth);
      setSlides(result.slides);
    } catch (err) {
      setError(tl.errorParse);
    }
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      setError(tl.errorNeedTitle);
      return;
    }
    if (slides.length === 0) {
      setError(tl.errorNeedParse);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await generatePPT(
        title,
        slides,
        language,
        selectedBgIds.length > 0 ? selectedBgIds : undefined,
        composer,
        showPageNumbers,
        primaryFontSize ?? undefined,
        secondaryFontSize ?? undefined,
        lineSpacing ?? undefined,
      );
      setPreview(result.slides_preview);
      setFilename(result.filename);
    } catch (err) {
      setError(tl.errorGenerate);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const primaryText = isInputChinese()
        ? await convertChinese(lyrics, language === 'zh-hans' ? 'simplified' : 'traditional')
        : lyrics;
      if (primaryText !== lyrics) {
        setLyrics(primaryText);
      }

      const parsed =
        addTranslation && translatedLyrics.trim()
          ? await parseLyricsBilingual(primaryText, translatedLyrics, bilingualMode, maxLines, maxSlides, maxWidth)
          : await parseLyrics(primaryText, language, maxLines, maxSlides, maxWidth);
      const finalSlides = parsed.slides;

      setSlides(finalSlides);
      const result = await generatePPT(
        title, finalSlides, language,
        selectedBgIds.length > 0 ? selectedBgIds : undefined, composer, showPageNumbers,
        primaryFontSize ?? undefined,
        secondaryFontSize ?? undefined,
        lineSpacing ?? undefined,
      );
      setPreview(result.slides_preview);
      setFilename(result.filename);
    } catch {
      setError(tl.errorRegenerate);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!filename) return;
    await refreshUsage();
    // Use <a> download to avoid popup blockers
    const a = document.createElement('a');
    a.href = getDownloadUrl(filename);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleLoadSample = () => {
    setTitle('Amazing Grace');
    setLyrics(SAMPLE_LYRICS);
  };

  const handleLanguageChange = async (newLang: 'zh-hans' | 'zh-hant') => {
    const oldLang = language;
    setLanguage(newLang);

    if (!lyrics.trim() || oldLang === newLang) return;

    const target = newLang === 'zh-hans' ? 'simplified' : 'traditional';
    try {
      const converted = await convertChinese(lyrics, target);
      setLyrics(converted);
      if (slides.length > 0) {
        const parsed = await parseLyrics(converted, newLang, maxLines, maxSlides);
        setSlides(parsed.slides);
      }
    } catch {
      setError(tl.errorConvert);
    }
  };

  const isInputChinese = () => {
    return lyrics.split('').some((c) => c >= '\u4e00' && c <= '\u9fff');
  };

  const handleTranslate = async () => {
    if (!lyrics.trim()) return;
    setTranslating(true);
    try {
      const inputIsChinese = isInputChinese();
      // Chinese input → translate to English; English input → translate to selected output language
      const target = inputIsChinese ? 'en' : language;
      const translated = await translateLyrics(lyrics, target, title, composer, sessionId);
      setTranslatedLyrics(translated);
      setAddTranslation(true);
      refreshUsage();
    } catch (err: any) {
      const msg = err.response?.data?.detail || tl.errorTranslate;
      setError(msg);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title + Composer + Language */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {tl.songTitle}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tl.songTitlePlaceholder}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {tl.composer}
          </label>
          <input
            type="text"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={tl.composerPlaceholder}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {tl.outputLanguage}
          </label>
          <div className="flex rounded-lg overflow-hidden border border-slate-600">
            {[
              { value: 'zh-hans', label: '简体' },
              { value: 'zh-hant', label: '繁體' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleLanguageChange(opt.value as typeof language)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  language === opt.value
                    ? 'bg-gold-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleTranslate}
            disabled={translating || !lyrics.trim()}
            className={`mt-1 w-full py-1.5 text-xs font-medium rounded transition-colors ${
              addTranslation
                ? 'bg-green-700 text-green-200'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50'
            }`}
          >
            {translating ? tl.translating : addTranslation ? tl.translationAdded : tl.addTranslation}
          </button>
          {addTranslation && (
            <div className="flex rounded overflow-hidden border border-slate-600 mt-1">
              <button
                onClick={() => setBilingualMode('interleaved')}
                className={`flex-1 py-1 text-xs font-medium transition-colors ${
                  bilingualMode === 'interleaved' ? 'bg-gold-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tl.modeInterleaved}
              </button>
              <button
                onClick={() => setBilingualMode('stacked')}
                className={`flex-1 py-1 text-xs font-medium transition-colors ${
                  bilingualMode === 'stacked' ? 'bg-gold-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tl.modeStacked}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lyrics Input */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-300">
            {tl.lyricsLabel}
          </label>
          <button
            onClick={handleLoadSample}
            className="text-xs text-gold-400 hover:text-gold-300"
          >
            {tl.loadSample}
          </button>
        </div>
        <div className={addTranslation ? 'grid grid-cols-2 gap-4' : ''}>
          <div>
            {addTranslation && <label className="block text-xs text-slate-400 mb-1">{tl.originalLyrics}</label>}
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={tl.lyricsPlaceholder}
              rows={addTranslation ? 10 : 12}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent font-mono text-sm leading-relaxed resize-y"
            />
          </div>
          {addTranslation && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {tl.translationOf(isInputChinese() ? 'en' : language)}
              </label>
              <textarea
                value={translatedLyrics}
                onChange={(e) => setTranslatedLyrics(e.target.value)}
                placeholder={tl.translationPlaceholder}
                rows={10}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent font-mono text-sm leading-relaxed resize-y"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">{tl.maxLines}</label>
            <select
              value={maxLines}
              onChange={(e) => setMaxLines(Number(e.target.value))}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white"
            >
              {[4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">{tl.maxChars}</label>
            <select
              value={maxWidth}
              onChange={(e) => setMaxWidth(Number(e.target.value))}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white"
            >
              {[8, 10, 12, 14, 16, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">{tl.maxSlides}</label>
            <select
              value={maxSlides}
              onChange={(e) => setMaxSlides(Number(e.target.value))}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white"
            >
              <option value={0}>{tl.noLimit}</option>
              {[2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <FontSettings
            primaryFontSize={primaryFontSize}
            setPrimaryFontSize={setPrimaryFontSize}
            secondaryFontSize={secondaryFontSize}
            setSecondaryFontSize={setSecondaryFontSize}
            lineSpacing={lineSpacing}
            setLineSpacing={setLineSpacing}
            showSecondary={addTranslation}
          />
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showPageNumbers}
              onChange={(e) => setShowPageNumbers(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-gold-600 focus:ring-gold-500"
            />
            <span className="text-xs text-slate-400">{tl.pageNumber}</span>
          </label>
          {preview.length === 0 ? (
            <button
              onClick={handleParse}
              disabled={!lyrics.trim()}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              {slides.length > 0 ? tl.previewSlidesWithCount(slides.length) : tl.previewParse}
            </button>
          ) : (
            <button
              onClick={handleRegenerate}
              disabled={!lyrics.trim() || loading}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? tl.regenerating : tl.regenerateSlides}
            </button>
          )}
        </div>
      </div>

      {/* Parsed Slides Preview (text only) */}
      {slides.length > 0 && preview.length === 0 && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            {t.youtube.parsedSlides(slides.length)}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {slides.map((slide, i) => (
              <div
                key={i}
                className="bg-slate-900/80 rounded-lg p-3 border border-slate-700 aspect-video flex items-center justify-center"
              >
                <p className="text-xs text-slate-300 text-center whitespace-pre-line">
                  {slide.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Background Picker */}
      {slides.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-3">{t.lyrics.backgrounds}</h3>
          <BackgroundPicker
            selectedIds={selectedBgIds}
            onSelect={setSelectedBgIds}
          />
        </div>
      )}

      {/* Generate Button */}
      {slides.length > 0 && preview.length === 0 && (
        <button
          onClick={handleGenerate}
          disabled={loading || !title.trim()}
          className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors"
        >
          {loading ? tl.generating : tl.generatePpt}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Generated Preview + Download */}
      {preview.length > 0 && (
        <>
          <SlideDeck
            title={title}
            slides={preview}
            filename={filename}
            onDownload={handleDownload}
            onSlidesChange={setPreview}
            showPageNumbers={showPageNumbers}
            usage={usage}
            primaryFontSize={primaryFontSize ?? undefined}
            secondaryFontSize={secondaryFontSize ?? undefined}
            lineSpacingMultiplier={lineSpacing ?? undefined}
            language={language}
          />
          <div className="flex items-center justify-between">
            <button
              onClick={async () => {
                try {
                  await saveSong(title, lyrics, language, 'text');
                  alert(tl.savedToast);
                } catch {}
              }}
              className="text-sm text-slate-400 hover:text-gold-400 transition-colors"
            >
              {tl.saveToLibrary}
            </button>
            <UsageBadge usage={usage} />
          </div>
        </>
      )}
    </div>
  );
}
