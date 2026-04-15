import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { usePersistedState } from '../hooks/usePersistedState';

interface Song {
  id: number;
  title: string;
  lyrics: string;
  language: string;
  source: string | null;
  created_at: string | null;
}

export default function SongsLibraryPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].songs;
  const [songs, setSongs] = useState<Song[]>([]);
  const [search, setSearch] = usePersistedState('songs.search', '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchSongs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const { data } = await axios.get<Song[]>(`/api/songs?${params}`);
      setSongs(data);
    } catch {
      setError('Failed to load songs. Database may not be available.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSongs(); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSongs();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this song?')) return;
    try {
      await axios.delete(`/api/songs/${id}`);
      setSongs(songs.filter(s => s.id !== id));
    } catch {
      setError('Failed to delete song');
    }
  };

  const langLabel = (lang: string) => {
    const map: Record<string, string> = { en: 'EN', 'zh-hans': '简', 'zh-hant': '繁' };
    return map[lang] || lang;
  };

  const sourceLabel = (src: string | null) => {
    const map: Record<string, string> = { youtube: 'YouTube', text: 'Text', ocr: 'OCR' };
    return src ? map[src] || src : '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{t.title}</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
          />
          <button type="submit" className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm">
            {t.searchButton}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-yellow-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : songs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400 mb-2">No songs saved yet.</p>
          <p className="text-slate-500 text-sm">Songs you create will appear here for reuse.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {songs.map((song) => (
            <div
              key={song.id}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex items-center justify-between hover:bg-slate-800 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-medium truncate">{song.title}</h3>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{langLabel(song.language)}</span>
                  {song.source && (
                    <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">{sourceLabel(song.source)}</span>
                  )}
                </div>
                <p className="text-slate-500 text-xs truncate">{song.lyrics.split('\n')[0]}</p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => navigate(`/?song=${song.id}`)}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded"
                >
                  Use
                </button>
                <button
                  onClick={() => handleDelete(song.id)}
                  className="text-xs bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white px-3 py-1.5 rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
