import { useState } from 'react';
import type { BackgroundInfo } from '../../types';

// PPT slide is 7.5 inches tall × 72 pt/inch = 540pt. A font rendered at
// N points occupies N/540 of the slide's height. Tailwind v4's @container
// uses ``container-type: inline-size`` (width-based), so we convert the
// height-ratio into a width-ratio via the locked 16:9 aspect ratio:
//   font_px / width_px = (font_pt / 540) * (9 / 16)
// Expressed as cqi (container-query inline-size) it's multiplied by 100.
const SLIDE_HEIGHT_POINTS = 540;
const ASPECT_H_OVER_W = 9 / 16;
const fontPtToCqi = (pt: number) => (pt / SLIDE_HEIGHT_POINTS) * ASPECT_H_OVER_W * 100;

interface Props {
  text: string;
  backgroundUrl: string;
  index: number;
  totalSlides?: number;
  showPageNumber?: boolean;
  availableBackgrounds?: BackgroundInfo[];
  onBackgroundChange?: (index: number, newUrl: string) => void;
  /** Primary font size in Points (same unit the PPT uses). */
  primaryFontSize?: number;
  /** Secondary (translation) font size in Points. */
  secondaryFontSize?: number;
  /** Line spacing multiplier (1.3 english default, 1.5 chinese default). */
  lineSpacingMultiplier?: number;
  /** Primary language of the song — decides which lines are secondary. */
  language?: string;
}

const CJK_RE = /[\u4e00-\u9fff]/;
const hasChinese = (s: string) => CJK_RE.test(s);

/** Classify each non-blank line as primary or secondary using the same
 *  heuristic as ``ppt_service._add_text_with_overlay``. */
function classifyLines(text: string, language: string): ('primary' | 'secondary' | 'spacer')[] {
  const lines = text.split('\n');
  const isZhSong = language.startsWith('zh') || lines.some(hasChinese);

  const sections = text.split('\n\n');
  const isStacked = sections.length >= 2;

  const nonBlank = lines.filter((l) => l.trim() !== '');
  let isInterleaved = false;
  if (!isStacked && nonBlank.length >= 2) {
    const langs = nonBlank.map(hasChinese);
    isInterleaved = langs.every((_, i) => i === 0 || langs[i] !== langs[i - 1]);
  }

  const firstLineIsZh = nonBlank[0] ? hasChinese(nonBlank[0]) : isZhSong;

  const result: ('primary' | 'secondary' | 'spacer')[] = [];
  let inSecondary = false;
  for (const line of lines) {
    if (line === '') {
      if (isStacked) inSecondary = true;
      result.push('spacer');
      continue;
    }
    if (isStacked && inSecondary) {
      result.push('secondary');
    } else if (isInterleaved && hasChinese(line) !== firstLineIsZh) {
      result.push('secondary');
    } else {
      result.push('primary');
    }
  }
  return result;
}

export default function SlidePreview({
  text,
  backgroundUrl,
  index,
  totalSlides,
  showPageNumber,
  availableBackgrounds,
  onBackgroundChange,
  primaryFontSize,
  secondaryFontSize,
  lineSpacingMultiplier,
  language = 'en',
}: Props) {
  const [showPicker, setShowPicker] = useState(false);

  const isZh = language.startsWith('zh') || hasChinese(text);
  const primaryPt = primaryFontSize ?? (isZh ? 40 : 36);
  const secondaryPt = secondaryFontSize ?? Math.max(Math.round(primaryPt * 0.5), 16);
  const spacingMult = lineSpacingMultiplier ?? (isZh ? 1.5 : 1.3);
  const primaryCqi = fontPtToCqi(primaryPt);
  const secondaryCqi = fontPtToCqi(secondaryPt);

  const categories = classifyLines(text, language);
  const lines = text.split('\n');

  return (
    <div className="relative">
      <div
        className="@container relative aspect-video rounded-lg overflow-hidden shadow-lg border border-slate-700 group cursor-pointer"
        onClick={() => onBackgroundChange && setShowPicker(!showPicker)}
      >
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* 0.5 inch pad on all sides — same 40% black overlay as the PPT. */}
        <div className="absolute inset-[6.67%] bg-black/40" />
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-0.5 text-xs text-slate-300 z-10">
          {index + 1}
        </div>
        {showPageNumber && totalSlides && (
          <div className="absolute top-2 right-2 bg-black/60 rounded px-2 py-0.5 text-xs text-slate-400 z-10">
            {index + 1}/{totalSlides}
          </div>
        )}
        <div
          className="absolute inset-[6.67%] flex items-center justify-center text-center text-white drop-shadow-lg"
          style={{ padding: '2.5%' }}
        >
          <div className="w-full">
            {lines.map((line, i) => {
              const cat = categories[i];
              if (cat === 'spacer') {
                return (
                  <div
                    key={i}
                    aria-hidden
                    style={{ height: `${primaryCqi * 0.2}cqi` }}
                  />
                );
              }
              const sizeCqi = cat === 'secondary' ? secondaryCqi : primaryCqi;
              return (
                <div
                  key={i}
                  style={{
                    fontSize: `${sizeCqi}cqi`,
                    lineHeight: spacingMult,
                    fontWeight: cat === 'secondary' ? 400 : 700,
                    color: cat === 'secondary' ? '#dcdcdc' : '#ffffff',
                  }}
                >
                  {line || '\u00A0'}
                </div>
              );
            })}
          </div>
        </div>
        {onBackgroundChange && (
          <div className="absolute bottom-2 right-2 bg-black/70 rounded px-2 py-1 text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            Click to change BG
          </div>
        )}
      </div>

      {showPicker && availableBackgrounds && onBackgroundChange && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg p-2 shadow-xl max-h-[22rem] overflow-y-auto">
          <div className="grid grid-cols-4 gap-1">
            {availableBackgrounds.map((bg) => (
              <button
                key={bg.id}
                onClick={() => {
                  onBackgroundChange(index, bg.url);
                  setShowPicker(false);
                }}
                className={`aspect-video rounded overflow-hidden border transition-all ${
                  backgroundUrl === bg.url
                    ? 'border-gold-500 ring-1 ring-gold-500/50'
                    : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <img src={bg.url} alt={bg.name} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
