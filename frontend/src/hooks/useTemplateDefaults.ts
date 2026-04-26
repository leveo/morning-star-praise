// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { createPersistedGlobalState } from './usePersistedGlobalState';

/** User-editable defaults that seed every page's slide/font settings.
 *  Lives in localStorage (survives browser close), unlike the per-page
 *  sessionStorage state which only holds the current session's tweaks. */
export type PaddingStyle = 'dark' | 'light';

export interface TemplateDefaults {
  maxLinesPerSlide: number;
  maxWidthPerRow: number;
  /** 0 = auto (no cap). Title slide is always extra, not counted here. */
  maxSlides: number;
  /** null means "auto by language" (40pt for zh, 36pt for en). */
  primaryFontSize: number | null;
  /** null means "auto by language" (1.5 for zh, 1.3 for en). */
  lineSpacing: number | null;
  showPageNumbers: boolean;
  /** 'dark' = current default (black semi-transparent overlay, white text);
   *  'light' = white semi-transparent overlay, black text. */
  paddingStyle: PaddingStyle;
}

export const FACTORY_TEMPLATE_DEFAULTS: TemplateDefaults = {
  maxLinesPerSlide: 6,
  maxWidthPerRow: 16,
  maxSlides: 0,
  primaryFontSize: null,
  lineSpacing: null,
  showPageNumbers: false,
  paddingStyle: 'dark',
};

const store = createPersistedGlobalState<TemplateDefaults>({
  storageKey: 'app.templateDefaults',
  eventName: 'app.templateDefaults.changed',
  factoryDefaults: FACTORY_TEMPLATE_DEFAULTS,
});

/** Read the current template defaults. Listens to cross-component updates so
 *  the Settings page Save button reflects in other mounted pages (same tab)
 *  without a reload. */
export const useTemplateDefaults = store.useValue;

/** Editor hook for the Settings page. Same reader, plus save+reset. */
export function useTemplateDefaultsEditor() {
  const { value, save, reset } = store.useEditor();
  return { template: value, save, reset };
}
