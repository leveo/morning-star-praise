import { usePersistedState } from './usePersistedState';

export type UILanguage = 'zh' | 'en';

/** UI language for the menu bar, footer, and legal pages. Defaults to
 *  Chinese and is persisted across tab switches / reloads. The value is
 *  independent of the song-language controls inside each page. */
export function useUILanguage() {
  return usePersistedState<UILanguage>('app.uiLanguage', 'zh');
}

export type ResourceEntry = {
  name: string;
  url: string;
  category: string;
  blurb: string;
  searchHints?: string;
};

/** All user-visible titles / headings / descriptions that aren't form
 *  labels. Keep the structure parallel across languages so the call sites
 *  can do ``UI_TEXT[uiLanguage].ocr.title`` without defensive checks. */
type TextDict = {
  lyrics: {
    backgrounds: string;
  };
  ocr: {
    title: string;
    subtitle: string;
    backgrounds: string;
  };
  youtube: {
    title: string;
    urlLabel: string;
    urlPlaceholder: string;
    extract: string;
    extracting: string;
    modeLyrics: string;
    modeFrames: string;
    modeLyricsTime: string;
    modeFramesTime: string;
    modeLyricsBlurb: string;
    modeFramesBlurb: string;
    pros: string;
    cons: string;
    lyricsPros: string[];
    lyricsCons: string[];
    framesPros: string[];
    framesCons: string[];
    framesTip: string;
    sopHintPrefix: string;
    sopHintLink: string;
    sopHintSuffix: string;
    songTitlePlaceholder: string;
    composerPlaceholder: string;
    maxLines: string;
    maxChars: string;
    reparse: (n: number) => string;
    parsedSlides: (n: number) => string;
    backgrounds: string;
    generating: string;
    generatePpt: string;
    generatePptWithCount: (n: number) => string;
    framesSelectedOf: (sel: number, total: number) => string;
    framesInstructions: string;
    framesRemoved: string;
  };
  worshipVideo: {
    title: string;
    subtitle: string;
    backgrounds: string;
    analyzedSlidesHeading: (n: number) => string;
    videoReady: string;
    audioLabel: string;
    chooseAudio: string;
    changeAudio: string;
    songTitle: string;
    songTitlePlaceholder: string;
    composer: string;
    composerPlaceholder: string;
    audioLanguageLabel: string;
    audioLanguageAuto: string;
    audioLanguageZh: string;
    audioLanguageEn: string;
    lyricsSource: string;
    sourcePaste: string;
    sourcePptx: string;
    sourceImage: string;
    sourceYoutube: string;
    choosePptx: string;
    chooseImage: string;
    changeFile: string;
    extractLyrics: string;
    extracting: string;
    lyricsLabel: string;
    lyricsLabelExtractNote: string;
    lyricsPlaceholderPaste: string;
    lyricsPlaceholderExtracted: string;
    usePptBackgrounds: (n: number) => string;
    pptBgsNote: string;
    maxLines: string;
    maxChars: string;
    karaoke: string;
    karaokeHint: string;
    pageNumber: string;
    analyzing: string;
    analyzedHint: (n: number) => string;
    analyzeAudio: string;
    analyzeDescription: string;
    stanzaTag: (i: number) => string;
    stanzaOccurrences: (n: number) => string;
    inputsChangedWarning: string;
    starting: string;
    generating: string;
    generateVideo: string;
    analyzeToEnable: string;
    firstRunHint: string;
    downloadMp4: string;
    downloadSrt: string;
    editVideo: string;
    closeEditor: string;
    newVideo: string;
  };
  songs: {
    title: string;
    searchPlaceholder: string;
    searchButton: string;
  };
  templates: {
    title: string;
    createNew: string;
  };
  slideDeck: {
    preview: (n: number) => string;
    clickToChangeHint: string;
    downloadButton: string;
  };
  backgroundPicker: {
    description: string;
    type: string;
    typeAll: string;
    typeStatic: string;
    typeMotion: string;
    tags: string;
    clear: string;
    showing: (shown: number, total: number) => string;
    willInheritTagsPrefix: string;
    upload: (max: number) => string;
    uploading: (cur: number, total: number) => string;
    motionTag: string;
    uploadErrorTooMany: (selected: number, max: number) => string;
    loading: string;
  };
  freeBackgroundResources: {
    heading: string;
    subheading: string;
    tip: string;
    tryPrefix: string;
    resources: ResourceEntry[];
  };
};

