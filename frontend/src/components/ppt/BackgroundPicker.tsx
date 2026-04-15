import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BackgroundInfo } from '../../types';
import { getBackgrounds, invalidateBackgroundsCache } from '../../api/client';
import { useUILanguage, UI_TEXT } from '../../hooks/useLanguage';
import axios from 'axios';

interface Props {
  selectedIds: number[];
  onSelect: (ids: number[]) => void;
}

const MAX_UPLOAD_COUNT = 10;
const ALLOWED_IMAGE_RE = /^image\/(jpeg|png|webp)$/;
const ALLOWED_VIDEO_RE = /^video\/(mp4|webm|quicktime)$/;

const HIDDEN_TAGS = new Set(['static', 'motion', 'dynamic', 'image', 'video']);

// Tiles outside the viewport pause their <video> via IntersectionObserver so the
// browser only decodes the ~8 visible ones. Without this, 30+ autoplay videos in
// one grid will saturate the decoder and jank the whole page.
function LazyVideoTile({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const setRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const el = videoRef.current;
        if (!el) return;
        if (entry.isIntersecting) {
          el.play().catch(() => {
            /* autoplay may be blocked in some browsers; tiles still show the poster frame */
          });
        } else {
          el.pause();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    (node as HTMLVideoElement & { __io?: IntersectionObserver }).__io = observer;
  }, []);

  useEffect(() => {
    return () => {
      const el = videoRef.current as (HTMLVideoElement & { __io?: IntersectionObserver }) | null;
      if (el?.__io) el.__io.disconnect();
    };
  }, []);

  return (
    <video
      ref={setRef}
      src={src}
      className="w-full h-full object-cover pointer-events-none"
      muted
      loop
      playsInline
      preload="metadata"
    />
  );
}

type MediaTypeFilter = 'all' | 'static' | 'motion';

export default function BackgroundPicker({ selectedIds, onSelect }: Props) {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].backgroundPicker;
  const [backgrounds, setBackgrounds] = useState<BackgroundInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaTypeFilter>('all');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchBackgrounds = () => {
    getBackgrounds()
      .then(setBackgrounds)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBackgrounds();
  }, []);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bg of backgrounds) {
      for (const t of bg.tags ?? []) {
        if (HIDDEN_TAGS.has(t)) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [backgrounds]);

  const filteredBgs = useMemo(() => {
    return backgrounds.filter((bg) => {
      if (mediaFilter === 'static' && bg.media_type === 'video') return false;
      if (mediaFilter === 'motion' && bg.media_type !== 'video') return false;
      if (activeTags.size === 0) return true;
      const bgTags = new Set(bg.tags ?? []);
      for (const t of activeTags) {
        if (bgTags.has(t)) return true;
      }
      return false;
    });
  }, [backgrounds, mediaFilter, activeTags]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const toggleSelected = (id: number) => {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter((i) => i !== id));
    } else {
      onSelect([...selectedIds, id]);
    }
  };

  const handleUpload = async (files: FileList) => {
    const valid = Array.from(files).filter(
      (f) => ALLOWED_IMAGE_RE.test(f.type) || ALLOWED_VIDEO_RE.test(f.type)
    );
    if (valid.length === 0) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const exceeded = valid.length > MAX_UPLOAD_COUNT;
    const toUpload = valid.slice(0, MAX_UPLOAD_COUNT);
    setUploadError(
      exceeded
        ? t.uploadErrorTooMany(valid.length, MAX_UPLOAD_COUNT)
        : null
    );

    const inheritedTags = Array.from(activeTags).join(',');

    const newBgs: BackgroundInfo[] = [];
    for (let i = 0; i < toUpload.length; i++) {
      setUploadProgress({ current: i + 1, total: toUpload.length });
      try {
        const formData = new FormData();
        formData.append('file', toUpload[i]);
        if (inheritedTags) formData.append('tags', inheritedTags);
        const { data } = await axios.post<BackgroundInfo>(
          '/api/backgrounds/upload',
          formData
        );
        newBgs.push(data);
      } catch {
        // Skip failed file and continue with the rest
      }
    }
    setUploadProgress(null);
    if (newBgs.length > 0) {
      setBackgrounds((prev) => [...prev, ...newBgs]);
      invalidateBackgroundsCache();
      onSelect([...selectedIds, ...newBgs.map((b) => b.id)]);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (loading) {
    return <div className="text-slate-400 text-sm">{t.loading}</div>;
  }

  const typeLabel: Record<MediaTypeFilter, string> = {
    all: t.typeAll,
    static: t.typeStatic,
    motion: t.typeMotion,
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{t.description}</p>

      {/* Media type filter */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-slate-500 w-10">{t.type}:</span>
        {(['all', 'static', 'motion'] as MediaTypeFilter[]).map((m) => (
          <button
            key={m}
            onClick={() => setMediaFilter(m)}
            className={`px-3 py-1 rounded-full transition-colors ${
              mediaFilter === m
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {typeLabel[m]}
          </button>
        ))}
      </div>

      {/* Tag chips */}
      {tagCounts.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-slate-500 w-10">{t.tags}:</span>
          {tagCounts.map(([tag, count]) => {
            const active = activeTags.has(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-0.5 rounded-full transition-colors ${
                  active
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tag} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600"
            >
              {t.clear}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {t.showing(filteredBgs.length, backgrounds.length)}
          {activeTags.size > 0 && (
            <>
              {t.willInheritTagsPrefix}
              <span className="text-amber-400">{Array.from(activeTags).join(', ')}</span>
            </>
          )}
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadProgress !== null}
          className="flex items-center gap-1 text-slate-300 hover:text-white disabled:opacity-50"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.mp4,.webm,.mov"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
            }}
          />
          {uploadProgress ? (
            <span>{t.uploading(uploadProgress.current, uploadProgress.total)}</span>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{t.upload(MAX_UPLOAD_COUNT)}</span>
            </>
          )}
        </button>
      </div>

      {/* Grid caps at ~3 rows (4 tiles/row) and scrolls vertically. Default
          shows 12 tiles; the rest scroll into view. */}
      <div
        className="max-h-[22rem] overflow-y-auto pr-2 rounded-lg bg-slate-900/30 border border-slate-700/60 p-2"
      >
        <div className="grid grid-cols-4 gap-3">
          {filteredBgs.map((bg) => {
            const isSelected = selectedIds.includes(bg.id);
            const isVideo = bg.media_type === 'video';
            return (
              <button
                key={bg.id}
                onClick={() => toggleSelected(bg.id)}
                className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                  isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/50'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                {isVideo ? (
                  <LazyVideoTile src={bg.url} />
                ) : (
                  <img
                    src={bg.url}
                    alt={bg.name}
                    className="w-full h-full object-cover"
                  />
                )}
                {isSelected && (
                  <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center pointer-events-none">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {isVideo && (
                  <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded pointer-events-none">
                    {t.motionTag}
                  </span>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 pointer-events-none">
                  <span className="text-xs text-white truncate block">{bg.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {uploadError && <p className="text-xs text-red-400 mt-2">{uploadError}</p>}
    </div>
  );
}
