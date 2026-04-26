// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
export interface SlideData {
  text: string;
  background_id?: number | null;
  background_url?: string | null;
  font_size?: number | null;
}

export interface BackgroundInfo {
  id: number;
  filename: string;
  name: string;
  category: string;
  url: string;
  is_default: boolean;
  tags?: string[];
  media_type?: 'image' | 'video';
}

export interface LyricsParseResponse {
  slides: SlideData[];
  total_slides: number;
}

export interface PPTGenerateResponse {
  filename: string;
  slides_preview: { text: string; background_url: string }[];
}
