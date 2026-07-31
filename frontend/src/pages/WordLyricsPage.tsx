// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  exportDocxLyrics,
  importDocxLyrics,
  type DocxLyricsImport,
  type DocxLyricsSection,
} from '../api/client';
import { useUILanguage } from '../hooks/useLanguage';
import { usePersistedState } from '../hooks/usePersistedState';
import ClearCurrentButton from '../components/shared/ClearCurrentButton';
import {
  clearWordLyricsDraft,
  saveWordLyricsDraft,
  sendToSlides,
  sendToVideo,
  slidesDraftExists,
  videoDraftExists,
} from '../utils/wordLyricsHandoff';

const MAX_BYTES = 10 * 1024 * 1024;

const TEXT = {
  zh: {
    title: '歌词整理',
    subtitle: '导入中英文对照的 Word 歌词，在本地整理、校对并发送到幻灯片或视频。',
    choose: '选择 DOCX',
    drop: '拖放原始 .docx 到这里，或点击选择文件',
    limit: '仅支持单个 .docx，最大 10 MB；不会调用模型或上传到云端。',
    importing: '正在读取…',
    replace: '重新选择',
    clear: '清空',
    metadata: '歌曲信息',
    number: '编号',
    titleZh: '中文歌名',
    titleEn: '英文歌名',
    collectionZh: '中文诗集抬头',
    collectionEn: '英文诗集抬头',
    review: '分段校对',
    reviewHint: '每节之后会自动重复副歌；分行会原样进入 Word、幻灯片和视频。',
    zhLyrics: '中文歌词',
    enLyrics: '英文歌词',
    verse: (n: number | null) => `第 ${n ?? ''} 节`,
    chorus: '副歌',
    sequence: '输出顺序',
    copy: '复制歌词',
    copied: '已复制',
    download: '下载 _v2.docx',
    downloading: '正在生成…',
    sendSlides: '发送到幻灯片',
    sendVideo: '发送到视频',
    overwriteSlides: '幻灯片页已有标题或歌词。要用当前歌词覆盖吗？',
    overwriteVideo: '视频页已有标题或歌词。要用当前歌词覆盖吗？',
    invalidType: '请选择 .docx 文件。',
    tooLarge: 'DOCX 不能超过 10 MB。',
    importFailed: '无法读取这个 DOCX。',
    exportFailed: '无法生成 DOCX。',
    copyFailed: '无法写入剪贴板，请重试。',
    missingNumber: '请填写诗歌编号。',
    missingTitleZh: '请填写中文歌名。',
    missingTitleEn: '请填写英文歌名。',
    missingVerses: '至少需要一节 Verse。',
    missingZh: (label: string) => `${label}缺少中文歌词。`,
    missingEn: (label: string) => `${label}缺少英文歌词。`,
  },
  en: {
    title: 'Lyrics',
    subtitle: 'Import a bilingual Word lyric sheet, review it locally, then send it to Slides or Video.',
    choose: 'Choose DOCX',
    drop: 'Drop the original .docx here, or click to choose a file',
    limit: 'One .docx up to 10 MB. No model calls and no cloud upload.',
    importing: 'Reading…',
    replace: 'Choose another',
    clear: 'Clear',
    metadata: 'Song information',
    number: 'Number',
    titleZh: 'Chinese title',
    titleEn: 'English title',
    collectionZh: 'Chinese collection heading',
    collectionEn: 'English collection heading',
    review: 'Section review',
    reviewHint: 'The chorus repeats after every verse; line breaks are preserved in every destination.',
    zhLyrics: 'Chinese lyrics',
    enLyrics: 'English lyrics',
    verse: (n: number | null) => `Verse ${n ?? ''}`,
    chorus: 'Chorus',
    sequence: 'Output order',
    copy: 'Copy lyrics',
    copied: 'Copied',
    download: 'Download _v2.docx',
    downloading: 'Generating…',
    sendSlides: 'Send to Slides',
    sendVideo: 'Send to Video',
    overwriteSlides: 'Slides already has a title or lyrics. Replace them with this song?',
    overwriteVideo: 'Video already has a title or lyrics. Replace them with this song?',
    invalidType: 'Please choose a .docx file.',
    tooLarge: 'The DOCX must be 10 MB or smaller.',
    importFailed: 'Could not read this DOCX.',
    exportFailed: 'Could not generate the DOCX.',
    copyFailed: 'Could not write to the clipboard. Please try again.',
    missingNumber: 'Enter the hymn number.',
    missingTitleZh: 'Enter the Chinese title.',
    missingTitleEn: 'Enter the English title.',
    missingVerses: 'At least one verse is required.',
    missingZh: (label: string) => `${label} is missing Chinese lyrics.`,
    missingEn: (label: string) => `${label} is missing English lyrics.`,
  },
};

