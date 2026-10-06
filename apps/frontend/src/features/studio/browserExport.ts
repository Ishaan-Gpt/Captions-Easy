"use client";

import type React from "react";
import { CaptionedVideo, type CaptionedVideoInput } from "@capseasy/compositions";

/**
 * MP4 export without the Companion: the SAME composition the preview shows, rendered frame by frame in this tab
 * (@remotion/web-renderer: WebCodecs + Mediabunny), then downloaded. Nothing is uploaded.
 */

export interface BrowserExportJob {
  input: CaptionedVideoInput;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  /** output size factor (e.g. 720/1080); 1 = original */
  scale?: number;
  range?: { startMs: number; endMs: number };
  quality: "high" | "balanced" | "small";
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

const LICENSE = process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY || "free-license";
const QUALITY = { high: "very-high", balanced: "high", small: "medium" } as const;

/** Can this browser encode H.264 MP4 at this size? (Chrome, Edge, Safari 17+, recent Firefox.) */
export async function canExportInBrowser(width: number, height: number): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined" || typeof VideoEncoder === "undefined") return { ok: false, reason: "This browser can't encode video. Use Chrome, Edge or Safari." };
  try {
    const { canRenderMediaOnWeb } = await import("@remotion/web-renderer");
    const r = await canRenderMediaOnWeb({ container: "mp4", videoCodec: "h264", width, height });
    return r.canRender ? { ok: true } : { ok: false, reason: r.issues.map((i) => i.message).join(" ") || "Not supported in this browser." };
  } catch {
    return { ok: true }; // the render itself reports real problems
  }
}

export async function exportMp4InBrowser(job: BrowserExportJob): Promise<Blob> {
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  const durationInFrames = Math.max(1, Math.ceil((job.durationMs / 1000) * job.fps));
  const frame = (ms: number) => Math.min(durationInFrames - 1, Math.max(0, Math.round((ms / 1000) * job.fps)));
  const result = await renderMediaOnWeb({
    composition: {
      id: "CaptionedVideo",
      component: CaptionedVideo as unknown as React.ComponentType<Record<string, unknown>>,
      width: job.width,
      height: job.height,
      fps: job.fps,
      durationInFrames,
    },
    inputProps: { ...job.input, videoEngine: "media" } as Record<string, unknown>,
    container: "mp4",
    videoCodec: "h264",
    videoBitrate: QUALITY[job.quality],
    scale: job.scale ?? 1,
    frameRange: job.range ? [frame(job.range.startMs), frame(job.range.endMs)] : null,
    signal: job.signal ?? null,
    onProgress: (p) => job.onProgress?.(p.progress),
    licenseKey: LICENSE,
    isProduction: process.env.NODE_ENV === "production",
    delayRenderTimeoutInMilliseconds: 60_000,
  });
  return result.getBlob();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
