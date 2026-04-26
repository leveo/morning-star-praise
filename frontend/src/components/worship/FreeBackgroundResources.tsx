// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Leo Song
import { useState } from 'react';
import { useUILanguage, UI_TEXT } from '../../hooks/useLanguage';

export default function FreeBackgroundResources() {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].freeBackgroundResources;
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/60 transition-colors rounded-lg"
      >
        <div>
          <h3 className="text-sm font-medium text-slate-200">{t.heading}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{t.subheading}</p>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-slate-400">{t.tip}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {t.resources.map((res) => (
              <a
                key={res.name}
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-900/60 rounded-lg p-3 border border-slate-700 hover:border-gold-500/60 hover:bg-slate-900 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gold-300">{res.name}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                    {res.category}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{res.blurb}</p>
                {res.searchHints && (
                  <p className="text-[11px] text-slate-500 mt-1.5 italic">
                    {t.tryPrefix}{res.searchHints}
                  </p>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
