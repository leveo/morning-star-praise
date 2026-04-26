// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Leo Song
import { useEffect, useState } from 'react';
import SlidePreview from './SlidePreview';
import UsageBadge from '../shared/UsageBadge';
import type { BackgroundInfo } from '../../types';
import { getBackgrounds, type UsageSummary } from '../../api/client';
import { useUILanguage, UI_TEXT } from '../../hooks/useLanguage';

interface SlidePreviewData {
  text: string;
  background_url: string;
  sheet_image_url?: string;
}

interface Props {
  title: string;
  slides: SlidePreviewData[];
  filename: string;
  onDownload: () => void;
  onSlidesChange?: (slides: SlidePreviewData[]) => void;
  showPageNumbers?: boolean;
  usage?: UsageSummary | null;
  primaryFontSize?: number;
  secondaryFontSize?: number;
  lineSpacingMultiplier?: number;
  language?: string;
}

export default function SlideDeck({
  title,
  slides,
  filename,
  onDownload,
  onSlidesChange,
  showPageNumbers,
  usage,
  primaryFontSize,
  secondaryFontSize,
  lineSpacingMultiplier,
  language,
}: Props) {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].slideDeck;
  const [backgrounds, setBackgrounds] = useState<BackgroundInfo[]>([]);

  useEffect(() => {
    getBackgrounds().then(setBackgrounds);
  }, []);

  if (slides.length === 0) return null;

  const handleBackgroundChange = (index: number, newUrl: string) => {
    const updated = slides.map((s, i) =>
      i === index ? { ...s, background_url: newUrl } : s
    );
    onSlidesChange?.(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {t.preview(slides.length)}
          </h3>
          <p className="text-xs text-slate-500">{t.clickToChangeHint}</p>
        </div>
        {filename && (
          <div className="flex items-center gap-3">
            <UsageBadge usage={usage ?? null} showWhenEmpty />
            <button
              onClick={onDownload}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t.downloadButton}
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {slides.map((slide, i) => (
          <SlidePreview
            key={i}
            text={slide.text}
            backgroundUrl={slide.background_url}
            sheetImageUrl={slide.sheet_image_url}
            index={i}
            totalSlides={slides.length}
            showPageNumber={showPageNumbers}
            availableBackgrounds={backgrounds}
            onBackgroundChange={onSlidesChange ? handleBackgroundChange : undefined}
            primaryFontSize={primaryFontSize}
            secondaryFontSize={secondaryFontSize}
            lineSpacingMultiplier={lineSpacingMultiplier}
            language={language}
          />
        ))}
      </div>
    </div>
  );
}
