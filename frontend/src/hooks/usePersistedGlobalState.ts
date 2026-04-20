import { useCallback, useEffect, useState } from 'react';

/** Factory for a localStorage-backed value that stays in sync across all
 *  mounted readers in the same tab (via a custom event) AND across tabs
 *  (via the browser's ``storage`` event).
 *
 *  Consumers get three things:
 *    - ``useValue()``: subscribe to current value
 *    - ``useEditor()``: same + { save, reset }
 *    - ``read()``: non-hook snapshot (for axios interceptors etc.)
 *
 *  Factory-defaults are merged onto the stored object so adding a new field
 *  later doesn't leave existing users with ``undefined`` slots. */
export function createPersistedGlobalState<T extends object>(opts: {
  storageKey: string;
  eventName: string;
  factoryDefaults: T;
}) {
  const { storageKey, eventName, factoryDefaults } = opts;

  function read(): T {
    if (typeof window === 'undefined') return factoryDefaults;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return factoryDefaults;
      const parsed = JSON.parse(raw) as Partial<T>;
      return { ...factoryDefaults, ...parsed };
    } catch {
      return factoryDefaults;
    }
  }

  function useValue(): T {
    const [value, setValue] = useState<T>(read);
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const onCustomEvent = () => setValue(read());
      // Filter cross-tab events to our key, and bail if the JSON didn't
      // actually change — saves a tree-wide re-render on unrelated writes.
      const onStorage = (e: StorageEvent) => {
        if (e.key !== null && e.key !== storageKey) return;
        setValue((prev) => {
          const next = read();
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
      };
      window.addEventListener(eventName, onCustomEvent);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(eventName, onCustomEvent);
        window.removeEventListener('storage', onStorage);
      };
    }, []);
    return value;
  }

  function useEditor() {
    const value = useValue();
    const save = useCallback((next: T) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event(eventName));
    }, []);
    const reset = useCallback(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(storageKey);
      window.dispatchEvent(new Event(eventName));
    }, []);
    return { value, save, reset };
  }

  return { read, useValue, useEditor };
}
