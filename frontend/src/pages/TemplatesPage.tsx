import { useState, useEffect } from 'react';
import axios from 'axios';
import { useUILanguage, UI_TEXT } from '../hooks/useLanguage';
import { usePersistedState } from '../hooks/usePersistedState';

interface Template {
  id: number;
  name: string;
  config: {
    font_size_en?: number;
    font_size_zh?: number;
    max_lines?: number;
    overlay_opacity?: number;
  };
  is_default: boolean;
  created_at: string | null;
}

export default function TemplatesPage() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].templates;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Template | null>(null);
  const [newName, setNewName] = usePersistedState('templates.newName', '');
  const [newConfig, setNewConfig] = usePersistedState('templates.newConfig', {
    font_size_en: 36,
    font_size_zh: 40,
    max_lines: 6,
    overlay_opacity: 40,
  });

  const fetchTemplates = async () => {
    try {
      const { data } = await axios.get<Template[]>('/api/templates');
      setTemplates(data);
    } catch {
      setError('Failed to load templates. Database may not be available.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await axios.post('/api/templates', { name: newName, config: newConfig });
      setNewName('');
      fetchTemplates();
    } catch { setError('Failed to create template'); }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    try {
      await axios.put(`/api/templates/${editing.id}`, {
        name: editing.name,
        config: editing.config,
      });
      setEditing(null);
      fetchTemplates();
    } catch { setError('Failed to update template'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    try {
      await axios.delete(`/api/templates/${id}`);
      setTemplates(templates.filter(t => t.id !== id));
    } catch { setError('Failed to delete template'); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">{t.title}</h2>

      {error && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-yellow-300 text-sm">{error}</div>
      )}

      {/* Template List */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <div key={t.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              {editing?.id === t.id ? (
                <div className="space-y-3">
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-gold-500" />
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Font Size (EN)', key: 'font_size_en' },
                      { label: 'Font Size (ZH)', key: 'font_size_zh' },
                      { label: 'Max Lines/Slide', key: 'max_lines' },
                      { label: 'Overlay Opacity %', key: 'overlay_opacity' },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <label className="text-xs text-slate-400">{label}</label>
                        <input type="number"
                          value={(editing.config as any)[key] ?? ''}
                          onChange={(e) => setEditing({ ...editing, config: { ...editing.config, [key]: Number(e.target.value) } })}
                          className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full" />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleUpdate} className="text-xs bg-gold-600 hover:bg-gold-700 text-white px-3 py-1.5 rounded">Save</button>
                    <button onClick={() => setEditing(null)} className="text-xs bg-slate-700 text-slate-300 px-3 py-1.5 rounded">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium">{t.name}</h3>
                      {t.is_default && <span className="text-xs bg-gold-600/30 text-gold-300 px-2 py-0.5 rounded">Default</span>}
                    </div>
                    <p className="text-slate-500 text-xs mt-1">
                      EN: {t.config.font_size_en}pt | ZH: {t.config.font_size_zh}pt | Lines: {t.config.max_lines} | Opacity: {t.config.overlay_opacity}%
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!t.is_default && (
                      <>
                        <button onClick={() => setEditing(t)} className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded">Edit</button>
                        <button onClick={() => handleDelete(t.id)} className="text-xs bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white px-3 py-1.5 rounded transition-colors">Delete</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create New Template */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-300">{t.createNew}</h3>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Template name..."
          className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm w-full placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Font Size (EN)', key: 'font_size_en' },
            { label: 'Font Size (ZH)', key: 'font_size_zh' },
            { label: 'Max Lines/Slide', key: 'max_lines' },
            { label: 'Overlay Opacity %', key: 'overlay_opacity' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label className="text-xs text-slate-400">{label}</label>
              <input type="number"
                value={(newConfig as any)[key]}
                onChange={(e) => setNewConfig({ ...newConfig, [key]: Number(e.target.value) })}
                className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-white text-sm w-full" />
            </div>
          ))}
        </div>
        <button onClick={handleCreate} disabled={!newName.trim()}
          className="bg-gold-600 hover:bg-gold-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Create Template
        </button>
      </div>
    </div>
  );
}
