// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import {
  END_SLIDE_DURATION_SEC,
  WorshipVideo,
  type WorshipVideoProps,
} from '@remotion-composition/WorshipVideo';
import {
  getWorshipPlan,
  rerenderWorshipVideo,
  getVideoJob,
  getVideoDownloadUrl,
  mergeVideoJobStatus,
  type VideoJobStatus,
  type WorshipPlanResponse,
} from '../../api/client';
import type { BackgroundInfo } from '../../types';
import { LazyVideoTile } from '../ppt/BackgroundPicker';

interface Props {
  analysisId: string;
  title: string;
  composer: string;
  onTitleChange: (value: string) => void;
  onComposerChange: (value: string) => void;
  allBackgrounds: BackgroundInfo[];
  initialBackgroundPool: BackgroundInfo[];
  karaokeMode: boolean;
  primaryFontSize?: number;
  secondaryFontSize?: number;
  lineSpacingMultiplier?: number;
  showPageNumbers: boolean;
  backgroundMotion: boolean;
  lyricLeadSeconds: number;
  showEndSlide: boolean;
  paddingStyle: 'dark' | 'light';
  selectedBgIds: number[];
  extractedBgFilenames?: string[];
  sheet?: { sessionId: string; cropFilenames: string[]; cropUrls: string[] };
  inputSnapshot?: Record<string, unknown>;
  onRendered: (job: VideoJobStatus) => void;
  onClose: () => void;
}

const FPS = 30;

type TimingEdit = { sungStart: number };
type BackgroundMediaFilter = 'all' | 'image' | 'video';
type PlanTimed = WorshipPlanResponse['plan']['timed'][number];
type ApiError = { response?: { data?: { detail?: string } } };

type PreviewTiming = PlanTimed & {
  displayStart: number;
  displayEnd: number;
  previewSungStart: number;
  previewSungEnd: number;
};

function derivePreviewTimings(
  timed: PlanTimed[],
  edits: Record<number, TimingEdit>,
  audioDuration: number,
  leadSeconds: number,
): PreviewTiming[] {
  const lead = Math.max(0, Math.min(leadSeconds, 30));
  let previousDisplayStart = -0.1;
  const derived = timed.map((tc, i) => {
    const originalSungStart = tc.sung_start ?? tc.start;
    const originalSungEnd = tc.sung_end ?? tc.end;
    const maxSungStart = Math.max(audioDuration - 0.1, 0);
    const sungStart = Math.max(
      0,
      Math.min(edits[i]?.sungStart ?? originalSungStart, maxSungStart),
    );
    const delta = sungStart - originalSungStart;
    const sungEnd = Math.min(
      audioDuration,
      Math.max(
        sungStart + 0.1,
        Math.min(originalSungEnd + delta, audioDuration),
      ),
    );

    let displayStart = Math.max(0, sungStart - lead);
    displayStart = Math.max(displayStart, previousDisplayStart + 0.1);
    displayStart = Math.min(displayStart, Math.max(audioDuration - 0.1, 0));
    previousDisplayStart = displayStart;

    return {
      ...tc,
      displayStart,
      displayEnd: audioDuration,
      previewSungStart: sungStart,
      previewSungEnd: sungEnd,
      lead: Math.max(0, sungStart - displayStart),
    };
  });

  for (let i = 0; i < derived.length - 1; i += 1) {
    derived[i].displayEnd = derived[i + 1].displayStart;
  }
  return derived;
}

function shiftedUnits(
  units: PlanTimed['units'],
  originalStart: number,
  previewStart: number,
) {
  if (!units || originalStart === previewStart) return units;
  const delta = previewStart - originalStart;
  return units.map((unit) => ({
    ...unit,
    startSec: unit.startSec == null ? null : Math.max(0, unit.startSec + delta),
  }));
}

