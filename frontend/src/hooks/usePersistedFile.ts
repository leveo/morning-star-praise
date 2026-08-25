// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useCallback, useEffect, useState } from 'react';

const DB_NAME = 'morning-star-drafts';
const STORE_NAME = 'files';

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFile(key: string): Promise<File | null> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result instanceof File ? request.result : null);
    request.onerror = () => reject(request.error);
    request.transaction?.addEventListener('complete', () => db.close());
  });
}

async function writeFile(key: string, file: File | null): Promise<void> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    if (file) store.put(file, key);
    else store.delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/** Persist a user-selected File across route changes and page reloads. */
export function usePersistedFile(
  key: string,
): [File | null, (file: File | null) => void, boolean] {
  const [file, setFileState] = useState<File | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readFile(key)
      .then((stored) => {
        if (!cancelled) setFileState(stored);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setFile = useCallback((next: File | null) => {
    setFileState(next);
    void writeFile(key, next).catch(() => {});
  }, [key]);

  return [file, setFile, loaded];
}
