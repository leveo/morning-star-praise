import { useEffect, useMemo, useRef, useState } from 'react';
import BackgroundPicker from '../components/ppt/BackgroundPicker';
import FontSettings from '../components/ppt/FontSettings';
import VideoEditor from '../components/worship/VideoEditor';
import FreeBackgroundResources from '../components/worship/FreeBackgroundResources';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { usePersistedState } from '../hooks/usePersistedState';
import { useResumeSnapshot } from '../hooks/useResumeSnapshot';
import { useTemplateDefaults } from '../hooks/useTemplateDefaults';
import {
  analyzeSheet,
  analyzeWorshipAudio,
  createWorshipVideo,
  deleteSheet,
  extractLyricsFromFile,
  extractYouTubeLyrics,
  getBackgrounds,
  getVideoJob,
  getVideoDownloadUrl,
  mergeVideoJobStatus,
  uploadSheet,
  type AnalyzedSlide,
  type AnalyzedStanzaOccurrence,
  type ExtractedBackground,
  type SheetCrop,
  type SheetMode,
  type VideoJobStatus,
} from '../api/client';
import type { BackgroundInfo } from '../types';

type LyricsSource = 'paste' | 'pptx' | 'image' | 'youtube';

const LYRICS_SOURCE_ORDER: LyricsSource[] = ['paste', 'pptx', 'image', 'youtube'];

const PPTX_ACCEPT =
  '.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint';
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf';

