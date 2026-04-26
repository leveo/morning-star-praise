// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useUILanguage, UI_TEXT } from '../../hooks/useLanguage';

interface Props {
  primaryFontSize: number | null;
  setPrimaryFontSize: (n: number | null) => void;
  secondaryFontSize: number | null;
  setSecondaryFontSize: (n: number | null) => void;
  lineSpacing: number | null;
  setLineSpacing: (n: number | null) => void;
  /** Set to true when the song carries a translation line — otherwise
   *  the secondary-size picker is hidden to declutter the settings bar. */
  showSecondary?: boolean;
}

const PRIMARY_CHOICES = [28, 32, 36, 40, 44, 48, 52, 56, 60];
const SECONDARY_CHOICES = [14, 16, 18, 20, 24, 28];
const SPACING_CHOICES = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0];

export default function FontSettings({
  primaryFontSize,
  setPrimaryFontSize,
  secondaryFontSize,
  setSecondaryFontSize,
  lineSpacing,
  setLineSpacing,
  showSecondary = true,
}: Props) {
  const [uiLanguage] = useUILanguage();
  const t = UI_TEXT[uiLanguage].fontSettings;
  const selectClass =
    'bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white';
  return (
    <>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400">{t.primarySize}</label>
        <select
          value={primaryFontSize ?? 0}
          onChange={(e) => setPrimaryFontSize(Number(e.target.value) || null)}
          className={selectClass}
        >
          <option value={0}>{t.auto}</option>
          {PRIMARY_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n}pt
            </option>
          ))}
        </select>
      </div>
      {showSecondary && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">{t.secondarySize}</label>
          <select
            value={secondaryFontSize ?? 0}
            onChange={(e) => setSecondaryFontSize(Number(e.target.value) || null)}
            className={selectClass}
          >
            <option value={0}>{t.auto}</option>
            {SECONDARY_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}pt
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400">{t.lineSpacing}</label>
        <select
          value={lineSpacing ?? 0}
          onChange={(e) => setLineSpacing(Number(e.target.value) || null)}
          className={selectClass}
        >
          <option value={0}>{t.auto}</option>
          {SPACING_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n.toFixed(1)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
