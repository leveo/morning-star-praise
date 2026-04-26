// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useState, useRef, useEffect } from 'react';
import BackgroundPicker from '../components/ppt/BackgroundPicker';
import FontSettings from '../components/ppt/FontSettings';
import SlideDeck from '../components/ppt/SlideDeck';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import UsageBadge from '../components/shared/UsageBadge';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTemplateDefaults } from '../hooks/useTemplateDefaults';
import { useUsageTracker } from '../hooks/useUsageTracker';
import {
  extractYouTubeLyrics,
  extractYouTubeFrames,
  parseLyrics,
  generatePPT,
  getDownloadUrl,
  convertChinese,
  type FrameInfo,
} from '../api/client';
import type { SlideData } from '../types';

type Mode = 'lyrics' | 'frames';

const LYRICS_STEPS = ['Fetching video info...', 'Extracting subtitles...', 'Processing lyrics...'];
const FRAMES_STEPS = ['Downloading video...', 'Extracting frames...', 'Analyzing with AI...', 'Deduplicating...', 'Finalizing...'];

export default function YouTubePage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].youtube;
  // Persisted user inputs
  const [url, setUrl] = usePersistedState('youtube.url', '');
  const [mode, setMode] = usePersistedState<Mode>('youtube.mode', 'lyrics');
  const [title, setTitle] = usePersistedState('youtube.title', '');
  const [composer, setComposer] = usePersistedState('youtube.composer', '');
  const [lyrics, setLyrics] = usePersistedState('youtube.lyrics', '');
  const [language, setLanguage] = usePersistedState<'en' | 'zh-hans' | 'zh-hant'>(
    'youtube.language',
    'en',
  );
  const [subtitleType, setSubtitleType] = usePersistedState('youtube.subtitleType', '');
  const template = useTemplateDefaults();
  const [maxLines, setMaxLines] = usePersistedState('youtube.maxLines', template.maxLinesPerSlide);
  const [maxWidth, setMaxWidth] = usePersistedState('youtube.maxWidth', template.maxWidthPerRow);
  const [primaryFontSize, setPrimaryFontSize] = usePersistedState<number | null>(
    'youtube.primaryFontSize',
    template.primaryFontSize,
  );
  const [secondaryFontSize, setSecondaryFontSize] = usePersistedState<number | null>(
    'youtube.secondaryFontSize',
    null,
  );
  const [lineSpacing, setLineSpacing] = usePersistedState<number | null>(
    'youtube.lineSpacing',
    template.lineSpacing,
  );
  const [selectedBgIds, setSelectedBgIds] = usePersistedState<number[]>('youtube.selectedBgIds', []);

  // Transient
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [error, setError] = useState('');
  const progressTimer = useRef<number | null>(null);

  const [slides, setSlides] = useState<SlideData[]>([]);

  // Frames mode state — not persisted because frame image URLs point at
  // UPLOADS_DIR/<work_dir>/ which gets cleaned up after 1 hour, so stale
  // persisted entries would 404 anyway.
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const [, setWorkDir] = useState('');
  const [selectedFrameIndices, setSelectedFrameIndices] = useState<Set<number>>(new Set());

  // Generation state (filenames expire — don't persist)
  const [preview, setPreview] = useState<{ text: string; background_url: string }[]>([]);
  const [filename, setFilename] = useState('');
  const [generating, setGenerating] = useState(false);
  const { sessionId, usage, refreshUsage } = useUsageTracker();

  useEffect(() => {
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, []);

  const startProgress = (steps: string[]) => {
    setProgress(5);
    setProgressStep(steps[0]);
    let step = 0;
    const maxPct = 90;
    const interval = mode === 'lyrics' ? 800 : 3000;

    progressTimer.current = window.setInterval(() => {
      step++;
      const stepIdx = Math.min(step, steps.length - 1);
      const pct = Math.min(5 + (step * (maxPct / (steps.length * 2))), maxPct);
      setProgress(Math.round(pct));
      setProgressStep(steps[stepIdx]);
    }, interval);
  };

  const stopProgress = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    setProgress(100);
    setProgressStep('Done');
    setTimeout(() => setProgress(0), 500);
  };

  const handleExtract = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setPreview([]);
    setFilename('');
    setSlides([]);
    setFrames([]);
    startProgress(mode === 'lyrics' ? LYRICS_STEPS : FRAMES_STEPS);

    try {
      if (mode === 'lyrics') {
        const result = await extractYouTubeLyrics(url);
        setTitle(result.title);
        setLyrics(result.lyrics);
        setLanguage(result.language as typeof language);
        setSubtitleType(result.subtitle_type);
        const parsed = await parseLyrics(result.lyrics, result.language, maxLines, 0, maxWidth);
        setSlides(parsed.slides);
      } else {
        const result = await extractYouTubeFrames(url, 2.0, 0.95, sessionId);
        setTitle(result.title);
        setFrames(result.frames);
        setWorkDir(result.work_dir);
        setSelectedFrameIndices(new Set(result.frames.map((_, i) => i)));
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to extract from YouTube';
      setError(msg);
    } finally {
      stopProgress();
      setLoading(false);
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
    try {
      const parsed = await parseLyrics(lyrics, language, maxLines, 0, maxWidth);
      setSlides(parsed.slides);
    } catch { setError('Failed to parse lyrics'); }
  };

  const handleGenerateLyrics = async () => {
    if (!title.trim() || slides.length === 0) return;
    setGenerating(true);
    setError('');
    try {
      const result = await generatePPT(
        title, slides, language,
        selectedBgIds.length > 0 ? selectedBgIds : undefined,
        composer, false,
        primaryFontSize ?? undefined,
        secondaryFontSize ?? undefined,
        lineSpacing ?? undefined,
        template.paddingStyle,
      );
      setPreview(result.slides_preview);
      setFilename(result.filename);
    } catch { setError('Failed to generate PPT'); }
    finally { setGenerating(false); refreshUsage(); }
  };

  const handleGenerateFrames = async () => {
    if (!title.trim() || selectedFrameIndices.size === 0) return;
    setGenerating(true);
    setError('');
    try {
      const selectedFrames = frames.filter((_, i) => selectedFrameIndices.has(i));
      const slideData: SlideData[] = selectedFrames.map((f) => ({
        text: f.text || '',
        background_url: f.background_url || f.image_url,
        font_size: f.font_size || null,
      }));
      const result = await generatePPT(
        title, slideData, language,
        undefined, '', false,
        primaryFontSize ?? undefined,
        secondaryFontSize ?? undefined,
        lineSpacing ?? undefined,
        template.paddingStyle,
      );
      setPreview(result.slides_preview);
      setFilename(result.filename);
    } catch { setError('Failed to generate PPT'); }
    finally { setGenerating(false); refreshUsage(); }
  };

  const toggleFrame = (index: number) => {
    const next = new Set(selectedFrameIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedFrameIndices(next);
  };

  const handleDownload = async () => {
    if (!filename) return;
    await refreshUsage();
    const a = document.createElement('a');
    a.href = getDownloadUrl(filename);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{t.title}</h2>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">{t.urlLabel}</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t.urlPlaceholder}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <button
              onClick={handleExtract}
              disabled={loading || !url.trim()}
              className="bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              {loading ? t.extracting : t.extract}
            </button>
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{progressStep}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gold-500 h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setMode('lyrics')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'lyrics'
                ? 'bg-gold-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {t.modeLyrics}
          </button>
          <button
            onClick={() => setMode('frames')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'frames'
                ? 'bg-gold-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {t.modeFrames}
          </button>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm text-slate-400 space-y-2">
          {mode === 'lyrics' ? (
            <>
              <div className="flex items-center gap-2 text-slate-200 font-medium">
                <span className="bg-green-600/20 text-green-400 px-2 py-0.5 rounded text-xs">
                  {t.modeLyricsTime}
                </span>
                {t.modeLyrics}
              </div>
              <p>{t.modeLyricsBlurb}</p>
              <div className="grid grid-cols-2 gap-4 mt-2 text-xs">
                <div>
                  <span className="text-green-400 font-medium">{t.pros}</span>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    {t.lyricsPros.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-amber-400 font-medium">{t.cons}</span>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    {t.lyricsCons.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-slate-200 font-medium">
                <span className="bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded text-xs">
                  {t.modeFramesTime}
                </span>
                {t.modeFrames}
              </div>
              <p>{t.modeFramesBlurb}</p>
              <div className="grid grid-cols-2 gap-4 mt-2 text-xs">
                <div>
                  <span className="text-green-400 font-medium">{t.pros}</span>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    {t.framesPros.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-amber-400 font-medium">{t.cons}</span>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    {t.framesCons.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2 border-t border-slate-700 pt-2">
                {t.framesTip}
              </p>
            </>
          )}

          <div className="border-t border-slate-700 pt-3 mt-3">
            <p className="text-xs text-slate-500">
              <span className="text-gold-400">{t.sopHintPrefix}</span>{' '}
              <a
                href="https://sop.org/powerpoint/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-400 hover:text-gold-300 underline"
              >
                {t.sopHintLink}
              </a>
              {t.sopHintSuffix}
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Lyrics Mode Results */}
      {mode === 'lyrics' && lyrics && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.songTitlePlaceholder}
                className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-lg font-medium focus:outline-none focus:ring-2 focus:ring-gold-500 w-64"
              />
              <input
                type="text"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder={t.composerPlaceholder}
                className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 w-48"
              />
              <span className="text-xs text-slate-500">
                {subtitleType} · {language}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                {[
                  { value: 'en', label: 'EN' },
                  { value: 'zh-hans', label: '简' },
                  { value: 'zh-hant', label: '繁' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleLanguageChange(opt.value as typeof language)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      language === opt.value
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

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">{t.maxLines}:</label>
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
              <label className="text-xs text-slate-400">{t.maxChars}:</label>
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
            <FontSettings
              primaryFontSize={primaryFontSize}
              setPrimaryFontSize={setPrimaryFontSize}
              secondaryFontSize={secondaryFontSize}
              setSecondaryFontSize={setSecondaryFontSize}
              lineSpacing={lineSpacing}
              setLineSpacing={setLineSpacing}
              showSecondary={false}
            />
            <button
              onClick={handleReparse}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              {t.reparse(slides.length)}
            </button>
          </div>

          {slides.length > 0 && preview.length === 0 && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-medium text-slate-300 mb-3">{t.parsedSlides(slides.length)}</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {slides.map((slide, i) => (
                  <div key={i} className="bg-slate-900/80 rounded-lg p-3 border border-slate-700 aspect-video flex items-center justify-center">
                    <p className="text-xs text-slate-300 text-center whitespace-pre-line">{slide.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slides.length > 0 && preview.length === 0 && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-medium text-slate-300 mb-3">{t.backgrounds}</h3>
              <BackgroundPicker selectedIds={selectedBgIds} onSelect={setSelectedBgIds} />
            </div>
          )}

          {slides.length > 0 && preview.length === 0 && (
            <button
              onClick={handleGenerateLyrics}
              disabled={generating || !title.trim()}
              className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors"
            >
              {generating ? t.generating : t.generatePpt}
            </button>
          )}
        </div>
      )}

      {/* Frames Mode Results */}
      {mode === 'frames' && frames.length > 0 && preview.length === 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-lg font-medium focus:outline-none focus:ring-2 focus:ring-gold-500 w-96"
            />
            <span className="text-sm text-slate-400">
              {t.framesSelectedOf(selectedFrameIndices.size, frames.length)}
            </span>
          </div>

          <p className="text-sm text-slate-400">{t.framesInstructions}</p>
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
            {frames.map((frame, i) => (
              <button
                key={i}
                onClick={() => toggleFrame(i)}
                className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                  selectedFrameIndices.has(i)
                    ? 'border-gold-500 ring-2 ring-gold-500/30'
                    : 'border-slate-700 opacity-40'
                }`}
              >
                <img src={frame.image_url} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5 text-xs text-white">
                  {Math.floor(frame.timestamp / 60)}:{String(Math.floor(frame.timestamp % 60)).padStart(2, '0')}
                </div>
                {frame.text && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1 text-xs text-slate-200 truncate">
                    {frame.text.split('\n')[0]}
                  </div>
                )}
                {!selectedFrameIndices.has(i) && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-slate-400 text-xs">{t.framesRemoved}</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={handleGenerateFrames}
            disabled={generating || !title.trim() || selectedFrameIndices.size === 0}
            className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors"
          >
            {generating ? t.generating : t.generatePptWithCount(selectedFrameIndices.size)}
          </button>
        </div>
      )}

      {/* Generated Preview + Download */}
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
            onDownload={handleDownload}
            onSlidesChange={setPreview}
            usage={usage}
          />
        </>
      )}

      {/* Show usage even before PPT generation (e.g. after frame extraction) */}
      {preview.length === 0 && <UsageBadge usage={usage} />}
    </div>
  );
}