// --- Shared resource list (English). The per-language override below only
// translates the category + blurb text; URL/name stay in Latin.
const RESOURCES_EN: ResourceEntry[] = [
  {
    name: 'Unsplash',
    url: 'https://unsplash.com',
    category: 'General photo library — CC0',
    blurb:
      'Top-quality artistic photography. Look for shots with large solid or blurred areas so lyrics overlay cleanly.',
    searchHints: 'minimalist blue · abstract texture · sky clouds · soft light',
  },
  {
    name: 'Pexels',
    url: 'https://www.pexels.com',
    category: 'Photos + free videos — CC0',
    blurb:
      'Massive library of high-quality photos and free motion clips. Use the videos for dynamic backgrounds.',
    searchHints: 'calm water · aurora · blur background',
  },
  {
    name: 'Pixabay',
    url: 'https://pixabay.com',
    category: 'Photos + vectors + illustrations — CC0',
    blurb:
      'The widest variety: photos, vectors, illustrations. Search supports Chinese, but English keywords return higher-quality natural / abstract results.',
  },
  {
    name: 'CMG Create',
    url: 'https://cmgcreate.com',
    category: 'Worship-specific stills — free section',
    blurb:
      'Church Motion Graphics. The Free Still Backgrounds area is purpose-built for worship lyrics: gradients, dark tones, geometric, clean nature. The dark/blue palette is ideal for projection.',
  },
  {
    name: 'Church Media Drop',
    url: 'https://churchmediadrop.com',
    category: 'Community-shared church media',
    blurb:
      'Free sermon series art, backgrounds, and short countdown videos contributed by the global church creative community. Modern flat-design feel.',
  },
  {
    name: 'CreationSwap',
    url: 'https://creationswap.com',
    category: 'Christian media library — has free filter',
    blurb:
      'Mixed paid/free Christian media. Filter by "Free" to see worship backgrounds and seasonal designs (Easter, Christmas, etc.).',
  },
];

const RESOURCES_ZH: ResourceEntry[] = [
  {
    name: 'Unsplash',
    url: 'https://unsplash.com',
    category: '综合图片库 — CC0 免授权',
    blurb:
      '高品质艺术摄影。挑选带大面积纯色或虚化区域的作品，在上面叠加歌词最干净。',
    searchHints: '极简蓝色 · 抽象纹理 · 天空云彩 · 柔光',
  },
  {
    name: 'Pexels',
    url: 'https://www.pexels.com',
    category: '图片 + 免费视频 — CC0',
    blurb:
      '海量高品质图片及免费动态短片，视频适合用作动态背景。',
    searchHints: '平静水面 · 极光 · 虚化背景',
  },
  {
    name: 'Pixabay',
    url: 'https://pixabay.com',
    category: '图片 + 矢量 + 插画 — CC0',
    blurb:
      '类型最全：图片、矢量、插画都有。支持中文搜索，但英文关键词通常会返回更高质量的自然 / 抽象类结果。',
  },
  {
    name: 'CMG Create',
    url: 'https://cmgcreate.com',
    category: '敬拜专属静态背景 — 免费区',
    blurb:
      'Church Motion Graphics，免费静态背景区专为敬拜歌词排版设计：渐变、深色调、几何、干净自然景色。深色/蓝色调尤其适合教会投影。',
  },
  {
    name: 'Church Media Drop',
    url: 'https://churchmediadrop.com',
    category: '教会媒体资源共享社区',
    blurb:
      '来自全球教会创作者社群贡献的免费讲道系列设计、背景图和倒计时短片，整体风格偏现代扁平化。',
  },
  {
    name: 'CreationSwap',
    url: 'https://creationswap.com',
    category: '基督教媒体库 — 可筛选免费',
    blurb:
      '付费与免费混合的基督教媒体库，筛选 "Free" 即可看到敬拜背景与节期主题设计（复活节、圣诞节等）。',
  },
];

