// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song

export interface WordLyricsToSlidesPayload {
  title: string;
  titleEn?: string;
  collectionZh?: string;
  collectionEn?: string;
  primaryLyrics: string;
  secondaryLyrics: string;
}

export interface WordLyricsToVideoPayload {
  title: string;
  titleEn?: string;
  collectionZh?: string;
  collectionEn?: string;
  combinedLyrics: string;
}

export interface SharedWordLyricsDraft {
  title: string;
  titleEn: string;
  collectionZh: string;
  collectionEn: string;
  primaryLyrics: string;
  secondaryLyrics: string;
  combinedLyrics: string;
}

const TO_SLIDES_KEY = 'app.wordLyricsToSlides';
const TO_VIDEO_KEY = 'app.wordLyricsToVideo';
const SHARED_DRAFT_KEY = 'app.wordLyricsSharedDraft';

function readStoredString(key: string): string {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return '';
    const value = JSON.parse(raw);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function consume<T>(key: string): T | null {
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  window.sessionStorage.removeItem(key);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function slidesDraftExists(): boolean {
  return Boolean(
    readStoredString('lyrics.title').trim()
      || readStoredString('lyrics.lyrics').trim()
      || readStoredString('lyrics.translatedLyrics').trim(),
  );
}

export function videoDraftExists(): boolean {
  return Boolean(
    readStoredString('worshipVideo.title').trim()
      || readStoredString('worshipVideo.lyrics').trim(),
  );
}

export function sendToSlides(payload: WordLyricsToSlidesPayload): void {
  window.sessionStorage.setItem(TO_SLIDES_KEY, JSON.stringify(payload));
}

export function sendToVideo(payload: WordLyricsToVideoPayload): void {
  window.sessionStorage.setItem(TO_VIDEO_KEY, JSON.stringify(payload));
}

export function consumeSlidesHandoff(): WordLyricsToSlidesPayload | null {
  return consume<WordLyricsToSlidesPayload>(TO_SLIDES_KEY);
}

export function consumeVideoHandoff(): WordLyricsToVideoPayload | null {
  return consume<WordLyricsToVideoPayload>(TO_VIDEO_KEY);
}

export function saveWordLyricsDraft(payload: SharedWordLyricsDraft): void {
  window.sessionStorage.setItem(SHARED_DRAFT_KEY, JSON.stringify(payload));
}

export function readWordLyricsDraft(): SharedWordLyricsDraft | null {
  const raw = window.sessionStorage.getItem(SHARED_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SharedWordLyricsDraft;
  } catch {
    return null;
  }
}

export function wordLyricsDraftSignature(payload: SharedWordLyricsDraft): string {
  const serialized = JSON.stringify(payload);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function clearWordLyricsDraft(): void {
  window.sessionStorage.removeItem(SHARED_DRAFT_KEY);
}
