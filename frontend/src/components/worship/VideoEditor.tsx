// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { WorshipVideo, type WorshipVideoProps } from '@remotion-composition/WorshipVideo';
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
  allBackgrounds: BackgroundInfo[];
  /** Initial background cycle the user picked in the main page — we
   *  build `titleBackgroundSrc` and `chunks[].backgroundSrc` from this
   *  list so the Player preview matches what the just-rendered MP4 shows. */
  initialBackgroundPool: BackgroundInfo[];
  karaokeMode: boolean;
  primaryFontSize?: number;
  secondaryFontSize?: number;
  lineSpacingMultiplier?: number;
  showPageNumbers: boolean;
  paddingStyle: 'dark' | 'light';
  selectedBgIds: number[];
  extractedBgFilenames?: string[];
  onRerendered: (filename: string) => void;
  onClose: () => void;
}

const FPS = 30;

type TimingEdit = { start: number; end: number };

export default function VideoEditor({
  analysisId,
  title,
  composer,
  allBackgrounds,
  initialBackgroundPool,
  karaokeMode,
  primaryFontSize,
  secondaryFontSize,
  lineSpacingMultiplier,
  showPageNumbers,
  paddingStyle,
  selectedBgIds,
  extractedBgFilenames,
  onRerendered,
  onClose,
}: Props) {
  const [plan, setPlan] = useState<WorshipPlanResponse | null>(null);
  const [loadError, setLoadError] = useState<string>('');

  // Per-slide user edits — keyed by slide index. If the key is missing,
  // the slide uses the original time from plan.timed.
  const [timingEdits, setTimingEdits] = useState<Record<number, TimingEdit>>({});
  const [bgOverrides, setBgOverrides] = useState<Record<number, number>>({});
  const [bgPickerOpen, setBgPickerOpen] = useState<number | null>(null);
  const bgPickerRef = useRef<HTMLDivElement | null>(null);
  // The BG picker panel renders BELOW the scrollable slide list. Click "Change
  // BG" on a slide near the top and the panel spawns out of view, so the
  // interaction reads as "nothing happened". Scroll it into view on open.
  useEffect(() => {
    if (bgPickerOpen !== null && bgPickerRef.current) {
      bgPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [bgPickerOpen]);

  // Re-render progress state
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<VideoJobStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorshipPlan(analysisId)
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err?.response?.data?.detail || 'Failed to load analysis');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  // Depend only on the job_id / active-ness, not the whole job object —
  // otherwise every tick's setJob would tear down and rebuild the interval.
  const jobId = job?.job_id;
  const shouldPoll =
    !!job && (job.status === 'pending' || job.status === 'processing');
  useEffect(() => {
    if (!shouldPoll || !jobId) return;
    const id = window.setInterval(async () => {
      try {
        const latest = await getVideoJob(jobId);
        setJob((prev) => mergeVideoJobStatus(prev, latest));
        if (latest.status === 'done' && latest.video_filename) {
          onRerendered(latest.video_filename);
          setSubmitting(false);
        } else if (latest.status === 'failed') {
          setSubmitting(false);
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [shouldPoll, jobId, onRerendered]);

  /** Compute the background URL for slide i using the same precedence as
   *  the backend's ``assign_backgrounds``: extracted PPT bgs → user
   *  selected ids → the full default library. ``bgOverrides`` from the
   *  editor take precedence over everything. */
  const backgroundUrlForSlide = useMemo(() => {
    return (i: number): string | null => {
      const overrideId = bgOverrides[i];
      if (overrideId != null) {
        const bg = allBackgrounds.find((b) => b.id === overrideId);
        if (bg) return bg.url;
      }
      if (initialBackgroundPool.length === 0) return null;
      return initialBackgroundPool[i % initialBackgroundPool.length].url;
    };
  }, [bgOverrides, allBackgrounds, initialBackgroundPool]);

  // Build Player inputProps live from plan + edits so scrubbing the
  // inputs re-renders the preview instantly.
  const playerProps: WorshipVideoProps | null = useMemo(() => {
    if (!plan) return null;
    const timed = plan.plan.timed;
    const chunks = timed.map((tc, i) => {
      const edit = timingEdits[i];
      return {
        text: tc.text,
        startSec: edit?.start ?? tc.start,
        endSec: edit?.end ?? tc.end,
        backgroundSrc: backgroundUrlForSlide(i),
        units: tc.units,
      };
    });
    return {
      title,
      composer,
      language: plan.plan.language,
      audioSrc: plan.audio_url,
      audioDurationSec: plan.plan.audio_duration,
      introDurationSec: plan.plan.intro_end,
      chunks,
      // Title slide uses index 0 from the pool (mirrors render_via_remotion
      // which uses background_paths[0] for the title slide).
      titleBackgroundSrc:
        initialBackgroundPool.length > 0 ? initialBackgroundPool[0].url : null,
      karaokeMode,
      primaryFontSizePt: primaryFontSize ?? null,
      secondaryFontSizePt: secondaryFontSize ?? null,
      lineSpacingMultiplier: lineSpacingMultiplier ?? null,
      showPageNumbers,
      paddingStyle,
    };
  }, [
    plan,
    title,
    composer,
    timingEdits,
    backgroundUrlForSlide,
    initialBackgroundPool,
    karaokeMode,
    primaryFontSize,
    secondaryFontSize,
    lineSpacingMultiplier,
    showPageNumbers,
    paddingStyle,
  ]);

  const durationInFrames = useMemo(() => {
    if (!plan) return 1;
    return Math.max(1, Math.round(plan.plan.audio_duration * FPS));
  }, [plan]);

  const handleRerender = async () => {
    if (!plan) return;
    setSubmitting(true);
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
        paddingStyle,
        timingOverrides: Object.entries(timingEdits).map(([idx, e]) => ({
          idx: Number(idx),
          start_sec: e.start,
          end_sec: e.end,
        })),
        backgroundOverrides: Object.entries(bgOverrides).map(([idx, id]) => ({
          idx: Number(idx),
          background_id: id,
        })),
      });
      setJob(status);
    } catch (err: any) {
      setSubmitting(false);
      setLoadError(err?.response?.data?.detail || 'Re-render failed');
    }
  };

  const updateTiming = (idx: number, field: 'start' | 'end', value: number) => {
    if (!plan) return;
    const current = timingEdits[idx] ?? plan.plan.timed[idx];
    setTimingEdits((prev) => ({
      ...prev,
      [idx]: {
        start: field === 'start' ? value : current.start,
        end: field === 'end' ? value : current.end,
      },
    }));
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
        Loading plan…
      </div>
    );
  }

  const isRendering = submitting || (job && (job.status === 'pending' || job.status === 'processing'));

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Edit video</h3>
        <button
          onClick={onClose}
          disabled={!!isRendering}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          Close
        </button>
      </div>

      <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
        <Player
          component={WorshipVideo}
          inputProps={playerProps}
          durationInFrames={durationInFrames}
          compositionWidth={1920}
          compositionHeight={1080}
          fps={FPS}
          controls
          autoPlay={false}
          loop
          style={{ width: '100%', aspectRatio: '16 / 9' }}
        />
      </div>

      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-2">
        {plan.plan.timed.map((tc, i) => {
          const edit = timingEdits[i];
          const start = edit?.start ?? tc.start;
          const end = edit?.end ?? tc.end;
          const isDirty = !!edit || bgOverrides[i] != null;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                isDirty
                  ? 'bg-amber-900/20 border-amber-700/60'
                  : 'bg-slate-900/40 border-slate-700'
              }`}
            >
              <span className="text-xs text-slate-500 w-10 shrink-0">#{i + 1}</span>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <label>start</label>
                <input
                  type="number"
                  step="0.1"
                  value={start.toFixed(2)}
                  onChange={(e) => updateTiming(i, 'start', Number(e.target.value))}
                  className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                />
                <label className="ml-1">end</label>
                <input
                  type="number"
                  step="0.1"
                  value={end.toFixed(2)}
                  onChange={(e) => updateTiming(i, 'end', Number(e.target.value))}
                  className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                />
              </div>
              <p className="flex-1 text-xs text-slate-300 truncate">
                {tc.text.replace(/\n/g, ' / ')}
              </p>
              <button
                type="button"
                onClick={() => setBgPickerOpen(bgPickerOpen === i ? null : i)}
                className="text-xs text-gold-400 hover:text-gold-300 whitespace-nowrap"
              >
                Change BG
              </button>
            </div>
          );
        })}
      </div>

      {bgPickerOpen !== null && (
        <div ref={bgPickerRef} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Pick a background for slide #{bgPickerOpen + 1}</span>
            <button
              onClick={() => setBgPickerOpen(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
            {allBackgrounds.map((bg) => (
              <button
                key={bg.id}
                onClick={() => {
                  setBgOverrides((prev) => ({ ...prev, [bgPickerOpen]: bg.id }));
                  setBgPickerOpen(null);
                }}
                className="aspect-video rounded overflow-hidden border border-slate-700 hover:border-gold-500"
              >
                {bg.media_type === 'video' ? (
                  <LazyVideoTile src={bg.url} />
                ) : (
                  <img src={bg.url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setTimingEdits({});
            setBgOverrides({});
          }}
          disabled={
            !!isRendering ||
            (Object.keys(timingEdits).length === 0 && Object.keys(bgOverrides).length === 0)
          }
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
        >
          Reset all edits
        </button>
        <div className="flex items-center gap-3">
          {job && job.status === 'processing' && (
            <span className="text-xs text-slate-400">
              {job.stage} {job.progress}%
            </span>
          )}
          {job && job.status === 'done' && job.video_filename && (
            <a
              href={getVideoDownloadUrl(job.video_filename)}
              download={job.video_filename}
              className="text-xs text-green-400 hover:text-green-300"
            >
              ✓ Re-rendered — download new MP4
            </a>
          )}
          <button
            type="button"
            onClick={handleRerender}
            disabled={!!isRendering}
            className="bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {isRendering ? 'Re-rendering…' : 'Re-render Video'}
          </button>
        </div>
      </div>
    </div>
  );
}
