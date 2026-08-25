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
    parseStatus: '解析状态',
    ready: '已自动通过',
    confirmed: '已人工确认',
    needsConfirmation: '需要人工确认',
    confidence: '置信度',
    coverage: '原文归类',
    candidates: '候选版式',
    evidence: '判断依据',
    unresolved: '未归类原文',
    unresolvedHint: '请选择归属，或明确标记为非歌词；系统不会静默丢弃这些文字。',
    target: '归入',
    language: '语言',
    assign: '归入歌词',
    ignore: '标记为非歌词',
    location: 'Word 位置',
    addVerse: '添加 Verse',
    addChorus: '添加副歌',
    remove: '删除',
    confirm: '确认分段',
    confirmationRequired: '请先解决未归类内容并点击“确认分段”。',
    legacyDraft: '这是旧版解析草稿，请重新选择原 DOCX，以生成来源证据后再输出。',
    zhLyrics: '中文歌词',
    enLyrics: '英文歌词',
    amenZh: '中文 Amen / 尾句（只在最后输出一次）',
    amenEn: '英文 Amen / 尾句（只在最后输出一次）',
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
    nonConsecutive: 'Verse 编号必须从 1 开始连续排列。',
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
    parseStatus: 'Parse status',
    ready: 'Automatically approved',
    confirmed: 'Manually confirmed',
    needsConfirmation: 'Manual confirmation required',
    confidence: 'Confidence',
    coverage: 'Source classified',
    candidates: 'Layout candidates',
    evidence: 'Evidence',
    unresolved: 'Unclassified source text',
    unresolvedHint: 'Assign each fragment or explicitly mark it as non-lyric. Nothing is silently dropped.',
    target: 'Assign to',
    language: 'Language',
    assign: 'Assign to lyrics',
    ignore: 'Mark as non-lyric',
    location: 'Word location',
    addVerse: 'Add verse',
    addChorus: 'Add chorus',
    remove: 'Delete',
    confirm: 'Confirm sections',
    confirmationRequired: 'Resolve unclassified text and confirm the section structure first.',
    legacyDraft: 'This is a legacy parse draft. Re-select the source DOCX to create source evidence before output.',
    zhLyrics: 'Chinese lyrics',
    enLyrics: 'English lyrics',
    amenZh: 'Chinese Amen / ending (output once at the end)',
    amenEn: 'English Amen / ending (output once at the end)',
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
    nonConsecutive: 'Verse numbers must be consecutive from 1.',
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
  const endingZh = [...sections].reverse().find((section) => section.amen_zh)?.amen_zh;
  const endingEn = [...sections].reverse().find((section) => section.amen_en)?.amen_en;
  const withAmen = (section: DocxLyricsSection, index: number) => {
    const isFinal = index === expanded.length - 1;
    return {
      zh: [...section.zh_lines, ...(isFinal && endingZh ? [endingZh] : [])],
      en: [...section.en_lines, ...(isFinal && endingEn ? [endingEn] : [])],
    };
  };
  return {
    sequence: expanded.map((section) => section.id),
    primary: expanded.map((section, index) => withAmen(section, index).zh.join('\n').trim()).filter(Boolean).join('\n\n'),
    secondary: expanded.map((section, index) => withAmen(section, index).en.join('\n').trim()).filter(Boolean).join('\n\n'),
    combined: expanded
      .map((section, index) => {
        const lines = withAmen(section, index);
        return [...lines.zh, ...lines.en].join('\n').trim();
      })
      .filter(Boolean)
      .join('\n\n'),
  };
}

