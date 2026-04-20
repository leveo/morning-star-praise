import { createPersistedGlobalState } from './usePersistedGlobalState';

/** User-editable defaults that seed every page's slide/font settings.
 *  Lives in localStorage (survives browser close), unlike the per-page
 *  sessionStorage state which only holds the current session's tweaks. */
export type PaddingStyle = 'dark' | 'light';

export interface TemplateDefaults {
  maxLinesPerSlide: number;
  maxWidthPerRow: number;
  /** 0 = auto (no cap). */
  maxSlides: number;
  /** When true, the ``maxSlides`` cap applies to content slides only — title
   *  slide is extra. When false, ``maxSlides`` is the total including title. */
  excludeTitleSlide: boolean;
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
  maxWidthPerRow: 12,
  maxSlides: 0,
  excludeTitleSlide: true,
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
