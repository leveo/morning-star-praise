import axios from 'axios';
import type { BackgroundInfo, LyricsParseResponse, PPTGenerateResponse, SlideData } from '../types';
import { currentLLMSettings, resolveLLMHeaders } from '../hooks/useLLMSettings';

const api = axios.create({
  baseURL: '/api',
});

// Attach X-LLM-* headers from localStorage settings on every request. API
// keys never travel over these headers — the backend reads keys from .env.
api.interceptors.request.use((config) => {
  const headers = resolveLLMHeaders(currentLLMSettings());
  for (const [k, v] of Object.entries(headers)) {
    config.headers.set(k, v);
  }
  return config;
});

export async function parseLyrics(
  text: string,
  language: string = 'en',
  maxLinesPerSlide: number = 6,
  maxSlides: number = 0,
  maxWidthPerRow: number = 12
): Promise<LyricsParseResponse> {
  const { data } = await api.post<LyricsParseResponse>('/lyrics/parse', {
    text,
    language,
    max_lines_per_slide: maxLinesPerSlide,
    max_slides: maxSlides,
    max_width_per_row: maxWidthPerRow,
  });
  return data;
}

export async function parseLyricsBilingual(
  primaryText: string,
  secondaryText: string,
  mode: 'interleaved' | 'stacked' = 'interleaved',
  maxLinesPerSlide: number = 6,
  maxSlides: number = 0,
  maxWidthPerRow: number = 12
): Promise<LyricsParseResponse> {
  const { data } = await api.post<LyricsParseResponse>('/lyrics/parse-bilingual', {
    primary_text: primaryText,
    secondary_text: secondaryText,
    mode,
    max_lines_per_slide: maxLinesPerSlide,
    max_slides: maxSlides,
    max_width_per_row: maxWidthPerRow,
  });
  return data;
}

export async function generatePPT(
  title: string,
  slides: SlideData[],
  language: string = 'en',
  backgroundIds?: number[],
  composer: string = '',
  showPageNumbers: boolean = false,
  primaryFontSize?: number,
  secondaryFontSize?: number,
  lineSpacingMultiplier?: number,
  paddingStyle: 'dark' | 'light' = 'dark',
  sheet?: { sessionId: string; cropNames: string[] },
): Promise<PPTGenerateResponse> {
  const { data } = await api.post<PPTGenerateResponse>('/ppt/generate', {
    title,
    composer,
    slides,
    language,
    background_ids: backgroundIds,
    show_page_numbers: showPageNumbers,
    primary_font_size: primaryFontSize,
    secondary_font_size: secondaryFontSize,
    line_spacing_multiplier: lineSpacingMultiplier,
    padding_style: paddingStyle,
    sheet_session_id: sheet?.sessionId,
    sheet_crop_names: sheet?.cropNames,
  });
  return data;
}

// --- Sheet music (OMR) --------------------------------------------------

export interface SheetCrop {
  chunk_idx: number;
  filename: string;
  url: string;
  page: number;
  region: { y_top: number; y_bottom: number; x_left: number; x_right: number };
}

export interface SheetAnalyzeResponse {
  session_id: string;
  pages: number;
  /** Distinct visual staff systems on the sheet (before cycling into chunks). */
  system_count: number;
  /** Number of chunk-sized crop PNGs returned (== num_chunks requested). */
  detected_staffs: number;
  crops: SheetCrop[];
}

export async function uploadSheet(file: File): Promise<{ session_id: string; filename: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/sheet/upload', form, {
    // OMR model download (first run) + PDF rasterize can take a while.
    timeout: 120_000,
  });
  return data;
}

export type SheetMode = 'rebuild' | 'crop' | 'crop_llm';

export async function analyzeSheet(
  sessionId: string,
  numChunks: number,
  mode: SheetMode = 'rebuild',
): Promise<SheetAnalyzeResponse> {
  const form = new FormData();
  form.append('session_id', sessionId);
  form.append('num_chunks', String(numChunks));
  form.append('mode', mode);
  const { data } = await api.post<SheetAnalyzeResponse>('/sheet/analyze', form, {
    timeout: 600_000,
  });
  return data;
}

export async function deleteSheet(sessionId: string): Promise<void> {
  await api.delete(`/sheet/${sessionId}`);
}

