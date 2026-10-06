"use client";

import * as Sentry from "@sentry/nextjs";
import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, canEncodeVideo } from "mediabunny";
import { ensureRoomFor } from "./localVideos";

/**
 * Everything a phone or laptop needs to check BEFORE the video is saved, so a bad file never gets in and a good one
 * is never refused:
 *
 *   native player can show it           -> use the original file as it is (size doesn't matter: nothing is uploaded)
 *   can't show it, WebCodecs can decode -> convert to 720p H.264 in this tab
 *   neither, but it has sound           -> "captions only": captions are written from the audio, the picture is not shown
 *   neither and no sound                -> the one case we have to refuse
 *
 * Captions only need the audio, so an unreadable picture (10-bit HDR HEVC from a Pixel, ProRes ...) is never a reason
 * to turn a creator away.
 */

export type PreviewMode = "native" | "converted" | "captions-only";

export interface PreparedVideo {
  file: File;
  durationMs: number;
  width: number;
  height: number;
  rotation: number;
  videoCodec?: string;
  audioCodec?: string;
  hasAudio: boolean;
  /** the file was re-encoded on this device */
  converted: boolean;
  previewMode: PreviewMode;
  /** the browser can play the picture but can't read frames from it, so MP4 export needs a compatible copy made later */
  needsCompat: boolean;
}

export type PrepareStage = { stage: "check" } | { stage: "convert"; progress: number; reason: "playback" };

export class PrepareError extends Error {
  constructor(message: string, public code: "UNREADABLE" | "TOO_LONG" | "TOO_BIG" | "CANT_CONVERT") {
    super(message);
  }
}

/** Does a <video> element really show a picture for this file? (loadeddata = a frame was decoded, not just the header.) */
export function playsInThisBrowser(file: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    const done = (ok: boolean) => {
      clearTimeout(t);
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      v.load();
      resolve(ok);
    };
    // some Android builds report metadata for HEVC but never decode a frame
    v.onloadeddata = () => done(v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0);
    v.onerror = () => done(false);
    const t = setTimeout(() => done(false), 4000);
    v.src = url;
  });
}

const mp4Name = (name: string) => `${name.replace(/\.[^.]+$/, "") || "video"}.mp4`;

export async function prepareVideo(
  file: File,
  limits: { maxBytes: number; maxDurationSec: number },
  onStage: (s: PrepareStage) => void,
  signal?: AbortSignal,
): Promise<PreparedVideo> {
  onStage({ stage: "check" });
  if (file.size > limits.maxBytes) {
    throw new PrepareError(`This video is ${(file.size / 1073741824).toFixed(1)} GB, which is more than this browser can keep for editing. Trim it to a shorter clip and try again.`, "TOO_BIG");
  }
  await ensureRoomFor(file.size); // "out of space" in plain words now, not half-way through saving

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let video, audio, durationS: number;
  try {
    [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    durationS = await input.computeDuration();
  } catch {
    throw new PrepareError("We couldn't read this file. It may be damaged or not a video. Try exporting it again from your camera or editor.", "UNREADABLE");
  }
  if (!video) throw new PrepareError("This file has no video in it. Choose a video file.", "UNREADABLE");
  if (durationS > limits.maxDurationSec) {
    throw new PrepareError(`This video is ${Math.ceil(durationS / 60)} minutes long. Videos can be up to ${Math.round(limits.maxDurationSec / 60)} minutes for now. Trim it and try again.`, "TOO_LONG");
  }

  const base = {
    durationMs: Math.round(durationS * 1000),
    width: video.displayWidth,
    height: video.displayHeight,
    rotation: video.rotation,
    videoCodec: video.codec ?? undefined,
    audioCodec: audio?.codec ?? undefined,
    hasAudio: !!audio,
  };

  // everything we need to know, at the same time: the slowest check sets the pace, not their sum
  const [nativePlay, webcodecsVideo, webcodecsAudio] = await Promise.all([
    playsInThisBrowser(file),
    video.canDecode().catch(() => false),
    audio ? audio.canDecode().catch(() => false) : Promise.resolve(false),
  ]);

  if (nativePlay) return { ...base, file, converted: false, previewMode: "native", needsCompat: !webcodecsVideo };

  const diagnostics = async () => ({
    codec: video.codec,
    codecString: await video.getCodecParameterString().catch(() => null),
    colorSpace: await video.getColorSpace().catch(() => null),
    canDecodeVideo: webcodecsVideo,
    audioCodec: audio?.codec ?? null,
    canDecodeAudio: webcodecsAudio,
    nativePlay,
    width: base.width,
    height: base.height,
    rotation: base.rotation,
    sizeMb: Math.round(file.size / 1048576),
    durationS: Math.round(durationS),
  });

  // can't show the picture: captions only (needs sound), after one try at converting when the decoder can read it
  // can't show the picture: refuse with a clear next step (captions need a picture we can show and export)
  const captionsOnly = async (why: string): Promise<never> => {
    Sentry.setContext("media", await diagnostics());
    Sentry.addBreadcrumb({ category: "upload", message: `unsupported: ${why}` });
    throw new PrepareError(
      `This video's format (${base.videoCodec ?? "unknown"}) isn't supported in this browser. Please upload an MP4 (H.264) or WebM file instead. On a phone, set the camera to "Most Compatible", or export the video as MP4 first.`,
      "CANT_CONVERT",
    );
  };

  if (!webcodecsVideo || !(await canEncodeVideo("avc").catch(() => false))) return captionsOnly("no decoder or encoder");

  // convert on this device: 720p on the short edge is plenty for captions and keeps editing smooth
  onStage({ stage: "convert", progress: 0, reason: "playback" });
  const portrait = base.height >= base.width;
  const shortEdge = Math.min(base.width, base.height);
  const edge = Math.min(720, shortEdge - (shortEdge % 2));
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  try {
    const conversion = await Conversion.init({
      input,
      output,
      video: { ...(portrait ? { width: edge } : { height: edge }), codec: "avc", bitrate: 2_500_000, forceTranscode: true },
      audio: { codec: "aac", bitrate: 128_000 },
      showWarnings: false,
    });
    // a browser that can't decode the picture "converts" audio only: never keep that
    const videoDropped = conversion.discardedTracks.some((d) => d.track.type === "video") || !conversion.utilizedTracks.some((t) => t.type === "video");
    if (!conversion.isValid || videoDropped) return captionsOnly("conversion dropped the picture");
    conversion.onProgress = (p) => onStage({ stage: "convert", progress: p, reason: "playback" });
    const stop = () => void conversion.cancel();
    signal?.addEventListener("abort", stop, { once: true });
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", stop);
    }
  } catch (e) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (e instanceof PrepareError) throw e;
    return captionsOnly(`conversion failed: ${e instanceof Error ? e.message : "unknown"}`);
  }
  const buf = target.buffer;
  if (!buf || !buf.byteLength) return captionsOnly("conversion came out empty");
  const out = new File([buf], mp4Name(file.name), { type: "video/mp4" });
  const outVideo = await new Input({ source: new BlobSource(out), formats: ALL_FORMATS }).getPrimaryVideoTrack().catch(() => null);
  return {
    ...base,
    file: out,
    width: outVideo?.displayWidth ?? base.width,
    height: outVideo?.displayHeight ?? base.height,
    rotation: 0,
    videoCodec: "avc",
    audioCodec: audio ? "aac" : undefined,
    converted: true,
    previewMode: "converted",
    needsCompat: false,
  };
}
