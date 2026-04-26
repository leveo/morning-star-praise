// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Leo Song
import { useEffect } from 'react';

/** Protocol: SongsLibraryPage writes a JSON payload to sessionStorage under
 *  ``app.resumeSnapshot.<source_page>`` before navigating. The target page
 *  reads it on mount, hydrates form state, and clears the key so the same
 *  payload doesn't get re-applied on the next reload. */
export const RESUME_KEY_PREFIX = 'app.resumeSnapshot.';

export interface ResumePayload<S = Record<string, unknown>> {
  snapshot: S;
  source_page: string;
  analysis_id: string | null;
  analysis_exists: boolean;
  filename: string | null;
}

/** Run ``apply`` with the resume payload if one was left for this page, then
 *  clear the sessionStorage key so reloads don't re-apply. No-op if no payload
 *  is present. The callback runs exactly once per mount. */
export function useResumeSnapshot<S = Record<string, unknown>>(
  sourcePage: string,
  apply: (payload: ResumePayload<S>) => void,
): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = RESUME_KEY_PREFIX + sourcePage;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return;
    window.sessionStorage.removeItem(key);
    try {
      const parsed = JSON.parse(raw) as ResumePayload<S>;
      apply(parsed);
    } catch {
      /* ignore corrupt payload */
    }
    // Intentionally run once — apply is a closure over page state; we don't
    // want to re-run it when state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