export const UI_TEXT: Record<UILanguage, TextDict> = {
  zh: {
    lyrics: {
      backgrounds: '背景',
    },
    ocr: {
      title: '乐谱识别',
      subtitle: '上传乐谱图片或 PDF，使用 AI 自动提取歌词。',
      backgrounds: '背景',
    },
    youtube: {
      title: 'YouTube 歌词提取',
      urlLabel: 'YouTube 网址',
      urlPlaceholder: 'https://youtube.com/watch?v=...',
      extract: '提取',
      extracting: '提取中…',
      modeLyrics: '字幕模式',
      modeFrames: '截图模式',
      modeLyricsTime: '约 5 秒',
      modeFramesTime: '约 3-5 分钟',
      modeLyricsBlurb:
        '从 YouTube 字幕（手动或自动生成）提取歌词，之后可以自选背景与排版。',
      modeFramesBlurb:
        '下载视频并对每一张歌词画面截图，由 AI 过滤过渡帧、保留完整的歌词画面。',
      pros: '优点：',
      cons: '缺点：',
      lyricsPros: [
        '非常快（几秒钟）',
        '背景和排版可完全自定义',
        '只要视频有字幕就可用',
        '无 AI 费用',
      ],
      lyricsCons: [
        '自动字幕可能有错漏',
        '不保留原视频的风格',
        '需要视频已经上了字幕',
      ],
      framesPros: [
        '保留原视频的背景风格',
        '不依赖字幕',
        '适合每句一张静态背景图的视频',
      ],
      framesCons: [
        '耗时数分钟（视频下载 + AI 分析）',
        '会消耗 AI credits（Gemini Vision 逐帧分析)',
        '动态 / 动画背景会影响准确度',
      ],
      framesTip:
        '提示：最适合"每一页歌词对应一张静态背景图"的视频。动态 / 动画背景可能会产生多余或模糊的帧。',
      sopHintPrefix: '赞美之泉',
      sopHintLink: '提供官方 PowerPoint 下载',
      sopHintSuffix: '，可以直接从这里获取。',
      songTitlePlaceholder: '歌曲标题…',
      composerPlaceholder: '作曲者…',
      maxLines: '每张最多行数',
      maxChars: '每行最多字符',
      reparse: (n) => `重新解析（${n} 张）`,
      parsedSlides: (n) => `已解析：${n} 张 slide`,
      backgrounds: '背景',
      generating: '生成中…',
      generatePpt: '生成 PPT',
      generatePptWithCount: (n) => `生成 PPT（${n} 张）`,
      framesSelectedOf: (sel, total) => `已选 ${sel} / ${total} 帧`,
      framesInstructions:
        '点击不想要的帧取消选择，选中的帧会成为 PPT 的 slide。',
      framesRemoved: '已移除',
    },
    worshipVideo: {
      title: '敬拜视频生成',
      subtitle:
        '上传 MP3 与歌词（可粘贴、.pptx 或乐谱图片）。系统用 Whisper large-v3 将歌词对齐到音频，然后渲染一个 1920×1080 的 MP4，并附带独立的 SRT 字幕文件。',
      backgrounds: '背景',
      analyzedSlidesHeading: (n) => `${n} 张 slide · 按音频顺序`,
      videoReady: '视频已就绪',
      audioLabel: '音频文件（MP3 / WAV / M4A / FLAC / OGG，最大 50 MB）',
      chooseAudio: '选择音频',
      changeAudio: '更换音频',
      songTitle: '歌曲标题',
      songTitlePlaceholder: '歌曲标题…',
      composer: '作曲 / 作词',
      composerPlaceholder: '作曲者…',
      audioLanguageLabel: '音频语言',
      audioLanguageAuto: '自动识别',
      audioLanguageZh: '中文',
      audioLanguageEn: '英文',
      lyricsSource: '歌词来源',
      sourcePaste: '粘贴',
      sourcePptx: '.pptx / .ppt',
      sourceImage: '图片 / PDF',
      sourceYoutube: 'YouTube',
      choosePptx: '选择 .pptx / .ppt',
      chooseImage: '选择图片 / PDF',
      changeFile: '更换文件',
      extractLyrics: '提取歌词',
      extracting: '提取中…',
      lyricsLabel: '歌词',
      lyricsLabelExtractNote: '（提取后可编辑）',
      lyricsPlaceholderPaste: '在此粘贴歌词，用空行分隔 verse / chorus。',
      lyricsPlaceholderExtracted: '提取完成后歌词会显示在这里，可任意编辑。',
      usePptBackgrounds: (n) => `使用 PPT 幻灯片背景（已提取 ${n} 张）`,
      pptBgsNote:
        'slide 会按顺序循环使用这些背景。取消勾选可改用默认背景库。',
      maxLines: '每张最多行数',
      maxChars: '每行最多字符',
      karaoke: '卡拉 OK 模式',
      karaokeHint: '（逐字高亮）',
      pageNumber: '页码',
      analyzing: '正在分析音频（转录中 + 匹配段落）…',
      analyzedHint: (n) => `✓ 已分析 — ${n} 张 slide（按音频顺序）。可重新分析`,
      analyzeAudio: '分析音频',
      analyzeDescription:
        '分析会对音频进行转录，检测每段（含重复的副歌）在音频中被唱的位置，并按实际演唱顺序展开歌词。',
      stanzaTag: (i) => `第 ${i + 1} 段`,
      stanzaOccurrences: (n) => ` · ${n} 段出现`,
      inputsChangedWarning: '输入已更改 — 请重新分析后再生成',
      starting: '提交中…',
      generating: '生成中…',
      generateVideo: '生成视频',
      analyzeToEnable: '请先在上方分析音频',
      firstRunHint:
        '首次运行会下载 Whisper large-v3 模型（约 3 GB），可能需要几分钟。',
      downloadMp4: '下载 MP4',
      downloadSrt: '下载 SRT',
      editVideo: '编辑视频',
      closeEditor: '关闭编辑器',
      newVideo: '重新制作',
    },
    songs: {
      title: '诗歌库',
      searchPlaceholder: '搜索歌曲…',
      searchButton: '搜索',
    },
    templates: {
      title: 'PPT 模板',
      createNew: '新建模板',
    },
    slideDeck: {
      preview: (n) => `预览（${n} 张 slide）`,
      clickToChangeHint: '点击某张 slide 可更换背景',
      downloadButton: '下载 PPT',
    },
    backgroundPicker: {
      description:
        '选择作为 slide 循环背景的素材。留空则使用所有符合筛选条件的背景。',
      type: '类型',
      typeAll: '全部',
      typeStatic: '静态',
      typeMotion: '动态',
      tags: '标签',
      clear: '清除',
      showing: (shown, total) => `显示 ${shown} / ${total}`,
      willInheritTagsPrefix: ' — 新上传的背景会继承标签 ',
      upload: (max) => `上传（最多 ${max}）`,
      uploading: (cur, total) => `上传中 ${cur}/${total}…`,
      motionTag: '动态',
      uploadErrorTooMany: (selected, max) =>
        `已选择 ${selected} 个文件，仅会上传前 ${max} 个。`,
      loading: '背景加载中…',
    },
    freeBackgroundResources: {
      heading: '寻找更多背景',
      subheading: '以下都是免费、可商用的资源站，下载后可以直接上传到这里使用。',
      tip: '提示：上传前先在上方选好标签，下载上传的背景会自动继承这些标签。',
      tryPrefix: '搜索词：',
      resources: RESOURCES_ZH,
    },
  },
  en: {
    lyrics: {
      backgrounds: 'Backgrounds',
    },
    ocr: {
      title: 'Sheet Music OCR',
      subtitle: 'Upload a sheet music image or PDF to extract lyrics using AI.',
      backgrounds: 'Backgrounds',
    },
    youtube: {
      title: 'YouTube Lyrics',
      urlLabel: 'YouTube URL',
      urlPlaceholder: 'https://youtube.com/watch?v=...',
      extract: 'Extract',
      extracting: 'Extracting...',
      modeLyrics: 'Subtitle Mode',
      modeFrames: 'Screenshot Mode',
      modeLyricsTime: '~5 seconds',
      modeFramesTime: '~3-5 minutes',
      modeLyricsBlurb:
        'Extracts lyrics from YouTube subtitles (manual or auto-generated). You can then choose your own backgrounds and customize the layout.',
      modeFramesBlurb:
        'Downloads the video and captures screenshots of each lyrics slide. Uses AI to filter out transitions and keep only clean, complete lyrics frames.',
      pros: 'Pros:',
      cons: 'Cons:',
      lyricsPros: [
        'Very fast (a few seconds)',
        'Full control over backgrounds and layout',
        'Works with any video that has subtitles',
        'No AI cost',
      ],
      lyricsCons: [
        'Auto-generated subtitles may have errors',
        'Does not preserve the original video style',
        'Requires subtitles to be available on the video',
      ],
      framesPros: [
        'Preserves the original video background style',
        'No subtitle dependency',
        'Best for static background videos (one image per slide)',
      ],
      framesCons: [
        'Takes several minutes (video download + AI analysis)',
        'Costs AI credits (Gemini Vision per frame)',
        'Animated/dynamic backgrounds reduce accuracy',
      ],
      framesTip:
        'Tip: Works best when the video has static backgrounds (one image per lyrics page). Dynamic/animated backgrounds may produce extra or blurry frames.',
      sopHintPrefix: 'Stream of Praise (赞美之泉)',
      sopHintLink: 'provides free official PowerPoint files',
      sopHintSuffix: ' for their songs — you can download them directly.',
      songTitlePlaceholder: 'Song title...',
      composerPlaceholder: 'Composer...',
      maxLines: 'Max lines/slide',
      maxChars: 'Max chars/row',
      reparse: (n) => `Re-parse (${n} slides)`,
      parsedSlides: (n) => `Parsed: ${n} slides`,
      backgrounds: 'Backgrounds',
      generating: 'Generating...',
      generatePpt: 'Generate PPT',
      generatePptWithCount: (n) => `Generate PPT (${n} slides)`,
      framesSelectedOf: (sel, total) => `${sel} / ${total} frames selected`,
      framesInstructions:
        'Click to deselect unwanted frames. Selected frames become PPT slides.',
      framesRemoved: 'Removed',
    },
    worshipVideo: {
      title: 'Worship Video Maker',
      subtitle:
        'Upload an MP3 plus the lyrics (paste, .pptx, or sheet music image). Whisper large-v3 aligns them to the audio, then a 1920x1080 MP4 is rendered with full-screen captions (plus a separate SRT file).',
      backgrounds: 'Backgrounds',
      analyzedSlidesHeading: (n) => `${n} slides · audio order`,
      videoReady: 'Video ready',
      audioLabel: 'Audio file (MP3 / WAV / M4A / FLAC / OGG, max 50 MB)',
      chooseAudio: 'Choose audio',
      changeAudio: 'Change audio',
      songTitle: 'Song Title',
      songTitlePlaceholder: 'Song title...',
      composer: 'Composer',
      composerPlaceholder: 'Composer...',
      audioLanguageLabel: 'Audio language',
      audioLanguageAuto: 'Auto-detect',
      audioLanguageZh: '中文',
      audioLanguageEn: 'English',
      lyricsSource: 'Lyrics source',
      sourcePaste: 'Paste',
      sourcePptx: '.pptx / .ppt',
      sourceImage: 'Image / PDF',
      sourceYoutube: 'YouTube',
      choosePptx: 'Choose .pptx / .ppt',
      chooseImage: 'Choose image / PDF',
      changeFile: 'Change file',
      extractLyrics: 'Extract lyrics',
      extracting: 'Extracting...',
      lyricsLabel: 'Lyrics',
      lyricsLabelExtractNote: '(editable after extract)',
      lyricsPlaceholderPaste:
        'Paste lyrics here. Use blank lines to separate verses.',
      lyricsPlaceholderExtracted:
        'Lyrics will appear here after extraction. Edit freely.',
      usePptBackgrounds: (n) => `Use PPT slide backgrounds (${n} extracted)`,
      pptBgsNote:
        'Backgrounds cycle across slides in order. Uncheck to pick from the default library instead.',
      maxLines: 'Max lines/slide',
      maxChars: 'Max chars/row',
      karaoke: 'Karaoke mode',
      karaokeHint: '(word-by-word color highlight)',
      pageNumber: 'Page #',
      analyzing: 'Analyzing audio (transcribing + matching stanzas)…',
      analyzedHint: (n) =>
        `✓ Analyzed — ${n} slides in audio order. Re-run to update`,
      analyzeAudio: 'Analyze Audio',
      analyzeDescription:
        'Analyze transcribes the audio, detects which stanzas are sung (including repeats), and expands the lyrics into the exact order the song uses.',
      stanzaTag: (i) => `Stanza ${i + 1}`,
      stanzaOccurrences: (n) => ` · ${n} stanza${n === 1 ? '' : ' occurrences'}`,
      inputsChangedWarning: 'Inputs changed — re-analyze before generating',
      starting: 'Starting…',
      generating: 'Generating…',
      generateVideo: 'Generate Video',
      analyzeToEnable: 'Analyze audio above to enable Generate',
      firstRunHint:
        'First run downloads the Whisper large-v3 model (~3 GB) — this can take several minutes.',
      downloadMp4: 'Download MP4',
      downloadSrt: 'Download SRT',
      editVideo: 'Edit Video',
      closeEditor: 'Close editor',
      newVideo: 'New video',
    },
    songs: {
      title: 'Songs Library',
      searchPlaceholder: 'Search songs...',
      searchButton: 'Search',
    },
    templates: {
      title: 'PPT Templates',
      createNew: 'Create New Template',
    },
    slideDeck: {
      preview: (n) => `Preview (${n} slides)`,
      clickToChangeHint: 'Click a slide to change its background',
      downloadButton: 'Download PPT',
    },
    backgroundPicker: {
      description:
        'Select backgrounds (slides cycle through selected). Leave empty to use all matching the filter.',
      type: 'Type',
      typeAll: 'All',
      typeStatic: 'Static',
      typeMotion: 'Motion',
      tags: 'Tags',
      clear: 'Clear',
      showing: (shown, total) => `Showing ${shown} of ${total}`,
      willInheritTagsPrefix: ' — new uploads will be tagged ',
      upload: (max) => `Upload (max ${max})`,
      uploading: (cur, total) => `Uploading ${cur}/${total}…`,
      motionTag: 'MOTION',
      uploadErrorTooMany: (selected, max) =>
        `Selected ${selected} files; only the first ${max} will be uploaded.`,
      loading: 'Loading backgrounds...',
    },
    freeBackgroundResources: {
      heading: 'Find more backgrounds',
      subheading:
        'Free, royalty-free sources you can download from and upload here.',
      tip: 'Tip: select tag chips above before uploading — your downloads will inherit those tags automatically.',
      tryPrefix: 'Try: ',
      resources: RESOURCES_EN,
    },
  },
};
