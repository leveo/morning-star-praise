// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useUILanguage } from '../../hooks/useLanguage';

interface Props {
  onClick: () => void;
  disabled?: boolean;
}

export default function ClearCurrentButton({ onClick, disabled = false }: Props) {
  const [uiLanguage] = useUILanguage();
  const label = uiLanguage === 'zh' ? '清除当前内容' : 'Clear current content';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-red-800/80 bg-red-950/30 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:border-red-700 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-40"
      title={label}
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
      </svg>
      {label}
    </button>
  );
}