export default function WorshipVideoPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].worshipVideo;
  // File objects and in-flight job state can't survive tab switches — they
  // reference browser-local resources (File) and backend resources that
  // expire with the per-job cleanup.
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [lyricsFile, setLyricsFile] = useState<File | null>(null);
  const [extractedBgs, setExtractedBgs] = useState<ExtractedBackground[]>([]);
  const [job, setJob] = useState<VideoJobStatus | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const [title, setTitle] = usePersistedState('worshipVideo.title', '');
  const [composer, setComposer] = usePersistedState('worshipVideo.composer', '');
  const [language, setLanguage] = usePersistedState('worshipVideo.language', 'auto');
  const [lyrics, setLyrics] = usePersistedState('worshipVideo.lyrics', '');
  const [selectedBgIds, setSelectedBgIds] = usePersistedState<number[]>(
    'worshipVideo.selectedBgIds',
    [],
  );
  const [lyricsSource, setLyricsSource] = usePersistedState<LyricsSource>(
    'worshipVideo.lyricsSource',
    'paste',
  );
  const [youtubeUrl, setYoutubeUrl] = usePersistedState('worshipVideo.youtubeUrl', '');
  const [usePptBackgrounds, setUsePptBackgrounds] = usePersistedState(
    'worshipVideo.usePptBackgrounds',
    false,
  );
  const [karaokeMode, setKaraokeMode] = usePersistedState('worshipVideo.karaokeMode', false);
  const template = useTemplateDefaults();
  const [showPageNumbers, setShowPageNumbers] = usePersistedState(
    'worshipVideo.showPageNumbers',
    template.showPageNumbers,
  );
  const [maxLines, setMaxLines] = usePersistedState('worshipVideo.maxLines', template.maxLinesPerSlide);
  const [maxWidth, setMaxWidth] = usePersistedState('worshipVideo.maxWidth', template.maxWidthPerRow);
  const [primaryFontSize, setPrimaryFontSize] = usePersistedState<number | null>(
    'worshipVideo.primaryFontSize',
    template.primaryFontSize,
  );
  const [secondaryFontSize, setSecondaryFontSize] = usePersistedState<number | null>(
    'worshipVideo.secondaryFontSize',
    null,
  );
  const [lineSpacing, setLineSpacing] = usePersistedState<number | null>(
    'worshipVideo.lineSpacing',
    template.lineSpacing,
  );

  // Analysis state — regenerated whenever the inputs that affect slide
  // order / chunking change, so we never let the user generate a video
  // off a stale analysis. ``analyzedKey`` snapshots the input fingerprint
  // the current ``analysisId`` was computed from.
  const [analysisId, setAnalysisId] = useState<string>('');
  const [analyzedKey, setAnalyzedKey] = useState<string>('');
  const [previewSlides, setPreviewSlides] = useState<AnalyzedSlide[]>([]);
  const [occurrences, setOccurrences] = useState<AnalyzedStanzaOccurrence[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [allBackgrounds, setAllBackgrounds] = useState<BackgroundInfo[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editedVideoFilename, setEditedVideoFilename] = useState<string>('');

  // Optional sheet-music overlay: user uploads a score PNG/PDF, we run OMR and
  // the renderer shows the matching snippet on each slide. Both modes share
  // the same upload — switching only re-runs analyze against the cached file.
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetSession, setSheetSession] = useState<string | null>(null);
  const [sheetCrops, setSheetCrops] = useState<SheetCrop[]>([]);
  const [sheetAnalyzing, setSheetAnalyzing] = useState(false);
  const [sheetMode, setSheetMode] = usePersistedState<SheetMode>('worshipVideo.sheetMode', 'rebuild');
  const sheetInputRef = useRef<HTMLInputElement>(null);

  const pollRef = useRef<number | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    getBackgrounds().then(setAllBackgrounds).catch(() => {});
  }, []);

  useResumeSnapshot<Partial<{
    title: string;
    composer: string;
    language: string;
    lyrics: string;
    selectedBgIds: number[];
    lyricsSource: LyricsSource;
    youtubeUrl: string;
    usePptBackgrounds: boolean;
    karaokeMode: boolean;
    showPageNumbers: boolean;
    maxLines: number;
    maxWidth: number;
    primaryFontSize: number | null;
    secondaryFontSize: number | null;
    lineSpacing: number | null;
  }>>('worship-video', (payload) => {
    const s = payload.snapshot;
    if (s.title != null) setTitle(s.title);
    if (s.composer != null) setComposer(s.composer);
    if (s.language != null) setLanguage(s.language);
    if (s.lyrics != null) setLyrics(s.lyrics);
    if (s.selectedBgIds != null) setSelectedBgIds(s.selectedBgIds);
    if (s.lyricsSource != null) setLyricsSource(s.lyricsSource);
    if (s.youtubeUrl != null) setYoutubeUrl(s.youtubeUrl);
    if (s.usePptBackgrounds != null) setUsePptBackgrounds(s.usePptBackgrounds);
    if (s.karaokeMode != null) setKaraokeMode(s.karaokeMode);
    if (s.showPageNumbers != null) setShowPageNumbers(s.showPageNumbers);
    if (s.maxLines != null) setMaxLines(s.maxLines);
    if (s.maxWidth != null) setMaxWidth(s.maxWidth);
    if (s.primaryFontSize != null) setPrimaryFontSize(s.primaryFontSize);
    if (s.secondaryFontSize != null) setSecondaryFontSize(s.secondaryFontSize);
    if (s.lineSpacing != null) setLineSpacing(s.lineSpacing);
    // If the analysis cache is still on disk, pre-seed analysisId so
    // "Edit video" works without re-analyzing. Filename from the prior
    // render lets the user see the completed state immediately.
    if (payload.analysis_exists && payload.analysis_id) {
      setAnalysisId(payload.analysis_id);
    }
    if (payload.filename) {
      setEditedVideoFilename(payload.filename);
    }
  });

  const startPolling = (jobId: string) => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const latest = await getVideoJob(jobId);
        setJob((prev) => mergeVideoJobStatus(prev, latest));
        if (latest.status === 'done' || latest.status === 'failed') {
          if (pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
          if (latest.status === 'failed' && latest.error) {
            setError(latest.error);
          }
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 2000);
  };

  const handleSourceChange = (next: LyricsSource) => {
    setLyricsSource(next);
    setLyricsFile(null);
    setYoutubeUrl('');
    setError('');
    if (next !== 'pptx') {
      setExtractedBgs([]);
      setUsePptBackgrounds(false);
    }
    if (lyricsFileInputRef.current) lyricsFileInputRef.current.value = '';
  };

  const handleExtract = async () => {
    setError('');
    setExtracting(true);
    try {
      if (lyricsSource === 'youtube') {
        if (!youtubeUrl.trim()) {
          setError('Please paste a YouTube URL');
          return;
        }
        const result = await extractYouTubeLyrics(youtubeUrl.trim());
        setLyrics(result.lyrics);
        if (result.title && !title) setTitle(result.title);
        setExtractedBgs([]);
        setUsePptBackgrounds(false);
        return;
      }

      if (!lyricsFile) {
        setError('Please choose a file to extract from');
        return;
      }
      const result = await extractLyricsFromFile(lyricsFile);
      setLyrics(result.lyrics);
      if (result.title && !title) setTitle(result.title);
      if (result.composer && !composer) setComposer(result.composer);
      if (result.backgrounds.length > 0) {
        setExtractedBgs(result.backgrounds);
        setUsePptBackgrounds(true);
      } else {
        setExtractedBgs([]);
        setUsePptBackgrounds(false);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Extraction failed';
      setError(msg);
    } finally {
      setExtracting(false);
    }
  };

  // Fingerprint of the inputs that affect slide order / chunking. Any
  // change invalidates the current analysis.
  const audioKey = audioFile
    ? `${audioFile.name}:${audioFile.size}:${audioFile.lastModified}`
    : '';
  const previewKey = `${audioKey}\u0001${lyrics}\u0001${maxLines}\u0001${maxWidth}\u0001${language}`;
  const hasFreshPreview = !!analysisId && analyzedKey === previewKey;
  const isPreviewStale = !!analysisId && !hasFreshPreview;

  const runSheetAnalyzeForSlides = async (
    session: string,
    slideCount: number,
    mode: SheetMode,
  ) => {
    if (slideCount <= 0) return;
    setSheetAnalyzing(true);
    try {
      const result = await analyzeSheet(session, slideCount, mode);
      setSheetCrops(result.crops);
    } catch {
      setSheetCrops([]);
    } finally {
      setSheetAnalyzing(false);
    }
  };

  const handleAnalyze = async () => {
    setError('');
    if (!audioFile) {
      setError('Please select an audio file first — Analyze needs the MP3');
      return;
    }
    if (!lyrics.trim()) {
      setError('Lyrics are empty — paste them or upload a file and extract');
      return;
    }
    setPreviewLoading(true);
    // Run audio analysis and sheet upload in parallel so the user isn't
    // waiting on two serial round-trips. Sheet upload is optional; a failure
    // there just leaves crops empty.
    const sheetUploadPromise = sheetFile
      ? (sheetSession
          ? Promise.resolve({ session_id: sheetSession })
          : uploadSheet(sheetFile).catch(() => null))
      : Promise.resolve(null);
    try {
      const [result, sheetUpload] = await Promise.all([
        analyzeWorshipAudio(audioFile, lyrics, language, maxLines, maxWidth),
        sheetUploadPromise,
      ]);
      setAnalysisId(result.analysis_id);
      setPreviewSlides(result.slides);
      setOccurrences(result.occurrences);
      setAnalyzedKey(previewKey);
      if (sheetUpload?.session_id) {
        setSheetSession(sheetUpload.session_id);
        void runSheetAnalyzeForSlides(sheetUpload.session_id, result.slides.length, sheetMode);
      } else {
        setSheetCrops([]);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to analyze audio';
      setError(msg);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSheetFileChange = async (f: File | null) => {
    // Replacing the sheet invalidates any prior session — clean it up on the
    // backend so we don't leak uploads, and clear crops until re-analyze runs.
    if (sheetSession) {
      await deleteSheet(sheetSession).catch(() => {});
    }
    setSheetFile(f);
    setSheetSession(null);
    setSheetCrops([]);
  };

  const handleSheetModeChange = (next: SheetMode) => {
    if (next === sheetMode) return;
    setSheetMode(next);
    if (sheetSession && previewSlides.length > 0) {
      void runSheetAnalyzeForSlides(sheetSession, previewSlides.length, next);
    }
  };

  const handleGenerate = async () => {
    setError('');
    if (!hasFreshPreview) {
      setError('Please analyze the audio first and confirm the slide order');
      return;
    }

    setSubmitting(true);
    setJob(null);
    try {
      const useExtracted = usePptBackgrounds && extractedBgs.length > 0;
      const snapshot = {
        title, composer, language, lyrics,
        selectedBgIds, lyricsSource, youtubeUrl,
        usePptBackgrounds, karaokeMode, showPageNumbers,
        maxLines, maxWidth,
        primaryFontSize, secondaryFontSize, lineSpacing,
      };
      const created = await createWorshipVideo(
        analysisId,
        title,
        composer,
        !useExtracted && selectedBgIds.length > 0 ? selectedBgIds : undefined,
        useExtracted ? extractedBgs.map((b) => b.filename) : undefined,
        karaokeMode,
        primaryFontSize ?? undefined,
        secondaryFontSize ?? undefined,
        lineSpacing ?? undefined,
        showPageNumbers,
        snapshot,
        template.paddingStyle,
        sheetSession && sheetCrops.length > 0
          ? { sessionId: sheetSession, cropFilenames: sheetCrops.map((c) => c.filename) }
          : undefined,
      );
      setJob(created);
      startPolling(created.job_id);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to start video job';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setJob(null);
    setError('');
    setEditMode(false);
    setEditedVideoFilename('');
  };

  /** Pool of backgrounds the preview + player + renderer will cycle
   *  through. Mirrors backend ``assign_backgrounds`` precedence: PPT
   *  extracted → user-selected defaults → full library fallback. */
  const currentBackgroundPool = useMemo((): BackgroundInfo[] => {
    if (usePptBackgrounds && extractedBgs.length > 0) {
      return extractedBgs.map((bg, i) => ({
        id: -(i + 1),
        filename: bg.filename,
        name: bg.filename,
        category: 'extracted',
        url: bg.url,
        is_default: false,
        media_type: 'image' as const,
      }));
    }
    if (selectedBgIds.length > 0) {
      return allBackgrounds.filter((bg) => selectedBgIds.includes(bg.id));
    }
    return allBackgrounds;
  }, [usePptBackgrounds, extractedBgs, selectedBgIds, allBackgrounds]);

  const previewBackgroundForSlide = (
    i: number,
  ): { url: string; isVideo: boolean } | null => {
    if (currentBackgroundPool.length === 0) return null;
    const bg = currentBackgroundPool[i % currentBackgroundPool.length];
    return { url: bg.url, isVideo: bg.media_type === 'video' };
  };

  const downloadFile = (filename: string) => {
    const a = document.createElement('a');
    a.href = getVideoDownloadUrl(filename);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isRunning = job && (job.status === 'pending' || job.status === 'processing');
  const isDone = job && job.status === 'done';
  const fileAccept = lyricsSource === 'pptx' ? PPTX_ACCEPT : IMAGE_ACCEPT;
  const showFileInput = lyricsSource === 'pptx' || lyricsSource === 'image';
  const showYoutubeInput = lyricsSource === 'youtube';

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">{t.title}</h2>
        <p className="text-sm text-slate-400">{t.subtitle}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          {t.audioLabel}
        </label>
        <input
          ref={audioInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.flac,.ogg,audio/*"
          onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
          className="hidden"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => audioInputRef.current?.click()}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {audioFile ? t.changeAudio : t.chooseAudio}
          </button>
          {audioFile && (
            <span className="text-sm text-slate-300 truncate">
              {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t.songTitle}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.songTitlePlaceholder}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t.composer}
          </label>
          <input
            type="text"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={t.composerPlaceholder}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t.audioLanguageLabel}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="auto">{t.audioLanguageAuto}</option>
            <option value="zh">{t.audioLanguageZh}</option>
            <option value="en">{t.audioLanguageEn}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {t.lyricsSource}
        </label>
        <div className="flex rounded-lg overflow-hidden border border-slate-600 max-w-md">
          {LYRICS_SOURCE_ORDER.map((value) => {
            const label =
              value === 'paste'
                ? t.sourcePaste
                : value === 'pptx'
                  ? t.sourcePptx
                  : value === 'image'
                    ? t.sourceImage
                    : t.sourceYoutube;
            return (
              <button
                key={value}
                onClick={() => handleSourceChange(value)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  lyricsSource === value
                    ? 'bg-gold-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {showFileInput && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <input
              ref={lyricsFileInputRef}
              type="file"
              accept={fileAccept}
              onChange={(e) => setLyricsFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              onClick={() => lyricsFileInputRef.current?.click()}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {lyricsFile
                ? t.changeFile
                : lyricsSource === 'pptx'
                  ? t.choosePptx
                  : t.chooseImage}
            </button>
            {lyricsFile && (
              <span className="text-sm text-slate-300 truncate max-w-xs">
                {lyricsFile.name} ({(lyricsFile.size / 1024).toFixed(0)} KB)
              </span>
            )}
            <button
              onClick={handleExtract}
              disabled={!lyricsFile || extracting}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {extracting ? t.extracting : t.extractLyrics}
            </button>
          </div>
        )}

        {showYoutubeInput && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 min-w-[280px] bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <button
              onClick={handleExtract}
              disabled={!youtubeUrl.trim() || extracting}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {extracting ? t.extracting : t.extractLyrics}
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          {t.lyricsLabel}
          {lyricsSource !== 'paste' && ` ${t.lyricsLabelExtractNote}`}
        </label>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder={
            lyricsSource === 'paste'
              ? t.lyricsPlaceholderPaste
              : t.lyricsPlaceholderExtracted
          }
          rows={12}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent font-mono text-sm leading-relaxed resize-y"
        />
      </div>

      {extractedBgs.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={usePptBackgrounds}
              onChange={(e) => setUsePptBackgrounds(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-gold-600 focus:ring-gold-500"
            />
            <span className="text-sm font-medium text-slate-300">
              {t.usePptBackgrounds(extractedBgs.length)}
            </span>
          </label>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {extractedBgs.map((bg) => (
              <div
                key={bg.filename}
                className={`aspect-video rounded overflow-hidden border ${
                  usePptBackgrounds ? 'border-gold-500' : 'border-slate-600 opacity-60'
                }`}
              >
                <img src={bg.url} alt={bg.filename} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">{t.pptBgsNote}</p>
        </div>
      )}

      {!(usePptBackgrounds && extractedBgs.length > 0) && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-3">{t.backgrounds}</h3>
          <BackgroundPicker
            selectedIds={selectedBgIds}
            onSelect={setSelectedBgIds}
          />
        </div>
      )}

      <FreeBackgroundResources />

      <div className="flex items-center gap-4 flex-wrap">
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={karaokeMode}
            onChange={(e) => setKaraokeMode(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-sm text-slate-300">
            {t.karaoke}
            <span className="text-xs text-slate-500 ml-1.5">{t.karaokeHint}</span>
          </span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showPageNumbers}
            onChange={(e) => setShowPageNumbers(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-gold-600 focus:ring-gold-500"
          />
          <span className="text-xs text-slate-400">{t.pageNumber}</span>
        </label>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium text-slate-300">乐谱（可选）</h3>
            <p className="text-xs text-slate-500">上传五线谱图片或 PDF，每张 slide 会自动显示对应片段</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={sheetInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={(e) => handleSheetFileChange(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              onClick={() => sheetInputRef.current?.click()}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {sheetFile ? '换一张乐谱' : '选择乐谱'}
            </button>
            {sheetFile && (
              <>
                <span className="text-sm text-slate-300 truncate max-w-[200px]">
                  {sheetFile.name}
                </span>
                <button
                  onClick={() => handleSheetFileChange(null)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  清除
                </button>
              </>
            )}
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              {([
                { value: 'rebuild',  label: '扒谱',      hint: 'homr → Verovio 干净排版' },
                { value: 'crop',     label: '截图',      hint: '用 oemer 定位，切原图像素' },
                { value: 'crop_llm', label: '截图 (AI)', hint: '用当前 vision LLM 定位' },
              ] as { value: SheetMode; label: string; hint: string }[]).map((opt) => (
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
        </div>
        {sheetAnalyzing && (
          <p className="text-xs text-sky-300">正在识别乐谱…（首次运行会下载模型，约 2-3 分钟）</p>
        )}
        {!sheetAnalyzing && sheetCrops.length > 0 && (
          <p className="text-xs text-emerald-300">✓ 已识别 {sheetCrops.length} 段乐谱</p>
        )}
      </div>

      <button
        onClick={handleAnalyze}
        disabled={previewLoading || !audioFile || !lyrics.trim()}
        className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
      >
        {previewLoading
          ? t.analyzing
          : hasFreshPreview
            ? t.analyzedHint(previewSlides.length)
            : t.analyzeAudio}
      </button>
      <p className="text-xs text-slate-500 -mt-4">{t.analyzeDescription}</p>

      {previewSlides.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">
              {t.analyzedSlidesHeading(previewSlides.length)}
              {occurrences.length > 0 && (
                <span className="text-xs text-slate-500 ml-2">
                  {t.stanzaOccurrences(occurrences.length)}
                </span>
              )}
            </h3>
            {isPreviewStale && (
              <span className="text-xs text-amber-400">{t.inputsChangedWarning}</span>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {previewSlides.map((slide, i) => {
              const pt = primaryFontSize ?? (language.startsWith('zh') ? 40 : 36);
              const cqi = (pt / 540) * (9 / 16) * 100;
              const lh = lineSpacing ?? (language.startsWith('zh') ? 1.5 : 1.3);
              const bg = previewBackgroundForSlide(i);
              return (
                <div
                  key={i}
                  className="@container bg-slate-900 rounded-lg border border-slate-700 aspect-video relative overflow-hidden"
                >
                  {bg?.isVideo ? (
                    <video
                      src={bg.url}
                      className="absolute inset-0 w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      autoPlay
                      preload="metadata"
                    />
                  ) : bg ? (
                    <img
                      src={bg.url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : null}
                  <div className="absolute inset-[6.67%] bg-black/40" />
                  <div className="absolute top-1 left-1 right-1 flex items-center justify-between text-[10px] text-slate-300 z-10 pointer-events-none">
                    <span className="px-1 rounded bg-black/50">
                      {showPageNumbers ? `${i + 1} / ${previewSlides.length}` : `#${i + 1}`}
                    </span>
                    <span className="px-1 rounded bg-black/50">
                      {slide.start_sec.toFixed(1)}–{slide.end_sec.toFixed(1)}s
                    </span>
                    {slide.stanza_idx >= 0 && (
                      <span className="px-1.5 rounded bg-black/50">
                        {t.stanzaTag(slide.stanza_idx)}
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-[6.67%] flex flex-col items-center justify-center gap-[4%]">
                    {sheetCrops[i] && (
                      <img
                        src={sheetCrops[i].url}
                        alt=""
                        className="max-h-[45%] max-w-full object-contain bg-white/95 rounded"
                      />
                    )}
                    <p
                      className="relative text-white text-center whitespace-pre-line font-bold drop-shadow-lg"
                      style={{
                        fontSize: `${cqi}cqi`,
                        lineHeight: lh,
                      }}
                    >
                      {slide.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={
          submitting ||
          !!isRunning ||
          !hasFreshPreview
        }
        className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors"
      >
        {submitting
          ? t.starting
          : isRunning
            ? t.generating
            : hasFreshPreview
              ? t.generateVideo
              : t.analyzeToEnable}
      </button>

      <p className="text-xs text-slate-500 -mt-4">{t.firstRunHint}</p>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {isRunning && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-300">{job?.stage}</span>
            <span className="text-sm text-slate-400">{job?.progress}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gold-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${job?.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      {isDone && job?.video_filename && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-4">
          <h3 className="text-sm font-medium text-slate-300">{t.videoReady}</h3>
          <video
            key={editedVideoFilename || job.video_filename}
            controls
            preload="metadata"
            className="w-full rounded-lg bg-black"
            src={`${getVideoDownloadUrl(editedVideoFilename || job.video_filename)}#t=0.1`}
          />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => downloadFile(editedVideoFilename || job.video_filename!)}
              className="bg-gold-600 hover:bg-gold-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {t.downloadMp4}
            </button>
            {job.srt_filename && (
              <button
                onClick={() => downloadFile(job.srt_filename!)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {t.downloadSrt}
              </button>
            )}
            <button
              onClick={() => setEditMode((v) => !v)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {editMode ? t.closeEditor : t.editVideo}
            </button>
            <button
              onClick={handleReset}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {t.newVideo}
            </button>
          </div>
        </div>
      )}

      {isDone && editMode && analysisId && (
        <VideoEditor
          analysisId={analysisId}
          title={title}
          composer={composer}
          allBackgrounds={allBackgrounds}
          initialBackgroundPool={currentBackgroundPool}
          karaokeMode={karaokeMode}
          primaryFontSize={primaryFontSize ?? undefined}
          secondaryFontSize={secondaryFontSize ?? undefined}
          lineSpacingMultiplier={lineSpacing ?? undefined}
          showPageNumbers={showPageNumbers}
          paddingStyle={template.paddingStyle}
          selectedBgIds={selectedBgIds}
          extractedBgFilenames={
            usePptBackgrounds && extractedBgs.length > 0
              ? extractedBgs.map((b) => b.filename)
              : undefined
          }
          onRerendered={setEditedVideoFilename}
          onClose={() => setEditMode(false)}
        />
      )}
    </div>
  );
}