type ApiError = { response?: { data?: { detail?: string } } };

function expandedSections(sections: DocxLyricsSection[]): DocxLyricsSection[] {
  const verses = sections
    .filter((section) => section.kind === 'verse')
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const chorus = sections.find((section) => section.kind === 'chorus');
  return verses.flatMap((verse) => (chorus ? [verse, chorus] : [verse]));
}

function formatSections(sections: DocxLyricsSection[]) {
  const expanded = expandedSections(sections);
  return {
    sequence: expanded.map((section) => section.id),
    primary: expanded.map((section) => section.zh_lines.join('\n').trim()).filter(Boolean).join('\n\n'),
    secondary: expanded.map((section) => section.en_lines.join('\n').trim()).filter(Boolean).join('\n\n'),
    combined: expanded
      .map((section) => [...section.zh_lines, ...section.en_lines].join('\n').trim())
      .filter(Boolean)
      .join('\n\n'),
  };
}

export default function WordLyricsPage() {
  const [uiLanguage] = useUILanguage();
  const t = TEXT[uiLanguage];
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = usePersistedState<DocxLyricsImport | null>(
    'wordLyrics.result',
    null,
  );
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const formatted = useMemo(
    () => formatSections(result?.sections ?? []),
    [result?.sections],
  );

  const blockingMessages = useMemo(() => {
    if (!result) return [];
    const messages: string[] = [];
    if (!result.song_number.trim()) messages.push(t.missingNumber);
    if (!result.title_zh.trim()) messages.push(t.missingTitleZh);
    if (!result.title_en.trim()) messages.push(t.missingTitleEn);
    const verses = result.sections.filter((section) => section.kind === 'verse');
    if (verses.length === 0) messages.push(t.missingVerses);
    for (const section of result.sections) {
      const label = section.kind === 'chorus' ? t.chorus : t.verse(section.number);
      if (!section.zh_lines.some((line) => line.trim())) messages.push(t.missingZh(label));
      if (!section.en_lines.some((line) => line.trim())) messages.push(t.missingEn(label));
    }
    return messages;
  }, [result, t]);

  useEffect(() => {
    if (!result) {
      clearWordLyricsDraft();
      return;
    }
    saveWordLyricsDraft({
      title: result.title_zh,
      titleEn: result.title_en,
      collectionZh: result.collection_zh,
      collectionEn: result.collection_en,
      primaryLyrics: formatted.primary,
      secondaryLyrics: formatted.secondary,
      combinedLyrics: formatted.combined,
    });
  }, [result, formatted]);

  const handleClearCurrentContent = () => {
    setResult(null);
    setError('');
    setCopied(false);
    clearWordLyricsDraft();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError('');
    setCopied(false);
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError(t.invalidType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t.tooLarge);
      return;
    }
    setLoading(true);
    try {
      setResult(await importDocxLyrics(file));
    } catch (err) {
      setResult(null);
      setError((err as ApiError).response?.data?.detail || t.importFailed);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateResult = <K extends keyof DocxLyricsImport>(key: K, value: DocxLyricsImport[K]) => {
    setResult((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateSongNumber = (value: string) => {
    setResult((current) => {
      if (!current) return current;
      const oldDefault = current.song_number ? `教會聖詩 #${current.song_number}` : '教會聖詩';
      const collection_zh = current.collection_zh === oldDefault
        ? (value ? `教會聖詩 #${value}` : '教會聖詩')
        : current.collection_zh;
      return { ...current, song_number: value, collection_zh };
    });
  };

  const updateLines = (index: number, field: 'zh_lines' | 'en_lines', value: string) => {
    setResult((current) => {
      if (!current) return current;
      const sections = current.sections.map((section, sectionIndex) => (
        sectionIndex === index ? { ...section, [field]: value.split('\n') } : section
      ));
      return { ...current, sections };
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted.combined);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t.copyFailed);
    }
  };

  const handleDownload = async () => {
    if (!result || blockingMessages.length > 0) return;
    setDownloading(true);
    setError('');
    try {
      const blob = await exportDocxLyrics({
        source_filename: result.source_filename,
        song_number: result.song_number,
        title_zh: result.title_zh,
        title_en: result.title_en,
        collection_zh: result.collection_zh,
        collection_en: result.collection_en,
        sections: result.sections,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.output_filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as ApiError).response?.data?.detail || t.exportFailed);
    } finally {
      setDownloading(false);
    }
  };

  const handleSendSlides = () => {
    if (!result || blockingMessages.length > 0) return;
    if (slidesDraftExists() && !window.confirm(t.overwriteSlides)) return;
    sendToSlides({
      title: result.title_zh,
      titleEn: result.title_en,
      collectionZh: result.collection_zh,
      collectionEn: result.collection_en,
      primaryLyrics: formatted.primary,
      secondaryLyrics: formatted.secondary,
    });
    navigate('/slides');
  };

  const handleSendVideo = () => {
    if (!result || blockingMessages.length > 0) return;
    if (videoDraftExists() && !window.confirm(t.overwriteVideo)) return;
    sendToVideo({
      title: result.title_zh,
      titleEn: result.title_en,
      collectionZh: result.collection_zh,
      collectionEn: result.collection_en,
      combinedLyrics: formatted.combined,
    });
    navigate('/worship-video');
  };

  const actionDisabled = !result || blockingMessages.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">{t.title}</h2>
          <p className="text-sm text-slate-400">{t.subtitle}</p>
        </div>
        <ClearCurrentButton
          onClick={handleClearCurrentContent}
          disabled={loading || downloading}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />
      <div
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? 'border-gold-400 bg-gold-500/10' : 'border-slate-600 bg-slate-800/60'
        }`}
      >
        <p className="text-white font-medium">{loading ? t.importing : t.drop}</p>
        <p className="text-xs text-slate-400 mt-2">{t.limit}</p>
        <div className="flex justify-center gap-3 mt-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-gold-600 hover:bg-gold-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
          >
            {result ? t.replace : t.choose}
          </button>
          {result && (
            <button
              type="button"
              onClick={handleClearCurrentContent}
              className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm text-slate-200"
            >
              {t.clear}
            </button>
          )}
        </div>
        {result && <p className="text-xs text-green-300 mt-3">{result.source_filename}</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      {result && (
        <>
          <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">{t.metadata}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm text-slate-300">
                {t.number}
                <input value={result.song_number} onChange={(e) => updateSongNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <div />
              <label className="text-sm text-slate-300">
                {t.titleZh}
                <input value={result.title_zh} onChange={(e) => updateResult('title_zh', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                {t.titleEn}
                <input value={result.title_en} onChange={(e) => updateResult('title_en', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                {t.collectionZh}
                <input value={result.collection_zh} onChange={(e) => updateResult('collection_zh', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                {t.collectionEn}
                <input value={result.collection_en} onChange={(e) => updateResult('collection_en', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white" />
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{t.review}</h3>
              <p className="text-xs text-slate-400 mt-1">{t.reviewHint}</p>
            </div>
            {result.sections.map((section, index) => {
              const label = section.kind === 'chorus' ? t.chorus : t.verse(section.number);
              return (
                <div key={section.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
                  <h4 className="font-semibold text-gold-300 mb-3">{label}</h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <label className="text-xs text-slate-400">
                      {t.zhLyrics}
                      <textarea value={section.zh_lines.join('\n')} onChange={(e) => updateLines(index, 'zh_lines', e.target.value)} rows={Math.max(4, section.zh_lines.length)} className="mt-1 w-full resize-y rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-white" />
                    </label>
                    <label className="text-xs text-slate-400">
                      {t.enLyrics}
                      <textarea value={section.en_lines.join('\n')} onChange={(e) => updateLines(index, 'en_lines', e.target.value)} rows={Math.max(4, section.en_lines.length)} className="mt-1 w-full resize-y rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-white" />
                    </label>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
            <h3 className="text-sm font-medium text-slate-300 mb-3">{t.sequence}</h3>
            <div className="flex flex-wrap gap-2">
              {formatted.sequence.map((id, index) => (
                <span key={`${id}-${index}`} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-200">
                  {id === 'chorus' ? t.chorus : t.verse(Number(id.split('-')[1]))}
                </span>
              ))}
            </div>
          </section>

          {blockingMessages.length > 0 && (
            <div className="rounded-lg border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
              <ul className="list-disc pl-5 space-y-1">
                {blockingMessages.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={actionDisabled} onClick={() => void handleCopy()} className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white">
              {copied ? t.copied : t.copy}
            </button>
            <button type="button" disabled={actionDisabled || downloading} onClick={() => void handleDownload()} className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white">
              {downloading ? t.downloading : t.download}
            </button>
            <button type="button" disabled={actionDisabled} onClick={handleSendSlides} className="rounded-lg bg-gold-600 hover:bg-gold-500 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white">
              {t.sendSlides}
            </button>
            <button type="button" disabled={actionDisabled} onClick={handleSendVideo} className="rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white">
              {t.sendVideo}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
