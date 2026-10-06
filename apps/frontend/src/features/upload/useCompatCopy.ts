"use client";

import { useEffect, useState } from "react";
import { getCompat, getLocalVideo, saveCompat } from "./localVideos";
import { makeCompatCopy } from "./compatCopy";

export type CompatState = "none" | "preparing" | "ready" | "failed";

/**
 * For a video the browser can play but not read frame by frame: makes (once) the copy MP4 export needs.
 * `go` holds it back until captioning has finished, so the two never fight for the processor.
 */
export function useCompatCopy(videoId: string | null, needed: boolean, go: boolean) {
  const [state, setState] = useState<CompatState>("none");
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId || !needed || !go) return;
    let alive = true;
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    void (async () => {
      const have = await getCompat(videoId);
      if (have) {
        objectUrl = URL.createObjectURL(have);
        if (alive) { setUrl(objectUrl); setState("ready"); }
        return;
      }
      const src = await getLocalVideo(videoId);
      if (!src || !alive) return;
      setState("preparing");
      try {
        const out = await makeCompatCopy(src, { onProgress: (f) => alive && setProgress(f), signal: ctrl.signal });
        if (!alive) return;
        if (!out) return setState("failed");
        await saveCompat(videoId, out);
        objectUrl = URL.createObjectURL(out);
        setUrl(objectUrl);
        setState("ready");
      } catch {
        if (alive) setState("failed");
      }
    })();
    return () => {
      alive = false;
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [videoId, needed, go]);

  return { state: needed ? state : ("none" as CompatState), progress, url };
}
