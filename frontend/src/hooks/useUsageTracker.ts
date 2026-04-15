import { useState, useEffect, useCallback } from 'react';
import { createUsageSession, getUsage, type UsageSummary } from '../api/client';

// Global session ID shared across all pages
let globalSessionId = '';
let sessionPromise: Promise<string> | null = null;

function ensureSession(): Promise<string> {
  if (globalSessionId) return Promise.resolve(globalSessionId);
  if (!sessionPromise) {
    sessionPromise = createUsageSession().then((id) => {
      globalSessionId = id;
      return id;
    }).catch(() => '');
  }
  return sessionPromise;
}

export function useUsageTracker() {
  const [sessionId, setSessionId] = useState(globalSessionId);
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    ensureSession().then((id) => { if (id) setSessionId(id); });
  }, []);

  const refreshUsage = useCallback(async () => {
    const sid = sessionId || globalSessionId;
    if (!sid) return;
    try {
      const u = await getUsage(sid);
      setUsage(u);
    } catch {}
  }, [sessionId]);

  return { sessionId: sessionId || globalSessionId, usage, refreshUsage };
}