function layoutLabel(kind: DocxLyricsImport['layout_kind'], language: 'zh' | 'en') {
  const labels = {
    language_blocks: { zh: '中英文整块', en: 'Language blocks' },
    stanza_interleaved: { zh: '逐节中英', en: 'Bilingual stanzas' },
    line_interleaved: { zh: '逐行中英', en: 'Bilingual lines' },
    table_columns: { zh: '表格双栏', en: 'Table columns' },
  };
  return labels[kind][language];
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
  const [fragmentAssignments, setFragmentAssignments] = useState<Record<
    string,
    { sectionId: string; language: 'zh' | 'en' }
  >>({});

  const formatted = useMemo(
    () => formatSections(result?.sections ?? []),
    [result?.sections],
  );
  const legacyResult = Boolean(result && !Array.isArray(result.candidate_layouts));
  const candidateLayouts = result?.candidate_layouts ?? [];
  const unresolvedFragments = result?.unresolved_fragments ?? [];

  const blockingMessages = useMemo(() => {
    if (!result) return [];
    const messages: string[] = [];
    if (!result.song_number.trim()) messages.push(t.missingNumber);
    if (!result.title_zh.trim()) messages.push(t.missingTitleZh);
    if (!result.title_en.trim()) messages.push(t.missingTitleEn);
    const verses = result.sections.filter((section) => section.kind === 'verse');
    if (verses.length === 0) messages.push(t.missingVerses);
    const verseNumbers = verses.map((section) => section.number);
    if (verseNumbers.some((number, index) => number !== index + 1)) {
      messages.push(t.nonConsecutive);
    }
    for (const section of result.sections) {
      const label = section.kind === 'chorus' ? t.chorus : t.verse(section.number);
      if (!section.zh_lines.some((line) => line.trim())) messages.push(t.missingZh(label));
      if (!section.en_lines.some((line) => line.trim())) messages.push(t.missingEn(label));
    }
    return messages;
  }, [result, t]);

  const reviewBlocked = Boolean(
    result && (
      legacyResult
      || unresolvedFragments.length > 0
      || (result.requires_confirmation && !result.review_confirmed)
    )
  );

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
      setFragmentAssignments({});
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

  const updateEnding = (index: number, field: 'amen_zh' | 'amen_en', value: string) => {
    setResult((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section, sectionIndex) => (
          sectionIndex === index ? { ...section, [field]: value || null } : section
        )),
      };
    });
  };

  const markStructureChanged = (sections: DocxLyricsSection[]) => {
    setResult((current) => current ? {
      ...current,
      sections,
      requires_confirmation: true,
      review_confirmed: false,
      has_blocking_errors: true,
    } : current);
  };

  const selectCandidate = (candidateId: string) => {
    setResult((current) => {
      if (!current) return current;
      const candidate = (current.candidate_layouts ?? []).find((item) => item.id === candidateId);
      if (!candidate) return current;
      return {
        ...current,
        layout_kind: candidate.layout_kind,
        confidence: candidate.confidence,
        sections: candidate.sections,
        sequence: candidate.sequence,
        unresolved_fragments: candidate.unresolved_fragments,
        classified_fragment_count: candidate.classified_fragment_count,
        total_fragment_count: candidate.total_fragment_count,
        ignored_fragment_ids: [],
        requires_confirmation: true,
        review_confirmed: false,
        has_blocking_errors: true,
      };
    });
    setFragmentAssignments({});
  };

  const addVerse = () => {
    if (!result) return;
    const verseCount = result.sections.filter((section) => section.kind === 'verse').length;
    const chorus = result.sections.find((section) => section.kind === 'chorus');
    const verses = result.sections.filter((section) => section.kind === 'verse');
    const section: DocxLyricsSection = {
      id: `verse-${verseCount + 1}`,
      kind: 'verse',
      number: verseCount + 1,
      zh_lines: [],
      en_lines: [],
      source_fragment_ids: [],
      amen_zh: null,
      amen_en: null,
    };
    markStructureChanged([...verses, section, ...(chorus ? [chorus] : [])]);
  };

  const addChorus = () => {
    if (!result || result.sections.some((section) => section.kind === 'chorus')) return;
    markStructureChanged([...result.sections, {
      id: 'chorus',
      kind: 'chorus',
      number: null,
      zh_lines: [],
      en_lines: [],
      source_fragment_ids: [],
      amen_zh: null,
      amen_en: null,
    }]);
  };

  const deleteSection = (index: number) => {
    if (!result) return;
    const remaining = result.sections.filter((_, sectionIndex) => sectionIndex !== index);
    let verse = 0;
    const renumbered = remaining.map((section) => {
      if (section.kind === 'chorus') return section;
      verse += 1;
      return { ...section, id: `verse-${verse}`, number: verse };
    });
    markStructureChanged(renumbered);
  };

  const resolveFragment = (fragmentId: string, ignore: boolean) => {
    setResult((current) => {
      if (!current) return current;
      const fragment = (current.unresolved_fragments ?? []).find((item) => item.id === fragmentId);
      if (!fragment) return current;
      const fallbackSection = current.sections[0]?.id;
      const assignment = fragmentAssignments[fragmentId] ?? {
        sectionId: fallbackSection,
        language: fragment.language_guess === 'en' ? 'en' : 'zh',
      };
      if (!ignore && !assignment.sectionId) return current;
      const sections = ignore ? current.sections : current.sections.map((section) => {
        if (section.id !== assignment.sectionId) return section;
        const field = assignment.language === 'zh' ? 'zh_lines' : 'en_lines';
        return {
          ...section,
          [field]: [...section[field], fragment.text],
          source_fragment_ids: [...section.source_fragment_ids, fragment.id],
        };
      });
      return {
        ...current,
        sections,
        unresolved_fragments: (current.unresolved_fragments ?? []).filter((item) => item.id !== fragmentId),
        ignored_fragment_ids: ignore
          ? [...(current.ignored_fragment_ids ?? []), fragmentId]
          : (current.ignored_fragment_ids ?? []),
        classified_fragment_count: Math.min(
          current.total_fragment_count,
          current.classified_fragment_count + 1,
        ),
        requires_confirmation: true,
        review_confirmed: false,
        has_blocking_errors: true,
      };
    });
  };

  const confirmSections = () => {
    if (!result || legacyResult || blockingMessages.length > 0 || unresolvedFragments.length > 0) return;
    setResult((current) => current ? {
      ...current,
      review_confirmed: true,
      has_blocking_errors: false,
    } : current);
  };

  const handleCopy = async () => {
    if (!result || blockingMessages.length > 0 || reviewBlocked) return;
    try {
      await navigator.clipboard.writeText(formatted.combined);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t.copyFailed);
    }
  };

  const handleDownload = async () => {
    if (!result || blockingMessages.length > 0 || reviewBlocked) return;
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
    if (!result || blockingMessages.length > 0 || reviewBlocked) return;
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
    if (!result || blockingMessages.length > 0 || reviewBlocked) return;
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

  const actionDisabled = !result || blockingMessages.length > 0 || reviewBlocked;

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
          <section className={`rounded-xl border p-5 ${
            reviewBlocked
              ? 'border-amber-700 bg-amber-950/25'
              : 'border-green-700 bg-green-950/20'
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{t.parseStatus}</h3>
                <p className={`mt-1 text-sm ${reviewBlocked ? 'text-amber-200' : 'text-green-200'}`}>
                  {result.review_confirmed
                    ? t.confirmed
                    : (legacyResult || result.requires_confirmation) ? t.needsConfirmation : t.ready}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <span className="text-slate-400">{t.confidence}</span>
                <span className="text-right text-white">
                  {legacyResult ? '—' : `${Math.round(result.confidence * 100)}%`}
                </span>
                <span className="text-slate-400">{t.coverage}</span>
                <span className="text-right text-white">
                  {result.classified_fragment_count ?? 0}/{result.total_fragment_count ?? 0}
                </span>
              </div>
            </div>

            {candidateLayouts.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-medium text-slate-300">{t.candidates}</h4>
                <div className="mt-2 grid gap-3 lg:grid-cols-2">
                  {candidateLayouts.map((candidate) => {
                    const selected = candidate.layout_kind === result.layout_kind
                      && candidate.confidence === result.confidence;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => selectCandidate(candidate.id)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? 'border-gold-500 bg-gold-500/10'
                            : 'border-slate-700 bg-slate-900/50 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-white">
                            {layoutLabel(candidate.layout_kind, uiLanguage)}
                          </span>
                          <span className="text-xs text-slate-300">
                            {Math.round(candidate.confidence * 100)}%
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          {t.evidence}: {candidate.reasons.join('；')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

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

          {unresolvedFragments.length > 0 && (
            <section className="rounded-xl border border-red-800 bg-red-950/25 p-5">
              <h3 className="text-lg font-semibold text-red-100">{t.unresolved}</h3>
              <p className="mt-1 text-xs text-red-200/80">{t.unresolvedHint}</p>
              <div className="mt-4 space-y-3">
                {unresolvedFragments.map((fragment) => {
                  const fallbackSection = result.sections[0]?.id ?? '';
                  const assignment = fragmentAssignments[fragment.id] ?? {
                    sectionId: fallbackSection,
                    language: fragment.language_guess === 'en' ? 'en' as const : 'zh' as const,
                  };
                  return (
                    <div key={fragment.id} className="rounded-lg border border-red-900/80 bg-slate-950/60 p-4">
                      <p className="whitespace-pre-wrap text-sm text-white">{fragment.text}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {fragment.reason} · {t.location}: {fragment.location}
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="text-xs text-slate-400">
                          {t.target}
                          <select
                            value={assignment.sectionId}
                            onChange={(event) => setFragmentAssignments((current) => ({
                              ...current,
                              [fragment.id]: { ...assignment, sectionId: event.target.value },
                            }))}
                            className="mt-1 block rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                          >
                            {result.sections.map((section) => (
                              <option key={section.id} value={section.id}>
                                {section.kind === 'chorus' ? t.chorus : t.verse(section.number)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs text-slate-400">
                          {t.language}
                          <select
                            value={assignment.language}
                            onChange={(event) => setFragmentAssignments((current) => ({
                              ...current,
                              [fragment.id]: {
                                ...assignment,
                                language: event.target.value as 'zh' | 'en',
                              },
                            }))}
                            className="mt-1 block rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                          >
                            <option value="zh">中文</option>
                            <option value="en">English</option>
                          </select>
                        </label>
                        <button type="button" onClick={() => resolveFragment(fragment.id, false)} className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white hover:bg-red-600">
                          {t.assign}
                        </button>
                        <button type="button" onClick={() => resolveFragment(fragment.id, true)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                          {t.ignore}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{t.review}</h3>
              <p className="text-xs text-slate-400 mt-1">{t.reviewHint}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={addVerse} className="rounded-lg bg-slate-700 px-3 py-2 text-xs text-white hover:bg-slate-600">
                  {t.addVerse}
                </button>
                {!result.sections.some((section) => section.kind === 'chorus') && (
                  <button type="button" onClick={addChorus} className="rounded-lg bg-slate-700 px-3 py-2 text-xs text-white hover:bg-slate-600">
                    {t.addChorus}
                  </button>
                )}
              </div>
            </div>
            {result.sections.map((section, index) => {
              const label = section.kind === 'chorus' ? t.chorus : t.verse(section.number);
              return (
                <div key={section.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-gold-300">{label}</h4>
                    <button type="button" onClick={() => deleteSection(index)} className="text-xs text-red-300 hover:text-red-200">
                      {t.remove}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <label className="text-xs text-slate-400">
                      {t.zhLyrics}
                      <textarea value={section.zh_lines.join('\n')} onChange={(e) => updateLines(index, 'zh_lines', e.target.value)} rows={Math.max(4, section.zh_lines.length)} className="mt-1 w-full resize-y rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-white" />
                      <span className="mt-2 block">{t.amenZh}</span>
                      <input value={section.amen_zh ?? ''} onChange={(e) => updateEnding(index, 'amen_zh', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
                    </label>
                    <label className="text-xs text-slate-400">
                      {t.enLyrics}
                      <textarea value={section.en_lines.join('\n')} onChange={(e) => updateLines(index, 'en_lines', e.target.value)} rows={Math.max(4, section.en_lines.length)} className="mt-1 w-full resize-y rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-white" />
                      <span className="mt-2 block">{t.amenEn}</span>
                      <input value={section.amen_en ?? ''} onChange={(e) => updateEnding(index, 'amen_en', e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
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

          {reviewBlocked && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-700 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
              <span>{legacyResult ? t.legacyDraft : t.confirmationRequired}</span>
              <button
                type="button"
                disabled={legacyResult || blockingMessages.length > 0 || unresolvedFragments.length > 0}
                onClick={confirmSections}
                className="rounded-lg bg-amber-700 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-40"
              >
                {t.confirm}
              </button>
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