// Module-level cache so concurrent mounts (WorshipVideoPage + BackgroundPicker
// + SlideDeck) share a single GET /backgrounds instead of racing 3 requests.
let _backgroundsPromise: Promise<BackgroundInfo[]> | null = null;

export function getBackgrounds(): Promise<BackgroundInfo[]> {
  if (_backgroundsPromise) return _backgroundsPromise;
  _backgroundsPromise = api
    .get<BackgroundInfo[]>('/backgrounds')
    .then((res) => res.data)
    .catch((err) => {
      _backgroundsPromise = null;
      throw err;
    });
  return _backgroundsPromise;
}

export function invalidateBackgroundsCache(): void {
  _backgroundsPromise = null;
}

export function getDownloadUrl(filename: string): string {
  return `/api/ppt/download/${filename}`;
}

// YouTube APIs
export interface YouTubeLyricsResponse {
  title: string;
  lyrics: string;
  language: string;
  subtitle_type: string;
}

export interface FrameInfo {
  image_url: string;
  background_url: string;
  timestamp: number;
  text: string;
  font_size: number;
}

export interface YouTubeFramesResponse {
  title: string;
  frames: FrameInfo[];
  work_dir: string;
}

export async function extractYouTubeLyrics(
  url: string,
  languages?: string[]
): Promise<YouTubeLyricsResponse> {
  const { data } = await api.post<YouTubeLyricsResponse>('/youtube/extract-lyrics', {
    url,
    languages,
  });
  return data;
}

export async function extractYouTubeFrames(
  url: string,
  intervalSeconds: number = 2.0,
  similarityThreshold: number = 0.95,
  sessionId: string = ''
): Promise<YouTubeFramesResponse> {
  const { data } = await api.post<YouTubeFramesResponse>('/youtube/extract-frames', {
    url,
    interval_seconds: intervalSeconds,
    similarity_threshold: similarityThreshold,
    session_id: sessionId,
  });
  return data;
}

// Songs API
export async function saveSong(
  title: string,
  lyrics: string,
  language: string,
  source?: string,
  sourceUrl?: string
): Promise<{ id: number }> {
  const { data } = await api.post('/songs', {
    title,
    lyrics,
    language,
    source,
    source_url: sourceUrl,
  });
  return data;
}

// Usage tracking
export async function createUsageSession(): Promise<string> {
  const { data } = await api.post<{ session_id: string }>('/usage/session');
  return data.session_id;
}

export interface UsageSummary {
  session_id: string;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_images: number;
  total_cost_usd: number;
  calls: { action: string; input_tokens: number; output_tokens: number; images: number; cost_usd: number }[];
}

export async function getUsage(sessionId: string): Promise<UsageSummary> {
  const { data } = await api.get<UsageSummary>(`/usage/${sessionId}`);
  return data;
}

// Translation — Gemini can take ~10-30s on long prompts, but must not hang forever
export async function translateLyrics(
  text: string,
  target: 'en' | 'zh-hans' | 'zh-hant' = 'en',
  title: string = '',
  composer: string = '',
  sessionId: string = ''
): Promise<string> {
  const { data } = await api.post<{ text: string }>(
    '/lyrics/translate',
    { text, target, title, composer, session_id: sessionId },
    { timeout: 90_000 }
  );
  return data.text;
}

// Chinese conversion
export async function convertChinese(
  text: string,
  target: 'simplified' | 'traditional'
): Promise<string> {
  const { data } = await api.post<{ text: string }>('/lyrics/convert', {
    text,
    target,
  });
  return data.text;
}

// Worship Video Maker
export interface VideoJobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  stage: string;
  progress: number;
  video_filename?: string | null;
  srt_filename?: string | null;
  error?: string | null;
}

/** Return the previous status object when every displayed field is
 *  unchanged, so React bails out of the re-render instead of cascading
 *  updates on every poll tick. */
export function mergeVideoJobStatus(
  prev: VideoJobStatus | null,
  latest: VideoJobStatus,
): VideoJobStatus {
  if (
    prev &&
    prev.status === latest.status &&
    prev.progress === latest.progress &&
    prev.stage === latest.stage &&
    prev.video_filename === latest.video_filename &&
    prev.error === latest.error
  ) {
    return prev;
  }
  return latest;
}

