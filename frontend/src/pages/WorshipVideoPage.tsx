// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useEffect, useMemo, useRef, useState } from 'react';
import BackgroundPicker, { LazyVideoTile } from '../components/ppt/BackgroundPicker';
import FontSettings from '../components/ppt/FontSettings';
import VideoEditor from '../components/worship/VideoEditor';
import FreeBackgroundResources from '../components/worship/FreeBackgroundResources';
import ClearCurrentButton from '../components/shared/ClearCurrentButton';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { usePersistedState } from '../hooks/usePersistedState';
import { usePersistedFile } from '../hooks/usePersistedFile';
import { useResumeSnapshot } from '../hooks/useResumeSnapshot';
import { useTemplateDefaults } from '../hooks/useTemplateDefaults';
import {
  analyzeSheet,
  analyzeWorshipAudio,
  deleteWorshipAnalysis,
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
import {
  consumeVideoHandoff,
  readWordLyricsDraft,
  wordLyricsDraftSignature,
} from '../utils/wordLyricsHandoff';

type LyricsSource = 'paste' | 'pptx' | 'image' | 'youtube';
type ApiError = {
  code?: string;
  response?: { data?: { detail?: string } };
};

const LYRICS_SOURCE_ORDER: LyricsSource[] = ['paste', 'pptx', 'image', 'youtube'];

const PPTX_ACCEPT =
  '.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint';
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf';

export default function WorshipVideoPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].worshipVideo;
  const titleLabels = uiLanguage === 'zh'
    ? {
        titleZh: '中文歌名',
        titleEn: '英文歌名',
        collectionZh: '中文诗集与编号',
        collectionEn: '英文诗集名',
      }
    : {
        titleZh: 'Chinese title',
        titleEn: 'English title',
        collectionZh: 'Chinese collection and number',
        collectionEn: 'English collection',
      };
  const [audioFile, setAudioFile] = usePersistedFile('worshipVideo.audioFile');
  const [lyricsFile, setLyricsFile] = usePersistedFile('worshipVideo.lyricsFile');
  const [extractedBgs, setExtractedBgs] = usePersistedState<ExtractedBackground[]>(
    'worshipVideo.extractedBgs',
    [],
  );
  const [job, setJob] = usePersistedState<VideoJobStatus | null>('worshipVideo.job', null);
  const [error, setError] = useState('');
  const [extracting, setExtracting] = useState(false);

  const [title, setTitle] = usePersistedState('worshipVideo.title', '');
  const [titleEn, setTitleEn] = usePersistedState('worshipVideo.titleEn', '');
  const [collectionZh, setCollectionZh] = usePersistedState('worshipVideo.collectionZh', '');
  const [collectionEn, setCollectionEn] = usePersistedState('worshipVideo.collectionEn', '');
  const [wordDraftSignature, setWordDraftSignature] = usePersistedState(
    'worshipVideo.wordDraftSignature',
    '',
  );
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
  const [backgroundMotion, setBackgroundMotion] = usePersistedState(
    'worshipVideo.backgroundMotion',
    false,
  );
  const [lyricLeadSeconds, setLyricLeadSeconds] = usePersistedState(
    'worshipVideo.lyricLeadSeconds',
    0.5,
  );
  const [showEndSlide, setShowEndSlide] = usePersistedState(
    'worshipVideo.showEndSlide',
    false,
  );
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
  const [chineseLineSpacing, setChineseLineSpacing] = usePersistedState<number | null>(
    'worshipVideo.lineSpacing',
    template.lineSpacing,
  );
  const [englishLineSpacing, setEnglishLineSpacing] = usePersistedState<number | null>(
    'worshipVideo.englishLineSpacing',
    (() => {
      if (typeof window === 'undefined') return template.lineSpacing;
      try {
        const legacy = window.sessionStorage.getItem('worshipVideo.lineSpacing');
        return legacy == null ? template.lineSpacing : JSON.parse(legacy);
      } catch {
        return template.lineSpacing;
      }
    })(),
  );

  // Analysis state — regenerated whenever the inputs that affect slide
  // order / chunking change, so we never let the user generate a video
  // off a stale analysis. ``analyzedKey`` snapshots the input fingerprint
  // the current ``analysisId`` was computed from.
  const [analysisId, setAnalysisId] = usePersistedState('worshipVideo.analysisId', '');
  const [analyzedKey, setAnalyzedKey] = usePersistedState('worshipVideo.analyzedKey', '');
  const [previewSlides, setPreviewSlides] = usePersistedState<AnalyzedSlide[]>(
    'worshipVideo.previewSlides',
    [],
  );
  const [occurrences, setOccurrences] = usePersistedState<AnalyzedStanzaOccurrence[]>(
    'worshipVideo.occurrences',
    [],
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [allBackgrounds, setAllBackgrounds] = useState<BackgroundInfo[]>([]);
  const [editMode, setEditMode] = usePersistedState('worshipVideo.editMode', false);
  const [backgroundsExpanded, setBackgroundsExpanded] = usePersistedState(
    'worshipVideo.backgroundsExpanded',
    true,
  );

  // Optional sheet-music overlay: user uploads a score PNG/PDF, we run OMR and
  // the renderer shows the matching snippet on each slide. Both modes share
  // the same upload — switching only re-runs analyze against the cached file.
  const [sheetFile, setSheetFile] = usePersistedFile('worshipVideo.sheetFile');
  const [sheetSession, setSheetSession] = usePersistedState<string | null>(
    'worshipVideo.sheetSession',
    null,
  );
  const [sheetCrops, setSheetCrops] = usePersistedState<SheetCrop[]>(
    'worshipVideo.sheetCrops',
    [],
  );
  const [sheetAnalyzing, setSheetAnalyzing] = useState(false);
  const [sheetMode, setSheetMode] = usePersistedState<SheetMode>('worshipVideo.sheetMode', 'rebuild');
  const sheetInputRef = useRef<HTMLInputElement>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBackgrounds().then(setAllBackgrounds).catch(() => {});
  }, []);

  useEffect(() => {
    if (!job || !['pending', 'processing'].includes(job.status)) return;
    const poll = window.setInterval(() => {
      void getVideoJob(job.job_id)
        .then((latest) => setJob((current) => mergeVideoJobStatus(current, latest)))
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(poll);
  }, [job, setJob]);

  useResumeSnapshot<Partial<{
    title: string;
    titleEn: string;
    collectionZh: string;
    collectionEn: string;
    composer: string;
    language: string;
    lyrics: string;
    selectedBgIds: number[];
    lyricsSource: LyricsSource;
    youtubeUrl: string;
    usePptBackgrounds: boolean;
    karaokeMode: boolean;
    backgroundMotion: boolean;
    lyricLeadSeconds: number;
    showEndSlide: boolean;
    showPageNumbers: boolean;
    maxLines: number;
    maxWidth: number;
    primaryFontSize: number | null;
    secondaryFontSize: number | null;
    lineSpacing: number | null;
    chineseLineSpacing: number | null;
    englishLineSpacing: number | null;
  }>>('worship-video', (payload) => {
    const s = payload.snapshot;
    if (s.title != null) setTitle(s.title);
    if (s.titleEn != null) setTitleEn(s.titleEn);
    if (s.collectionZh != null) setCollectionZh(s.collectionZh);
    if (s.collectionEn != null) setCollectionEn(s.collectionEn);
    if (s.composer != null) setComposer(s.composer);
    if (s.language != null) setLanguage(s.language);
    if (s.lyrics != null) setLyrics(s.lyrics);
    if (s.selectedBgIds != null) setSelectedBgIds(s.selectedBgIds);
    if (s.lyricsSource != null) setLyricsSource(s.lyricsSource);
    if (s.youtubeUrl != null) setYoutubeUrl(s.youtubeUrl);
    if (s.usePptBackgrounds != null) setUsePptBackgrounds(s.usePptBackgrounds);
    if (s.karaokeMode != null) setKaraokeMode(s.karaokeMode);
    if (s.backgroundMotion != null) setBackgroundMotion(s.backgroundMotion);
    if (s.lyricLeadSeconds != null) setLyricLeadSeconds(s.lyricLeadSeconds);
    if (s.showEndSlide != null) setShowEndSlide(s.showEndSlide);
    if (s.showPageNumbers != null) setShowPageNumbers(s.showPageNumbers);
    if (s.maxLines != null) setMaxLines(s.maxLines);
    if (s.maxWidth != null) setMaxWidth(s.maxWidth);
    if (s.primaryFontSize != null) setPrimaryFontSize(s.primaryFontSize);
    if (s.secondaryFontSize != null) setSecondaryFontSize(s.secondaryFontSize);
    const legacyLineSpacing = s.lineSpacing ?? null;
    if (s.chineseLineSpacing != null || legacyLineSpacing != null) {
      setChineseLineSpacing(s.chineseLineSpacing ?? legacyLineSpacing);
    }
    if (s.englishLineSpacing != null || legacyLineSpacing != null) {
      setEnglishLineSpacing(s.englishLineSpacing ?? legacyLineSpacing);
    }
    // If the analysis cache is still on disk, pre-seed analysisId so
    // "Edit video" works without re-analyzing. Filename from the prior
    // render lets the user see the completed state immediately.
    if (payload.analysis_exists && payload.analysis_id) {
      setAnalysisId(payload.analysis_id);
    }
    if (payload.filename) {
      setJob({
        job_id: 'restored',
        status: 'done',
        stage: 'Complete',
        progress: 100,
        video_filename: payload.filename,
      });
    }
  });

  useEffect(() => {
    const payload = consumeVideoHandoff();
    if (payload) {
      setTitle(payload.title);
      setTitleEn(payload.titleEn ?? '');
      setCollectionZh(payload.collectionZh ?? '');
      setCollectionEn(payload.collectionEn ?? '');
      setComposer('');
      setLanguage('auto');
      setLyrics(payload.combinedLyrics);
      setLyricsSource('paste');
      setYoutubeUrl('');
      setUsePptBackgrounds(false);
      setLyricsFile(null);
      setExtractedBgs([]);
      setJob(null);
      setAnalysisId('');
      setAnalyzedKey('');
      setPreviewSlides([]);
      setOccurrences([]);
      setEditMode(false);
      setError('');
      const shared = readWordLyricsDraft();
      if (shared) setWordDraftSignature(wordLyricsDraftSignature(shared));
      return;
    }

    const shared = readWordLyricsDraft();
    if (!shared) return;
    const signature = wordLyricsDraftSignature(shared);
    if (signature === wordDraftSignature) return;
    if (!title.trim()) setTitle(shared.title);
    if (!titleEn.trim()) setTitleEn(shared.titleEn);
    if (!collectionZh.trim()) setCollectionZh(shared.collectionZh);
    if (!collectionEn.trim()) setCollectionEn(shared.collectionEn);
    if (!lyrics.trim()) setLyrics(shared.combinedLyrics);
    setWordDraftSignature(signature);
    // The handoff is one-time and must win over any resumable library payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    } catch (err: unknown) {
      const msg = (err as ApiError).response?.data?.detail || 'Extraction failed';
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
      setEditMode(true);
      setJob(null);
      if (sheetUpload?.session_id) {
        setSheetSession(sheetUpload.session_id);
        void runSheetAnalyzeForSlides(sheetUpload.session_id, result.slides.length, sheetMode);
      } else {
        setSheetCrops([]);
      }
    } catch (err: unknown) {
      const apiError = err as ApiError;
      const msg = apiError.response?.data?.detail
        || (apiError.code === 'ECONNABORTED'
          ? 'Audio analysis timed out after 30 minutes. The backend may still be finishing the result.'
          : 'Failed to analyze audio');
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

  const handleClearCurrentContent = () => {
    const shared = readWordLyricsDraft();
    setWordDraftSignature(shared ? wordLyricsDraftSignature(shared) : '');
    if (analysisId) {
      void deleteWorshipAnalysis(analysisId).catch(() => {});
    }
    if (sheetSession) {
      void deleteSheet(sheetSession).catch(() => {});
    }

    setTitle('');
    setTitleEn('');
    setCollectionZh('');
    setCollectionEn('');
    setComposer('');
    setLanguage('auto');
    setLyrics('');
    setSelectedBgIds([]);
    setLyricsSource('paste');
    setYoutubeUrl('');
    setUsePptBackgrounds(false);
    setAudioFile(null);
    setLyricsFile(null);
    setExtractedBgs([]);
    setAnalysisId('');
    setAnalyzedKey('');
    setPreviewSlides([]);
    setOccurrences([]);
    setJob(null);
    setError('');
    setEditMode(false);
    setSheetFile(null);
    setSheetSession(null);
    setSheetCrops([]);
    setBackgroundsExpanded(true);
    if (analysisId) {
      window.sessionStorage.removeItem(`worshipVideo.timingEdits.${analysisId}`);
      window.sessionStorage.removeItem(`worshipVideo.bgOverrides.${analysisId}`);
    }

    if (audioInputRef.current) audioInputRef.current.value = '';
    if (lyricsFileInputRef.current) lyricsFileInputRef.current.value = '';
    if (sheetInputRef.current) sheetInputRef.current.value = '';
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
      const byId = new Map(allBackgrounds.map((bg) => [bg.id, bg]));
      return selectedBgIds
        .map((id) => byId.get(id))
        .filter((bg): bg is BackgroundInfo => bg != null);
    }
    return allBackgrounds;
  }, [usePptBackgrounds, extractedBgs, selectedBgIds, allBackgrounds]);

  const selectedBackgrounds = useMemo(() => {
    const byId = new Map(allBackgrounds.map((bg) => [bg.id, bg]));
    return selectedBgIds
      .map((id) => byId.get(id))
      .filter((bg): bg is BackgroundInfo => bg != null);
  }, [allBackgrounds, selectedBgIds]);

  const moveSelectedBackground = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= selectedBgIds.length) return;
    const reordered = [...selectedBgIds];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSelectedBgIds(reordered);
  };

  const previewBackgroundForSlide = (
    slide: AnalyzedSlide,
  ): { url: string; isVideo: boolean } | null => {
    if (currentBackgroundPool.length === 0) return null;
    const bg = currentBackgroundPool[
      slide.background_group_idx % currentBackgroundPool.length
    ];
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 text-2xl font-bold text-white">{t.title}</h2>
          <p className="text-sm text-slate-400">{t.subtitle}</p>
        </div>
        <ClearCurrentButton
          onClick={handleClearCurrentContent}
          disabled={previewLoading || extracting || sheetAnalyzing || !!isRunning}
        />
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

      <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="mb-4 text-sm font-semibold text-slate-200">歌曲信息</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {titleLabels.titleZh}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.songTitlePlaceholder}
            className="h-11 w-full rounded-lg border border-slate-600 bg-slate-900/70 px-4 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {titleLabels.titleEn}
          </label>
          <input
            type="text"
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            placeholder="I Am Coming, Lord"
            className="h-11 w-full rounded-lg border border-slate-600 bg-slate-900/70 px-4 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {titleLabels.collectionZh}
          </label>
          <input
            type="text"
            value={collectionZh}
            onChange={(e) => setCollectionZh(e.target.value)}
            placeholder="教會聖詩 #450"
            className="h-11 w-full rounded-lg border border-slate-600 bg-slate-900/70 px-4 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {titleLabels.collectionEn}
          </label>
          <input
            type="text"
            value={collectionEn}
            onChange={(e) => setCollectionEn(e.target.value)}
            placeholder="Hymn's for God's People"
            className="h-11 w-full rounded-lg border border-slate-600 bg-slate-900/70 px-4 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t.composer}
          </label>
          <input
            type="text"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={t.composerPlaceholder}
            className="h-11 w-full rounded-lg border border-slate-600 bg-slate-900/70 px-4 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            {t.audioLanguageLabel}
          </label>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-11 w-full appearance-none rounded-lg border border-slate-600 bg-slate-900/70 px-4 pr-10 text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <option value="auto">{t.audioLanguageAuto}</option>
              <option value="zh">{t.audioLanguageZh}</option>
              <option value="en">{t.audioLanguageEn}</option>
            </select>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        </div>
      </section>

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

      <section className="rounded-xl border border-slate-700 bg-slate-800/40">
        <button
          type="button"
          onClick={() => setBackgroundsExpanded((value) => !value)}
          className="flex w-full items-center justify-between gap-4 rounded-xl px-4 py-4 text-left transition-colors hover:bg-slate-800/60"
          aria-expanded={backgroundsExpanded}
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-200">{t.backgrounds}</h3>
            <p className="mt-1 text-xs text-slate-500">
              每个 Verse + Chorus 使用同一背景，并按下方已选顺序轮换。
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
            {backgroundsExpanded ? '收起' : `展开 · 已选 ${selectedBackgrounds.length}`}
            <svg
              className={`h-4 w-4 transition-transform ${backgroundsExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        {backgroundsExpanded && (
          <div className="space-y-4 border-t border-slate-700 px-4 pb-4 pt-4">
            {extractedBgs.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-3">
                <label className="mb-3 flex cursor-pointer items-center gap-2">
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
                <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
                  {extractedBgs.map((bg) => (
                    <div
                      key={bg.filename}
                      className={`aspect-video overflow-hidden rounded border ${
                        usePptBackgrounds ? 'border-gold-500' : 'border-slate-600 opacity-60'
                      }`}
                    >
                      <img src={bg.url} alt={bg.filename} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">{t.pptBgsNote}</p>
              </div>
            )}

            {!(usePptBackgrounds && extractedBgs.length > 0) && (
              <>
                <BackgroundPicker
                  selectedIds={selectedBgIds}
                  onSelect={setSelectedBgIds}
                />

                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-medium text-slate-200">已选背景</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        使用左右箭头调整视频中的轮换顺序；未选择时使用整个背景库。
                      </p>
                    </div>
                    {selectedBackgrounds.length > 0 && (
                      <span className="shrink-0 rounded-full bg-gold-600/20 px-2 py-1 text-xs text-gold-300">
                        {selectedBackgrounds.length} 个
                      </span>
                    )}
                  </div>

                  {selectedBackgrounds.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center text-xs text-slate-500">
                      尚未选择背景
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {selectedBackgrounds.map((bg, index) => (
                        <div
                          key={bg.id}
                          className="w-48 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
                        >
                          <div className="relative aspect-video overflow-hidden bg-black">
                            {bg.media_type === 'video' ? (
                              <LazyVideoTile src={bg.url} />
                            ) : (
                              <img src={bg.url} alt={bg.name} className="h-full w-full object-cover" />
                            )}
                            <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              {index + 1}
                            </span>
                          </div>
                          <div className="p-2">
                            <p className="truncate text-xs text-slate-300">{bg.name}</p>
                            <div className="mt-2 grid grid-cols-3 gap-1">
                              <button
                                type="button"
                                onClick={() => moveSelectedBackground(index, -1)}
                                disabled={index === 0}
                                className="rounded bg-slate-800 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`将 ${bg.name} 向前移动`}
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSelectedBackground(index, 1)}
                                disabled={index === selectedBackgrounds.length - 1}
                                className="rounded bg-slate-800 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`将 ${bg.name} 向后移动`}
                              >
                                →
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedBgIds(selectedBgIds.filter((id) => id !== bg.id))}
                                className="rounded bg-red-950/70 py-1 text-xs text-red-300 hover:bg-red-900"
                                aria-label={`删除 ${bg.name}`}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <FreeBackgroundResources />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-200">歌词版式</h3>
          <p className="mt-1 text-xs text-slate-500">
            中英文歌词按行识别，可分别设置字号；自动会使用中文 40pt、英文 32pt。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">{t.maxLines}:</label>
          <select
            value={maxLines}
            onChange={(e) => setMaxLines(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white"
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
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
            {[6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <FontSettings
          primaryFontSize={primaryFontSize}
          setPrimaryFontSize={setPrimaryFontSize}
          secondaryFontSize={secondaryFontSize}
          setSecondaryFontSize={setSecondaryFontSize}
          lineSpacing={chineseLineSpacing}
          setLineSpacing={setChineseLineSpacing}
          secondaryLineSpacing={englishLineSpacing}
          setSecondaryLineSpacing={setEnglishLineSpacing}
          showSecondary
          primaryLabel="中文字号："
          secondaryLabel="英文字号："
          lineSpacingLabel="中文行距："
          secondaryLineSpacingLabel="英文行距："
        />
        <label className="flex items-center gap-2">
          <span className="text-xs text-slate-400">歌词提前</span>
          <input
            type="number"
            min="0"
            max="30"
            step="0.1"
            value={lyricLeadSeconds}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) {
                setLyricLeadSeconds(Math.max(0, Math.min(value, 30)));
              }
            }}
            className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-white"
          />
          <span className="text-xs text-slate-500">秒完整显示</span>
        </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-700 pt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={karaokeMode}
            onChange={(e) => setKaraokeMode(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-xs text-slate-400">
            {t.karaoke}
            <span className="ml-1.5 text-slate-500">{t.karaokeHint}</span>
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
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={backgroundMotion}
            onChange={(e) => setBackgroundMotion(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-gold-600 focus:ring-gold-500"
          />
          <span className="text-xs text-slate-400">静态背景轻微推拉</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showEndSlide}
            onChange={(e) => setShowEndSlide(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-gold-600 focus:ring-gold-500"
          />
          <span className="text-xs text-slate-400">
            添加尾页（标题内容，停留 3 秒）
          </span>
        </label>
        </div>
      </section>

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
                { value: 'rebuild',  label: '扒谱',      hint: 'homr → Verovio 干净排版，本地横线检测裁切' },
                { value: 'crop',     label: '截图',      hint: '用本地横线检测定位，保留原图谱线和歌词' },
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
              const chinesePt = primaryFontSize ?? 40;
              const englishPt = secondaryFontSize ?? 32;
              const chineseCqi = (chinesePt / 540) * (9 / 16) * 100;
              const englishCqi = (englishPt / 540) * (9 / 16) * 100;
              const bg = previewBackgroundForSlide(slide);
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
                    <div className="relative text-center font-bold text-white drop-shadow-lg">
                      {slide.text.split('\n').map((line, lineIndex) => (
                        <div
                          key={lineIndex}
                          style={{
                            fontSize: `${/[\u3400-\u9fff]/.test(line) ? chineseCqi : englishCqi}cqi`,
                            lineHeight: /[\u3400-\u9fff]/.test(line)
                              ? (chineseLineSpacing ?? 1.5)
                              : (englishLineSpacing ?? 1.3),
                          }}
                        >
                          {line || '\u00a0'}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setEditMode(true)}
        disabled={!!isRunning || !hasFreshPreview}
        className="w-full bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium text-lg transition-colors"
      >
        {isRunning
          ? t.generating
          : hasFreshPreview
            ? editMode
              ? '校准预览已打开'
              : '打开校准预览并生成视频'
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
            key={job.video_filename}
            controls
            preload="metadata"
            className="w-full rounded-lg bg-black"
            src={`${getVideoDownloadUrl(job.video_filename)}#t=0.1`}
          />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => downloadFile(job.video_filename!)}
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
              onClick={handleClearCurrentContent}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {t.newVideo}
            </button>
          </div>
        </div>
      )}

      {hasFreshPreview && editMode && analysisId && (
        <VideoEditor
          key={analysisId}
          analysisId={analysisId}
          title={title}
          titleEn={titleEn}
          collectionZh={collectionZh}
          collectionEn={collectionEn}
          composer={composer}
          onTitleChange={setTitle}
          onTitleEnChange={setTitleEn}
          onCollectionZhChange={setCollectionZh}
          onCollectionEnChange={setCollectionEn}
          onComposerChange={setComposer}
          allBackgrounds={allBackgrounds}
          initialBackgroundPool={currentBackgroundPool}
          karaokeMode={karaokeMode}
          primaryFontSize={primaryFontSize ?? undefined}
          secondaryFontSize={secondaryFontSize ?? undefined}
          primaryLineSpacingMultiplier={chineseLineSpacing ?? undefined}
          secondaryLineSpacingMultiplier={englishLineSpacing ?? undefined}
          showPageNumbers={showPageNumbers}
          backgroundMotion={backgroundMotion}
          lyricLeadSeconds={lyricLeadSeconds}
          showEndSlide={showEndSlide}
          paddingStyle={template.paddingStyle}
          selectedBgIds={selectedBgIds}
          extractedBgFilenames={
            usePptBackgrounds && extractedBgs.length > 0
              ? extractedBgs.map((b) => b.filename)
              : undefined
          }
          sheet={
            sheetSession && sheetCrops.length > 0
              ? {
                  sessionId: sheetSession,
                  cropFilenames: sheetCrops.map((crop) => crop.filename),
                  cropUrls: sheetCrops.map((crop) => crop.url),
                }
              : undefined
          }
          inputSnapshot={{
            title,
            titleEn,
            collectionZh,
            collectionEn,
            composer,
            language,
            lyrics,
            selectedBgIds,
            lyricsSource,
            youtubeUrl,
            usePptBackgrounds,
            karaokeMode,
            showPageNumbers,
            backgroundMotion,
            lyricLeadSeconds,
            showEndSlide,
            maxLines,
            maxWidth,
            primaryFontSize,
            secondaryFontSize,
            chineseLineSpacing,
            englishLineSpacing,
          }}
          onRendered={(latest) => {
            setJob(latest);
            if (latest.status === 'failed' && latest.error) {
              setError(latest.error);
            }
          }}
          onClose={() => setEditMode(false)}
        />
      )}
    </div>
  );
}
