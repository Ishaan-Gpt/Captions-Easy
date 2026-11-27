"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, Float32Array>();
const MAX_BYTES = 300 * 1024 * 1024;
export const PEAKS_PER_SECOND = 50;

/**
 * Audio peaks for the timeline, decoded in the browser (WebAudio) from the playable video URL.
 * Cached per video; skipped for very large files so the editor never stalls. Returns null while loading.
 */
export function useWaveform(videoId: string | null | undefined, url: string | null | undefined, sizeBytes: number | null | undefined) {
  // the result of decoding, for the video it belongs to; finished peaks come from the cache
  const [done, setDone] = useState<{ id: string; peaks: Float32Array | null } | null>(null);
  const tooBig = !!sizeBytes && sizeBytes > MAX_BYTES;

  useEffect(() => {
    if (!videoId || !url || cache.has(videoId) || tooBig) return;
    let alive = true;
    const ac = new AbortController();
    (async () => {
      const buf = await (await fetch(url, { signal: ac.signal })).arrayBuffer();
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      try {
        const audio = await ctx.decodeAudioData(buf);
        const ch = audio.getChannelData(0);
        const n = Math.max(1, Math.ceil(audio.duration * PEAKS_PER_SECOND));
        const step = Math.max(1, Math.floor(ch.length / n));
        const out = new Float32Array(n);
        let max = 0;
        for (let i = 0; i < n; i++) {
          let peak = 0;
          const end = Math.min(ch.length, (i + 1) * step);
          for (let j = i * step; j < end; j += 4) {
            const v = Math.abs(ch[j]!);
            if (v > peak) peak = v;
          }
          out[i] = peak;
          if (peak > max) max = peak;
        }
        if (max > 0) for (let i = 0; i < n; i++) out[i] = out[i]! / max;
        cache.set(videoId, out);
        if (alive) setDone({ id: videoId, peaks: out });
      } finally {
        void ctx.close();
      }
    })().catch(() => alive && setDone({ id: videoId, peaks: null }));
    return () => {
      alive = false;
      ac.abort();
    };
  }, [videoId, url, tooBig]);

  const cached = videoId ? cache.get(videoId) : undefined;
  if (cached) return { peaks: cached, state: "ready" as const };
  if (!videoId || !url) return { peaks: null, state: "idle" as const };
  if (tooBig) return { peaks: null, state: "unavailable" as const };
  if (done?.id === videoId) return done.peaks ? { peaks: done.peaks, state: "ready" as const } : { peaks: null, state: "unavailable" as const };
  return { peaks: null, state: "loading" as const };
}