export default function VideoEditor({
  analysisId,
  title,
  composer,
  onTitleChange,
  onComposerChange,
  allBackgrounds,
  initialBackgroundPool,
  karaokeMode,
  primaryFontSize,
  secondaryFontSize,
  lineSpacingMultiplier,
  showPageNumbers,
  backgroundMotion,
  lyricLeadSeconds,
  showEndSlide,
  paddingStyle,
  selectedBgIds,
  extractedBgFilenames,
  sheet,
  inputSnapshot,
  onRendered,
  onClose,
}: Props) {
  const [plan, setPlan] = useState<WorshipPlanResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [timingEdits, setTimingEdits] = useState<Record<number, TimingEdit>>({});
  const [bgOverrides, setBgOverrides] = useState<Record<number, number>>({});
  const [bgPickerOpen, setBgPickerOpen] = useState<number | null>(null);
  const [bgMediaFilter, setBgMediaFilter] = useState<BackgroundMediaFilter>('all');
  const [bgSearch, setBgSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<VideoJobStatus | null>(null);
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    let cancelled = false;
    getWorshipPlan(analysisId)
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err?.response?.data?.detail || '无法载入分析结果');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  const jobId = job?.job_id;
  const shouldPoll =
    !!job && (job.status === 'pending' || job.status === 'processing');
  useEffect(() => {
    if (!shouldPoll || !jobId) return;
    const id = window.setInterval(async () => {
      try {
        const latest = await getVideoJob(jobId);
        setJob((prev) => mergeVideoJobStatus(prev, latest));
        onRendered(latest);
        if (latest.status === 'done') {
          setSubmitting(false);
        } else if (latest.status === 'failed') {
          setSubmitting(false);
        }
      } catch {
        // Keep polling through transient backend restarts.
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [shouldPoll, jobId, onRendered]);

  const previewTimings = useMemo(() => {
    if (!plan) return [];
    return derivePreviewTimings(
      plan.plan.timed,
      timingEdits,
      plan.plan.audio_duration,
      lyricLeadSeconds,
    );
  }, [plan, timingEdits, lyricLeadSeconds]);

  const backgroundUrlForSlide = useMemo(() => {
    return (i: number): string | null => {
      const overrideId = bgOverrides[i];
      if (overrideId != null) {
        const bg = allBackgrounds.find((item) => item.id === overrideId);
        if (bg) return bg.url;
      }
      if (initialBackgroundPool.length === 0) return null;
      return initialBackgroundPool[Math.floor(i / 2) % initialBackgroundPool.length].url;
    };
  }, [bgOverrides, allBackgrounds, initialBackgroundPool]);

  const titleBackgroundUrl = useMemo(() => {
    const overrideId = bgOverrides[-1];
    if (overrideId != null) {
      const bg = allBackgrounds.find((item) => item.id === overrideId);
      if (bg) return bg.url;
    }
    return backgroundUrlForSlide(0);
  }, [bgOverrides, allBackgrounds, backgroundUrlForSlide]);

  const filteredBackgrounds = useMemo(() => {
    const query = bgSearch.trim().toLocaleLowerCase();
    return allBackgrounds.filter((bg) => {
      const mediaType = bg.media_type === 'video' ? 'video' : 'image';
      if (bgMediaFilter !== 'all' && mediaType !== bgMediaFilter) return false;
      if (!query) return true;
      return `${bg.name} ${bg.filename} ${(bg.tags ?? []).join(' ')}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [allBackgrounds, bgMediaFilter, bgSearch]);

  const playerProps: WorshipVideoProps | null = useMemo(() => {
    if (!plan) return null;
    return {
      title,
      composer,
      language: plan.plan.language,
      audioSrc: plan.audio_url,
      audioDurationSec: plan.plan.audio_duration,
      introDurationSec: previewTimings[0]?.displayStart ?? 0,
      chunks: previewTimings.map((tc, i) => ({
        text: tc.text,
        startSec: tc.displayStart,
        endSec: tc.displayEnd,
        backgroundSrc: backgroundUrlForSlide(i),
        sheetImageSrc:
          sheet?.cropUrls.length
            ? sheet.cropUrls[i % sheet.cropUrls.length]
            : null,
        units: shiftedUnits(
          tc.units,
          tc.sung_start ?? tc.start,
          tc.previewSungStart,
        ),
      })),
      titleBackgroundSrc: titleBackgroundUrl,
      karaokeMode,
      primaryFontSizePt: primaryFontSize ?? null,
      secondaryFontSizePt: secondaryFontSize ?? null,
      lineSpacingMultiplier: lineSpacingMultiplier ?? null,
      showPageNumbers,
      paddingStyle,
      backgroundMotion,
      showEndSlide,
      endSlideDurationSec: END_SLIDE_DURATION_SEC,
    };
  }, [
    plan,
    title,
    composer,
    previewTimings,
    backgroundUrlForSlide,
    sheet,
    titleBackgroundUrl,
    karaokeMode,
    primaryFontSize,
    secondaryFontSize,
    lineSpacingMultiplier,
    showPageNumbers,
    paddingStyle,
    backgroundMotion,
    showEndSlide,
  ]);

  const durationInFrames = Math.max(
    1,
    Math.round(
      ((plan?.plan.audio_duration ?? 0)
        + (showEndSlide ? END_SLIDE_DURATION_SEC : 0)) * FPS,
    ),
  );

  const updateSungStart = (idx: number, value: number) => {
    if (!Number.isFinite(value)) return;
    setTimingEdits((prev) => ({
      ...prev,
      [idx]: { sungStart: Math.max(0, value) },
    }));
  };

  const setFromPlayhead = (idx: number) => {
    const frame = playerRef.current?.getCurrentFrame() ?? 0;
    updateSungStart(idx, frame / FPS);
  };

  const seekToSlide = (idx: number) => {
    const target = previewTimings[idx]?.displayStart ?? 0;
    playerRef.current?.seekTo(Math.max(0, Math.round((target - 0.4) * FPS)));
  };

  const handleRender = async () => {
    if (!plan) return;
    setSubmitting(true);
    setLoadError('');
    try {
      const status = await rerenderWorshipVideo({
        analysisId,
        title,
        composer,
        backgroundIds: selectedBgIds.length > 0 ? selectedBgIds : undefined,
        extractedBackgroundPaths: extractedBgFilenames,
        karaokeMode,
        primaryFontSize,
        secondaryFontSize,
        lineSpacingMultiplier,
        showPageNumbers,
        backgroundMotion,
        lyricLeadSeconds,
        showEndSlide,
        paddingStyle,
        timingOverrides: Object.entries(timingEdits).map(([idx, edit]) => ({
          idx: Number(idx),
          sung_start_sec: edit.sungStart,
        })),
        backgroundOverrides: Object.entries(bgOverrides).map(([idx, id]) => ({
          idx: Number(idx),
          background_id: id,
        })),
        sheet:
          sheet?.cropFilenames.length
            ? {
                sessionId: sheet.sessionId,
                cropFilenames: sheet.cropFilenames,
              }
            : undefined,
        inputSnapshot,
      });
      setJob(status);
      onRendered(status);
      getWorshipPlan(analysisId)
        .then((refreshedPlan) => {
          setPlan(refreshedPlan);
          setTimingEdits({});
        })
        .catch(() => {
          // Rendering already started; a transient refresh failure is harmless.
        });
    } catch (err: unknown) {
      setSubmitting(false);
      const detail = (err as ApiError).response?.data?.detail;
      setLoadError(detail || '视频生成失败');
    }
  };

  if (loadError) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
        {loadError}
      </div>
    );
  }

  if (!plan || !playerProps) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 text-sm text-slate-400">
        正在载入校准预览…
      </div>
    );
  }

  const isRendering = Boolean(
    submitting || (job && (job.status === 'pending' || job.status === 'processing')),
  );

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-slate-200">渲染前歌词校准</h3>
          <p className="text-xs text-slate-500 mt-1">
            播放音频，将播放指针停在歌词开唱处，再点“设为当前时间”。所有歌词页会提前
            {' '}{lyricLeadSeconds.toFixed(1)} 秒完整显示，逐页开唱时间仍可单独微调。
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={isRendering}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          收起
        </button>
      </div>

      <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
        <Player
          ref={playerRef}
          component={WorshipVideo}
          inputProps={playerProps}
          durationInFrames={durationInFrames}
          compositionWidth={1920}
          compositionHeight={1080}
          fps={FPS}
          controls
          autoPlay={false}
          loop={false}
          numberOfSharedAudioTags={1}
          style={{ width: '100%', aspectRatio: '16 / 9' }}
        />
      </div>

      <div
        className={`rounded-lg border px-4 py-4 space-y-3 ${
          bgOverrides[-1] != null
            ? 'bg-amber-900/20 border-amber-700/60'
            : 'bg-slate-900/40 border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-slate-200">标题页</h4>
            <p className="text-xs text-slate-500 mt-1">
              中英混合标题会自动在语言交界处换行，也可以在主标题中手动换行。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBgPickerOpen(-1)}
            className="shrink-0 rounded bg-slate-700 px-3 py-1.5 text-xs text-gold-300 hover:bg-slate-600"
          >
            更换标题背景
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">主标题</span>
            <textarea
              rows={2}
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              className="w-full resize-y rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-400">副标题 / 作词作曲</span>
            <textarea
              rows={2}
              value={composer}
              onChange={(event) => onComposerChange(event.target.value)}
              className="w-full resize-y rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      </div>

      <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-2">
        {previewTimings.map((tc, i) => {
          const isDirty = timingEdits[i] != null || bgOverrides[i] != null;
          return (
            <div
              key={i}
              className={`rounded-lg border px-3 py-3 space-y-2 ${
                isDirty
                  ? 'bg-amber-900/20 border-amber-700/60'
                  : 'bg-slate-900/40 border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 w-8">#{i + 1}</span>
                <button
                  type="button"
                  onClick={() => seekToSlide(i)}
                  className="text-xs text-sky-400 hover:text-sky-300"
                >
                  跳到此页
                </button>
                <span className="text-xs text-slate-500">开唱</span>
                <button
                  type="button"
                  onClick={() => updateSungStart(i, tc.previewSungStart - 0.1)}
                  className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                >
                  -0.1
                </button>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={tc.previewSungStart.toFixed(2)}
                  onChange={(event) => updateSungStart(i, Number(event.target.value))}
                  className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => updateSungStart(i, tc.previewSungStart + 0.1)}
                  className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                >
                  +0.1
                </button>
                <button
                  type="button"
                  onClick={() => setFromPlayhead(i)}
                  className="rounded bg-amber-700 px-2 py-1 text-xs text-white hover:bg-amber-600"
                >
                  设为当前时间
                </button>
                <span className="text-xs text-emerald-400">
                  画面 {tc.displayStart.toFixed(2)}s
                  {' '}（提前 {tc.lead.toFixed(2)}s）
                </span>
                <button
                  type="button"
                  onClick={() => setBgPickerOpen(bgPickerOpen === i ? null : i)}
                  className="ml-auto text-xs text-gold-400 hover:text-gold-300"
                >
                  更换背景
                </button>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-line pl-10">
                {tc.text}
              </p>
            </div>
          );
        })}
      </div>

      {bgPickerOpen !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-xl border border-slate-600 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-5 py-4">
              <div>
                <h4 className="text-base font-medium text-white">
                  {bgPickerOpen === -1
                    ? '为标题页选择背景'
                    : `为第 ${bgPickerOpen + 1} 页选择背景`}
                </h4>
                <p className="mt-1 text-xs text-slate-400">
                  点击缩略图后立即应用到预览和正式视频。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBgPickerOpen(null)}
                className="rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                取消
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b border-slate-700 px-5 py-3">
              <div className="flex rounded-lg bg-slate-800 p-1">
                {([
                  ['all', '全部'],
                  ['image', '静态'],
                  ['video', '动态'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBgMediaFilter(value)}
                    className={`rounded px-3 py-1.5 text-xs ${
                      bgMediaFilter === value
                        ? 'bg-gold-600 text-white'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={bgSearch}
                onChange={(event) => setBgSearch(event.target.value)}
                placeholder="搜索名称或标签…"
                className="min-w-56 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <span className="text-xs text-slate-500">
                {filteredBackgrounds.length} 张
              </span>
            </div>

            <div className="overflow-y-auto p-5">
              {filteredBackgrounds.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {filteredBackgrounds.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => {
                        setBgOverrides((prev) => ({ ...prev, [bgPickerOpen]: bg.id }));
                        setBgPickerOpen(null);
                      }}
                      className="group overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-left hover:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
                    >
                      <div className="aspect-video overflow-hidden bg-black">
                        {bg.media_type === 'video' ? (
                          <LazyVideoTile src={bg.url} />
                        ) : (
                          <img
                            src={bg.url}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="truncate text-xs text-slate-200">
                          {bg.name || bg.filename}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-500">
                          {bg.media_type === 'video' ? '动态' : '静态'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center text-sm text-slate-500">
                  没有符合当前筛选条件的背景
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setTimingEdits({});
            setBgOverrides({});
          }}
          disabled={
            isRendering ||
            (Object.keys(timingEdits).length === 0 &&
              Object.keys(bgOverrides).length === 0)
          }
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
        >
          重置全部人工调整
        </button>
        <div className="flex items-center gap-3">
          {job && (job.status === 'pending' || job.status === 'processing') && (
            <span className="text-xs text-slate-400">
              {job.stage} {job.progress}%
            </span>
          )}
          {job?.status === 'done' && job.video_filename && (
            <a
              href={getVideoDownloadUrl(job.video_filename)}
              download={job.video_filename}
              className="text-xs text-green-400 hover:text-green-300"
            >
              已生成，下载 MP4
            </a>
          )}
          <button
            type="button"
            onClick={handleRender}
            disabled={isRendering}
            className="bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {isRendering ? '正在生成…' : job?.status === 'done' ? '按当前调整重新生成' : '按当前校准生成视频'}
          </button>
        </div>
      </div>
    </div>
  );
}
