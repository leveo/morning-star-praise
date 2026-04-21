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
  sheet: {
    heading: string;
    description: string;
    dropHere: string;
    uploading: string;
    analyzing: string;
    analyzeTip: string;
    detected: (systems: number) => string;
    noStaffsDetected: string;
    reupload: string;
    clear: string;
    chunkPreview: (idx: number) => string;
  };
  lyrics: {
    backgrounds: string;
    songTitle: string;
    songTitlePlaceholder: string;
    composer: string;
    composerPlaceholder: string;
    outputLanguage: string;
    translating: string;
    translationAdded: string;
    addTranslation: string;
    modeInterleaved: string;
    modeStacked: string;
    lyricsLabel: string;
    loadSample: string;
    originalLyrics: string;
    lyricsPlaceholder: string;
    translationOf: (target: 'en' | 'zh-hans' | 'zh-hant') => string;
    translationPlaceholder: string;
    maxLines: string;
    maxChars: string;
    maxSlides: string;
    noLimit: string;
    pageNumber: string;
    previewParse: string;
    previewSlidesWithCount: (n: number) => string;
    regenerating: string;
    regenerateSlides: string;
    generating: string;
    generatePpt: string;
    errorParse: string;
    errorNeedTitle: string;
    errorNeedParse: string;
    errorGenerate: string;
    errorRegenerate: string;
    errorConvert: string;
    errorTranslate: string;
    savedToast: string;
    saveToLibrary: string;
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
  fontSettings: {
    primarySize: string;
    secondarySize: string;
    lineSpacing: string;
    auto: string;
  };
  songs: {
    title: string;
    searchPlaceholder: string;
    searchButton: string;
    description: string;
    filterAll: string;
    filterPpt: string;
    filterVideo: string;
    emptyTitle: string;
    emptyBody: string;
    dbUnavailable: string;
    download: string;
    resume: string;
    delete: string;
    deleteConfirm: string;
    fileExpired: string;
    analysisExpired: string;
  };
  templates: {
    title: string;
    createNew: string;
    description: string;
    maxLines: string;
    maxChars: string;
    maxSlides: string;
    noLimit: string;
    primaryFontSize: string;
    lineSpacing: string;
    showPageNumbers: string;
    paddingStyle: string;
    paddingStyleDark: string;
    paddingStyleLight: string;
    auto: string;
    save: string;
    saved: string;
    resetToFactory: string;
    resetConfirm: string;
    sectionDefaults: string;
    sectionLLM: string;
    llmDescription: string;
    modeAPI: string;
    modeLocal: string;
    modeAPIHint: string;
    modeLocalHint: string;
    textProvider: string;
    visionProvider: string;
    textModel: string;
    visionModel: string;
    modelPlaceholderDefault: string;
    modelsDir: string;
    modelsDirHint: string;
    modelsRefresh: string;
    modelsUnavailable: string;
    providerConfigured: string;
    providerMissingKey: string;
    howToConfigure: string;
    howToConfigureBody: (envVar: string, getKeyUrl: string) => string;
    restartRequired: string;
    noApiKeysConfigured: string;
    noApiKeysHint: string;
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
    sheet: {
      heading: '乐谱（可选）',
      description: '上传乐谱图片或 PDF。系统会按 slide 数量自动切段，每张 slide 顶部显示对应的乐谱，下方是可拖动的歌词文本框（生成后用 PowerPoint 可任意调整位置）。只支持印刷乐谱；手抄谱识别可能不准。',
      dropHere: '点击或拖入 .jpg / .png / .pdf',
      uploading: '上传中…',
      analyzing: '识别中（首次会下载 OMR 模型，约 2-3 分钟）…',
      analyzeTip: '点击"重新识别"按钮可在调整歌词段数后重跑。',
      detected: (n) => `检测到 ${n} 个五线谱系统，按 slide 分布`,
      noStaffsDetected: '未检测到五线谱——请上传更清晰、单栏排版的乐谱',
      reupload: '重新上传',
      clear: '移除乐谱',
      chunkPreview: (i) => `第 ${i + 1} 张 slide`,
    },
    lyrics: {
      backgrounds: '背景',
      songTitle: '歌曲标题',
      songTitlePlaceholder: '输入歌曲标题…',
      composer: '作曲 / 作词',
      composerPlaceholder: '作曲者…',
      outputLanguage: '输出语言',
      translating: '翻译中…',
      translationAdded: '已添加翻译',
      addTranslation: '+ 添加翻译',
      modeInterleaved: '交错',
      modeStacked: '并排',
      lyricsLabel: '歌词',
      loadSample: '加载示例',
      originalLyrics: '原文歌词',
      lyricsPlaceholder:
        '在此粘贴歌词（中文或英文），用空行分隔段落。',
      translationOf: (target) =>
        `译文（${target === 'en' ? '英文' : target === 'zh-hans' ? '简体中文' : '繁體中文'}）— 可编辑`,
      translationPlaceholder: '翻译结果会显示在这里…',
      maxLines: '每张最多行数：',
      maxChars: '每行最多字符：',
      maxSlides: '最多 slide 数：',
      noLimit: '不限',
      pageNumber: '页码',
      previewParse: '预览 slide',
      previewSlidesWithCount: (n) => `预览 slide（${n} 张）`,
      regenerating: '重新生成中…',
      regenerateSlides: '重新生成 slide',
      generating: '生成中…',
      generatePpt: '生成 PPT',
      errorParse: '解析歌词失败',
      errorNeedTitle: '请先填写歌曲标题',
      errorNeedParse: '请先解析歌词',
      errorGenerate: '生成 PPT 失败',
      errorRegenerate: '重新生成失败',
      errorConvert: '繁简转换失败',
      errorTranslate: '翻译失败',
      savedToast: '已保存到诗歌库！',
      saveToLibrary: '保存到诗歌库',
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
    fontSettings: {
      primarySize: '主字号：',
      secondarySize: '副字号：',
      lineSpacing: '行距：',
      auto: '自动',
    },
    songs: {
      title: '诗歌库',
      searchPlaceholder: '搜索标题…',
      searchButton: '搜索',
      description: '这里显示你之前生成过的 PPT 与视频。点「下载」获取原文件，点「恢复会话」回到对应页面继续编辑。',
      filterAll: '全部',
      filterPpt: 'PPT',
      filterVideo: '视频',
      emptyTitle: '还没有已生成的作品',
      emptyBody: '每次成功生成 PPT 或视频后都会自动保存到这里。',
      dbUnavailable: '诗歌库需要 Postgres 数据库（参见 README 的 Database 一节）。',
      download: '下载',
      resume: '恢复会话',
      delete: '删除',
      deleteConfirm: '确认删除这条记录？（原文件不会被删除）',
      fileExpired: '文件已过期',
      analysisExpired: '分析缓存已过期，部分编辑功能不可用',
    },
    templates: {
      title: '设置',
      createNew: '新建模板',
      description: '这里的偏好会被所有页面读取为默认值。每个页面仍可在本次会话中临时修改，下次打开新 tab 又回到这里。',
      maxLines: '每张最多行数',
      maxChars: '每行最多字符',
      maxSlides: '最多 slide 数（不含标题页）',
      noLimit: '自动（不限制）',
      primaryFontSize: '主字号（pt）',
      lineSpacing: '行距倍数',
      showPageNumbers: '页码',
      paddingStyle: '底色风格',
      paddingStyleDark: '深底白字',
      paddingStyleLight: '浅底黑字',
      auto: '自动（按语言）',
      save: '保存',
      saved: '已保存',
      resetToFactory: '恢复出厂默认',
      resetConfirm: '确认恢复出厂默认？将清除你保存的设置。',
      sectionDefaults: '默认模板',
      sectionLLM: 'LLM 配置',
      llmDescription: '切换 OCR / 翻译 / YouTube 帧分析用哪家 LLM。本地模式用 Ollama；API 模式用云端服务，需要 API key。API key 永远只存在后端的 .env，不会发送到前端。',
      modeAPI: 'API 模式（云端）',
      modeLocal: '本地模式（Ollama）',
      modeAPIHint: '为文本和视觉各选一家云端 provider。需要对应 API key 在后端 .env 里。',
      modeLocalHint: '所有 LLM 调用走本机 Ollama。零云端成本、完全离线。',
      textProvider: '文本 provider',
      visionProvider: '视觉 provider',
      textModel: '文本模型',
      visionModel: '视觉模型',
      modelPlaceholderDefault: '请选择',
      modelsDir: 'Ollama 模型目录',
      modelsDirHint: '可选：如果你把 Ollama 模型放在非默认路径（比如外接 SSD），选择目录告诉系统。留空用 Ollama 默认位置。\n默认路径 · macOS: /Users/<你的用户名>/.ollama/models   ·   Windows: C:\\Users\\<Your User Name>\\.ollama\\models',
      modelsRefresh: '刷新',
      modelsUnavailable: '未检测到运行中的 Ollama（默认 http://localhost:11434）',
      providerConfigured: '已就绪',
      providerMissingKey: '缺少 API key',
      howToConfigure: '如何配置',
      howToConfigureBody: (envVar, getKeyUrl) =>
        `1. 申请 key: ${getKeyUrl}\n2. 编辑 backend/.env，加一行：${envVar}=<你的key>\n3. 重启后端（./praise.sh 或直接 Ctrl+C 后 python run.py）`,
      restartRequired: '改完 .env 后需重启后端才生效。',
      noApiKeysConfigured: '.env 里没有任何可用的 API key，无法启用 API 模式。',
      noApiKeysHint: '在 backend/.env 里设置 OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY 等任意一个，重启后端后再回来。',
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
    sheet: {
      heading: 'Sheet Music (optional)',
      description: 'Upload a sheet music image or PDF. We detect staff systems and distribute them across your slides — each slide shows its sheet fragment up top plus a draggable lyrics textbox (you can reposition them freely in PowerPoint after generation). Printed sheets only; handwritten scores may misdetect.',
      dropHere: 'Click or drop .jpg / .png / .pdf',
      uploading: 'Uploading…',
      analyzing: 'Analyzing (first run downloads the OMR model, 2-3 min)…',
      analyzeTip: 'Click "Re-analyze" to recompute after changing lyric chunk count.',
      detected: (n) => `Detected ${n} staff systems, distributed across slides`,
      noStaffsDetected: 'No staff systems detected — try a cleaner single-column scan',
      reupload: 'Re-upload',
      clear: 'Remove sheet',
      chunkPreview: (i) => `Slide ${i + 1}`,
    },
    lyrics: {
      backgrounds: 'Backgrounds',
      songTitle: 'Song Title',
      songTitlePlaceholder: 'Enter song title...',
      composer: 'Composer',
      composerPlaceholder: 'Composer...',
      outputLanguage: 'Output Language',
      translating: 'Translating...',
      translationAdded: 'Translation Added',
      addTranslation: '+ Add Translation',
      modeInterleaved: 'Interleaved',
      modeStacked: 'Stacked',
      lyricsLabel: 'Lyrics',
      loadSample: 'Load sample',
      originalLyrics: 'Original Lyrics',
      lyricsPlaceholder:
        'Paste lyrics here (Chinese or English)... Separate sections with blank lines.',
      translationOf: (target) =>
        `Translation (${target === 'en' ? 'English' : target === 'zh-hans' ? 'Simplified Chinese' : 'Traditional Chinese'}) — editable`,
      translationPlaceholder: 'Translation will appear here...',
      maxLines: 'Max lines/slide:',
      maxChars: 'Max chars/row:',
      maxSlides: 'Max slides:',
      noLimit: 'No limit',
      pageNumber: 'Page #',
      previewParse: 'Preview Slides',
      previewSlidesWithCount: (n) => `Preview Slides (${n})`,
      regenerating: 'Regenerating...',
      regenerateSlides: 'Regenerate Slides',
      generating: 'Generating...',
      generatePpt: 'Generate PPT',
      errorParse: 'Failed to parse lyrics',
      errorNeedTitle: 'Please enter a song title',
      errorNeedParse: 'Please parse lyrics first',
      errorGenerate: 'Failed to generate PPT',
      errorRegenerate: 'Regeneration failed',
      errorConvert: 'Conversion failed',
      errorTranslate: 'Translation failed',
      savedToast: 'Song saved to library!',
      saveToLibrary: 'Save to Songs Library',
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
    fontSettings: {
      primarySize: 'Primary size:',
      secondarySize: 'Secondary size:',
      lineSpacing: 'Line spacing:',
      auto: 'Auto',
    },
    songs: {
      title: 'Songs Library',
      searchPlaceholder: 'Search title...',
      searchButton: 'Search',
      description: 'Everything you have generated: PPTs and videos. Download to grab the file, or resume to pick up where you left off in the source page.',
      filterAll: 'All',
      filterPpt: 'PPT',
      filterVideo: 'Video',
      emptyTitle: 'Nothing here yet',
      emptyBody: 'Successful PPT and video renders appear here automatically.',
      dbUnavailable: 'Songs Library requires a PostgreSQL database (see the Database section in README).',
      download: 'Download',
      resume: 'Resume',
      delete: 'Delete',
      deleteConfirm: 'Delete this library entry? (The output file is not removed.)',
      fileExpired: 'File expired',
      analysisExpired: 'Analysis cache expired — editor features limited',
    },
    templates: {
      title: 'Settings',
      createNew: 'Create New Template',
      description: 'Preferences here seed every page. Each page can still be overridden for the current session; new tabs start from these values again.',
      maxLines: 'Max lines per slide',
      maxChars: 'Max chars per row',
      maxSlides: 'Max slides (title page extra)',
      noLimit: 'Auto (no cap)',
      primaryFontSize: 'Primary font size (pt)',
      lineSpacing: 'Line spacing multiplier',
      showPageNumbers: 'Show page numbers',
      paddingStyle: 'Backdrop style',
      paddingStyleDark: 'Dark backdrop, white text',
      paddingStyleLight: 'Light backdrop, black text',
      auto: 'Auto (by language)',
      save: 'Save',
      saved: 'Saved',
      resetToFactory: 'Reset to factory defaults',
      resetConfirm: 'Reset to factory defaults? Saved settings will be cleared.',
      sectionDefaults: 'Default Template',
      sectionLLM: 'LLM Configuration',
      llmDescription: 'Pick which LLM powers OCR / translation / YouTube frame analysis. Local mode uses Ollama; API mode uses a cloud provider and needs its API key in the backend .env. API keys never leave the server.',
      modeAPI: 'API mode (cloud)',
      modeLocal: 'Local mode (Ollama)',
      modeAPIHint: 'Pick a cloud provider for text and for vision. Each needs its API key in the backend .env.',
      modeLocalHint: 'Route all LLM calls through your local Ollama. Zero cost, fully offline.',
      textProvider: 'Text provider',
      visionProvider: 'Vision provider',
      textModel: 'Text model',
      visionModel: 'Vision model',
      modelPlaceholderDefault: 'Pick one',
      modelsDir: 'Ollama models directory',
      modelsDirHint: 'Optional: if you keep Ollama models in a non-default location (e.g. external SSD), pick the folder. Leave blank for the Ollama default.\nDefault path · macOS: /Users/<Your User Name>/.ollama/models   ·   Windows: C:\\Users\\<Your User Name>\\.ollama\\models',
      modelsRefresh: 'Refresh',
      modelsUnavailable: 'No running Ollama detected (default http://localhost:11434)',
      providerConfigured: 'Ready',
      providerMissingKey: 'API key missing',
      howToConfigure: 'How to configure',
      howToConfigureBody: (envVar, getKeyUrl) =>
        `1. Get a key from: ${getKeyUrl}\n2. Edit backend/.env and add: ${envVar}=<your-key>\n3. Restart the backend (./praise.sh or Ctrl+C then python run.py)`,
      restartRequired: 'Backend restart needed after editing .env.',
      noApiKeysConfigured: 'No usable API keys in .env — API mode is unavailable.',
      noApiKeysHint: 'Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, or another provider key in backend/.env, then restart the backend.',
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