export interface ExtractedBackground {
  filename: string;
  url: string;
}

export interface ExtractLyricsResponse {
  lyrics: string;
  language: string;
  backgrounds: ExtractedBackground[];
  slides: number;
  title?: string;
  composer?: string;
}

export async function extractLyricsFromFile(
  file: File
): Promise<ExtractLyricsResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<ExtractLyricsResponse>(
    '/videos/extract-lyrics',
    formData
  );
  return data;
}

export interface AnalyzedSlide {
  text: string;
  start_sec: number;
  end_sec: number;
  stanza_idx: number;
}

export interface AnalyzedStanzaOccurrence {
  stanza_idx: number;
  start_sec: number;
  end_sec: number;
  score: number;
}

export interface AnalyzeAudioResponse {
  analysis_id: string;
  slides: AnalyzedSlide[];
  stanzas: string[];
  occurrences: AnalyzedStanzaOccurrence[];
  audio_duration_sec: number;
  intro_end_sec: number;
}

export interface WorshipPlanResponse {
  analysis_id: string;
  audio_filename: string;
  audio_url: string;
  plan: {
    audio_duration: number;
    intro_end: number;
    language: string;
    stanzas: string[];
    occurrences: { stanza_idx: number; start_sec: number; end_sec: number; score: number }[];
    lyric_chunks: string[];
    chunk_stanza_idx: number[];
    timed: {
      text: string;
      start: number;
      end: number;
      units?: { text: string; startSec: number | null; isLineBreak: boolean }[];
    }[];
  };
}

export async function getWorshipPlan(
  analysisId: string,
): Promise<WorshipPlanResponse> {
  const { data } = await api.get<WorshipPlanResponse>(
    `/videos/analyses/${analysisId}/plan`,
  );
  return data;
}

export interface RerenderRequest {
  analysisId: string;
  title: string;
  composer: string;
  backgroundIds?: number[];
  extractedBackgroundPaths?: string[];
  karaokeMode?: boolean;
  primaryFontSize?: number;
  secondaryFontSize?: number;
  lineSpacingMultiplier?: number;
  showPageNumbers?: boolean;
  paddingStyle?: 'dark' | 'light';
  timingOverrides?: { idx: number; start_sec: number; end_sec: number }[];
  backgroundOverrides?: { idx: number; background_id?: number }[];
  inputSnapshot?: Record<string, unknown>;
}

export async function rerenderWorshipVideo(
  req: RerenderRequest,
): Promise<VideoJobStatus> {
  const { data } = await api.post<VideoJobStatus>('/videos/rerender', {
    analysis_id: req.analysisId,
    title: req.title,
    composer: req.composer,
    background_ids: req.backgroundIds,
    extracted_background_paths: req.extractedBackgroundPaths,
    karaoke_mode: req.karaokeMode ?? false,
    primary_font_size: req.primaryFontSize,
    secondary_font_size: req.secondaryFontSize,
    line_spacing_multiplier: req.lineSpacingMultiplier,
    show_page_numbers: req.showPageNumbers ?? false,
    padding_style: req.paddingStyle ?? 'dark',
    timing_overrides: req.timingOverrides ?? [],
    background_overrides: req.backgroundOverrides ?? [],
    input_snapshot: req.inputSnapshot,
  });
  return data;
}

export async function analyzeWorshipAudio(
  audio: File,
  lyricsText: string,
  language: string,
  maxLinesPerSlide: number = 6,
  maxWidthPerRow: number = 12
): Promise<AnalyzeAudioResponse> {
  const formData = new FormData();
  formData.append('audio', audio);
  formData.append('lyrics_text', lyricsText);
  formData.append('language', language);
  formData.append('max_lines_per_slide', String(maxLinesPerSlide));
  formData.append('max_width_per_row', String(maxWidthPerRow));
  // Whisper transcription can take a while on long songs — give it headroom.
  const { data } = await api.post<AnalyzeAudioResponse>(
    '/videos/analyze',
    formData,
    { timeout: 600_000 }
  );
  return data;
}

