import axios from 'axios';
import type { BackgroundInfo, LyricsParseResponse, PPTGenerateResponse, SlideData } from '../types';

const api = axios.create({
  baseURL: '/api',
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
  });
  return data;
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
    timed: { text: string; start: number; end: number }[];
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
  timingOverrides?: { idx: number; start_sec: number; end_sec: number }[];
  backgroundOverrides?: { idx: number; background_id?: number; background_url?: string }[];
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
    timing_overrides: req.timingOverrides ?? [],
    background_overrides: req.backgroundOverrides ?? [],
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
