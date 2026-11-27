"use client";

import { useEffect, useState } from "react";

export interface FilmFrame {
  /** media time this frame shows */
  ms: number;
  /** small JPEG data URL */
  src: string;
}

const cache = new Map<string, FilmFrame[]>();
const THUMB_H = 72;

/**
 * Thumbnails along the video for the timeline's video track (like pro editors). Decoded in the browser from the
 * playable URL: one hidden <video>, seeked frame by frame, drawn into a small canvas. Cached per video.
 * Returns [] while loading or when the browser cannot decode the file (the track then shows a plain bar).
 */
export function useFilmstrip(videoId: string | null | undefined, url: string | null | undefined, durationMs: number): FilmFrame[] {
  // frames decoded so far, for the video they belong to; a finished strip comes from the cache
  const [live, setLive] = useState<{ id: string; frames: FilmFrame[] } | null>(null);

  useEffect(() => {
    if (!videoId || !url || durationMs <= 0 || cache.has(videoId)) return;
    let alive = true;
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    v.src = url;

    const seek = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("seek timeout")), 8000);
        v.onseeked = () => { clearTimeout(t); resolve(); };
        v.onerror = () => { clearTimeout(t); reject(new Error("decode error")); };
        v.currentTime = ms / 1000;
      });

    (async () => {
      await new Promise<void>((resolve, reject) => {
        if (v.readyState >= 1) return resolve();
        v.onloadedmetadata = () => resolve();
        v.onerror = () => reject(new Error("load error"));
      });
      const w = Math.max(1, Math.round((v.videoWidth / Math.max(1, v.videoHeight)) * THUMB_H));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = THUMB_H;
      const g = c.getContext("2d")!;
      // about one frame per second of video, between 8 and 48 frames
      const n = Math.max(8, Math.min(48, Math.round(durationMs / 1000)));
      const out: FilmFrame[] = [];
      for (let i = 0; i < n && alive; i++) {
        const ms = Math.min(durationMs - 50, ((i + 0.5) / n) * durationMs);
        await seek(ms);
        g.drawImage(v, 0, 0, w, THUMB_H);
        out.push({ ms, src: c.toDataURL("image/jpeg", 0.72) });
        // show frames as they arrive, a few at a time
        if (alive && (i % 6 === 5 || i === n - 1)) setLive({ id: videoId, frames: [...out] });
      }
      if (alive) cache.set(videoId, out);
    })().catch(() => undefined);

    return () => {
      alive = false;
      v.removeAttribute("src");
      v.load();
    };
  }, [videoId, url, durationMs]);

  if (!videoId) return NO_FRAMES;
  return cache.get(videoId) ?? (live?.id === videoId ? live.frames : NO_FRAMES);
}

const NO_FRAMES: FilmFrame[] = [];