export async function createWorshipVideo(
  analysisId: string,
  title: string,
  composer: string,
  backgroundIds?: number[],
  extractedBackgroundPaths?: string[],
  karaokeMode: boolean = false,
  primaryFontSize?: number,
  secondaryFontSize?: number,
  lineSpacingMultiplier?: number,
  showPageNumbers: boolean = false,
  inputSnapshot?: Record<string, unknown>,
  paddingStyle: 'dark' | 'light' = 'dark',
  sheet?: { sessionId: string; cropFilenames: string[] },
): Promise<VideoJobStatus> {
  const formData = new FormData();
  formData.append('analysis_id', analysisId);
  formData.append('title', title);
  formData.append('composer', composer);
  if (backgroundIds && backgroundIds.length > 0) {
    formData.append('background_ids', backgroundIds.join(','));
  }
  if (extractedBackgroundPaths && extractedBackgroundPaths.length > 0) {
    formData.append(
      'extracted_background_paths',
      extractedBackgroundPaths.join(',')
    );
  }
  if (karaokeMode) {
    formData.append('karaoke_mode', 'true');
  }
  if (primaryFontSize != null) {
    formData.append('primary_font_size', String(primaryFontSize));
  }
  if (secondaryFontSize != null) {
    formData.append('secondary_font_size', String(secondaryFontSize));
  }
  if (lineSpacingMultiplier != null) {
    formData.append('line_spacing_multiplier', String(lineSpacingMultiplier));
  }
  if (showPageNumbers) {
    formData.append('show_page_numbers', 'true');
  }
  formData.append('padding_style', paddingStyle);
  if (inputSnapshot) {
    formData.append('input_snapshot', JSON.stringify(inputSnapshot));
  }
  if (sheet && sheet.cropFilenames.length > 0) {
    formData.append('sheet_session_id', sheet.sessionId);
    formData.append('sheet_crop_filenames', sheet.cropFilenames.join(','));
  }
  const { data } = await api.post<VideoJobStatus>('/videos/create', formData);
  return data;
}

export async function getVideoJob(jobId: string): Promise<VideoJobStatus> {
  const { data } = await api.get<VideoJobStatus>(`/videos/job/${jobId}`);
  return data;
}

export function getVideoDownloadUrl(filename: string): string {
  return `/api/videos/download/${filename}`;
}

// --- Songs Library / history ----------------------------------------------

export type LibraryItemType = 'ppt' | 'video';
export type LibrarySourcePage = 'lyrics' | 'youtube' | 'ocr' | 'worship-video';

export interface LibraryItem {
  id: number;
  item_type: LibraryItemType;
  source_page: LibrarySourcePage;
  title: string;
  language: string | null;
  filename: string | null;
  analysis_id: string | null;
  input_snapshot: Record<string, unknown>;
  created_at: string | null;
}

export interface LibraryItemDetail extends LibraryItem {
  file_exists: boolean;
  analysis_exists: boolean;
}

export async function listLibrary(
  search: string = '',
  itemType: LibraryItemType | '' = '',
): Promise<LibraryItem[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (itemType) params.set('item_type', itemType);
  const { data } = await api.get<LibraryItem[]>(`/library?${params}`);
  return data;
}

export async function getLibraryItem(id: number): Promise<LibraryItemDetail> {
  const { data } = await api.get<LibraryItemDetail>(`/library/${id}`);
  return data;
}

export async function deleteLibraryItem(id: number): Promise<void> {
  await api.delete(`/library/${id}`);
}

// --- LLM settings / status ------------------------------------------------

export interface LLMProviderInfo {
  key: string;
  label: string;
  env_var: string | null;
  get_key_url: string;
  supports_text: boolean;
  supports_vision: boolean;
  configured: boolean;
  default_text_model: string;
  default_vision_model: string;
}

export interface LLMStatusResponse {
  active: { text_provider: string; vision_provider: string };
  env_defaults: { text_provider: string; vision_provider: string };
  providers: LLMProviderInfo[];
}

export async function getLLMStatus(): Promise<LLMStatusResponse> {
  const { data } = await api.get<LLMStatusResponse>('/llm/status');
  return data;
}

export interface OllamaModels {
  available: boolean;
  error?: string;
  text: string[];
  vision: string[];
}

export async function getOllamaModels(): Promise<OllamaModels> {
  const { data } = await api.get<OllamaModels>('/llm/ollama-models');
  return data;
}
