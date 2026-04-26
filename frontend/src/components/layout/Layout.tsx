// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useUILanguage, type UILanguage } from '../../hooks/useLanguage';

type NavItem = {
  path: string;
  label: { zh: string; en: string };
};

const navItems: NavItem[] = [
  { path: '/', label: { zh: '歌词', en: 'Lyrics' } },
  { path: '/youtube', label: { zh: 'YouTube', en: 'YouTube' } },
  { path: '/ocr', label: { zh: '乐谱', en: 'Sheet Music' } },
  { path: '/worship-video', label: { zh: '视频', en: 'Video' } },
  { path: '/songs', label: { zh: '诗歌库', en: 'Songs' } },
  { path: '/templates', label: { zh: '设置', en: 'Settings' } },
];

const HEADER_TAGLINE: Record<UILanguage, string> = {
  zh: '一键将歌词、乐谱和网络资源转化为多语种敬拜 PPT 与展示视频的自动化工作流平台',
  en: 'An automated workflow platform that instantly transforms lyrics, sheet music, and web resources into multilingual worship presentations and videos.',
};

const FOOTER_NOTICE: Record<UILanguage, string> = {
  zh: '用户需自行获取歌曲的合法版权许可（如 CCLI）。',
  en: 'Users are responsible for obtaining proper song copyright licenses (e.g. CCLI).',
};

const FOOTER_TERMS: Record<UILanguage, string> = {
  zh: '服务条款',
  en: 'Terms of Use',
};

const FOOTER_PRIVACY: Record<UILanguage, string> = {
  zh: '隐私政策',
  en: 'Privacy Policy',
};

const FOOTER_ABOUT: Record<UILanguage, string> = {
  zh: '关于我们',
  en: 'About',
};

export default function Layout() {
  const location = useLocation();
  const [uiLanguage, setUILanguage] = useUILanguage();

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/logo.svg"
              alt="晨星赞美 Morning Star Praise"
              className="h-11 w-11 shrink-0"
            />
            <div className="leading-tight">
              <h1 className="text-lg font-bold text-white tracking-tight">
                晨星赞美 <span className="text-amber-400">·</span> Morning Star Praise
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl">
                {HEADER_TAGLINE[uiLanguage]}
              </p>
            </div>
          </Link>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-gold-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {item.label[uiLanguage]}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-800 mt-12">
        <div className="mx-auto max-w-6xl px-4 py-6 flex items-center justify-between text-xs text-slate-500 gap-4 flex-wrap">
          <p>{FOOTER_NOTICE[uiLanguage]}</p>
          <div className="flex items-center gap-4">
            <Link to="/about" className="hover:text-slate-300 transition-colors">
              {FOOTER_ABOUT[uiLanguage]}
            </Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">
              {FOOTER_TERMS[uiLanguage]}
            </Link>
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">
              {FOOTER_PRIVACY[uiLanguage]}
            </Link>
            <div className="flex items-center gap-0.5 border border-slate-700 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => setUILanguage('zh')}
                className={`px-2 py-0.5 transition-colors ${
                  uiLanguage === 'zh'
                    ? 'bg-amber-500/90 text-slate-900 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                中
              </button>
              <button
                type="button"
                onClick={() => setUILanguage('en')}
                className={`px-2 py-0.5 transition-colors ${
                  uiLanguage === 'en'
                    ? 'bg-amber-500/90 text-slate-900 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
