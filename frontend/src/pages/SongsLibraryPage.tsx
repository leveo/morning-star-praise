import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { usePersistedState } from '../hooks/usePersistedState';
import { RESUME_KEY_PREFIX } from '../hooks/useResumeSnapshot';
import {
  deleteLibraryItem,
  getLibraryItem,
  getDownloadUrl,
  getVideoDownloadUrl,
  listLibrary,
  type LibraryItem,
  type LibraryItemType,
  type LibrarySourcePage,
} from '../api/client';

/** Map from source_page → the frontend route that renders it. */
const PAGE_ROUTE: Record<LibrarySourcePage, string> = {
  lyrics: '/',
  youtube: '/youtube',
  ocr: '/ocr',
  'worship-video': '/worship-video',
};

export default function SongsLibraryPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].songs;
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [search, setSearch] = usePersistedState('library.search', '');
  const [filter, setFilter] = usePersistedState<LibraryItemType | ''>('library.filter', '');
  const [loading, setLoading] = useState(true);
  const [dbDown, setDbDown] = useState(false);
  const navigate = useNavigate();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await listLibrary(search, filter);
      setItems(data);
      setDbDown(false);
    } catch {
      setDbDown(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems();
  };

  const handleResume = async (item: LibraryItem) => {
    // Grab fresh detail so Resume reflects the current file/analysis availability.
    let snapshot: Record<string, unknown> = item.input_snapshot || {};
    let analysisExists = false;
    try {
      const detail = await getLibraryItem(item.id);
      snapshot = detail.input_snapshot || snapshot;
      analysisExists = detail.analysis_exists;
    } catch {
      /* fall back to cached snapshot on DB blip */
    }
    const payload = {
      snapshot,
      source_page: item.source_page,
      analysis_id: item.analysis_id,
      analysis_exists: analysisExists,
      filename: item.filename,
    };
    window.sessionStorage.setItem(
      RESUME_KEY_PREFIX + item.source_page,
      JSON.stringify(payload),
    );
    navigate(PAGE_ROUTE[item.source_page]);
  };

  const handleDelete = async (item: LibraryItem) => {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await deleteLibraryItem(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch {
      /* Ignore — error UI is shown elsewhere if DB is fully down */
    }
  };

  const downloadHrefFor = (item: LibraryItem): string | null => {
    if (!item.filename) return null;
    return item.item_type === 'video'
      ? getVideoDownloadUrl(item.filename)
      : getDownloadUrl(item.filename);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{t.title}</h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">{t.description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700">
          {([
            { key: '', label: t.filterAll },
            { key: 'ppt', label: t.filterPpt },
            { key: 'video', label: t.filterVideo },
          ] as const).map(({ key, label }) => (
            <button
              key={key || 'all'}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 rounded ${
                filter === key
                  ? 'bg-gold-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 w-64"
          />
          <button type="submit" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm">
            {t.searchButton}
          </button>
        </form>
      </div>

      {dbDown && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-yellow-300 text-sm">
          {t.dbUnavailable}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading…</div>
      ) : items.length === 0 && !dbDown ? (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-2">{t.emptyTitle}</p>
          <p className="text-slate-500 text-sm">{t.emptyBody}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const href = downloadHrefFor(item);
            return (
              <div
                key={item.id}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-center justify-between hover:bg-slate-800 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-white font-medium truncate">{item.title}</h3>
                    <TypeBadge type={item.item_type} />
                    {item.language && <LangBadge language={item.language} />}
                    <SourceBadge source={item.source_page} />
                  </div>
                  {item.created_at && (
                    <p className="text-slate-500 text-xs">{formatDate(item.created_at)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {href ? (
                    <a
                      href={href}
                      download={item.filename ?? undefined}
                      className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded"
                    >
                      {t.download}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500 italic">{t.fileExpired}</span>
                  )}
                  <button
                    onClick={() => handleResume(item)}
                    className="text-xs bg-gold-600 hover:bg-gold-700 text-white px-3 py-1.5 rounded"
                  >
                    {t.resume}
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-xs bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white px-3 py-1.5 rounded transition-colors"
                  >
                    {t.delete}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: LibraryItemType }) {
  const label = type === 'video' ? 'VIDEO' : 'PPT';
  const color = type === 'video' ? 'bg-blue-900/40 text-blue-300' : 'bg-emerald-900/40 text-emerald-300';
  return <span className={`text-xs px-2 py-0.5 rounded ${color}`}>{label}</span>;
}

function LangBadge({ language }: { language: string }) {
  const map: Record<string, string> = { en: 'EN', 'zh-hans': '简', 'zh-hant': '繁', zh: 'ZH', auto: 'AUTO' };
  return <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{map[language] || language}</span>;
}

function SourceBadge({ source }: { source: LibrarySourcePage }) {
  const map: Record<LibrarySourcePage, string> = {
    lyrics: 'Lyrics',
    youtube: 'YouTube',
    ocr: 'OCR',
    'worship-video': 'Worship Video',
  };
  return <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">{map[source]}</span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
