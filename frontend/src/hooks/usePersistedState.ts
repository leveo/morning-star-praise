import { useEffect, useRef, useState } from 'react';

/**
 * Drop-in replacement for `useState` that mirrors the value to `sessionStorage`
 * so it survives unmount/remount from route changes. Tab switches (navigating
 * between LyricsPage / YouTubePage / etc.) unmount the leaving page and React
 * would otherwise lose every `useState` value — this hook keeps it.
 *
 * Values are JSON-serialized, so only JSON-safe data fits (strings, numbers,
 * arrays of primitives, plain objects). `File` / `Blob` / Date can't be
 * persisted; keep those in plain `useState`.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // corrupt value — fall back to default
    }
    return defaultValue;
  });

  // Skip the first write so we don't immediately overwrite a fresh load.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // quota exceeded or private-mode restriction — ignore
    }
  }, [key, state]);

  return [state, setState];
}
