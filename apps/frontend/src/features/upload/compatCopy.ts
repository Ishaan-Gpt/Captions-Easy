"use client";

import { ALL_FORMATS, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, CanvasSource, Input, Mp4OutputFormat, Output } from "mediabunny";

/**
 * A copy of a video the browser can PLAY but whose frames WebCodecs can't read (10-bit HDR HEVC from a Pixel, some
 * HEVC on Windows). MP4 export needs frames, so the original is played in a hidden <video>, each frame is drawn onto a
 * 720p canvas (which also tone-maps HDR to normal colours) and encoded to H.264; the audio is copied across.
 * It runs at the video's own speed (faster where the browser allows), after captioning so the two never fight for CPU.
 *
 * Returns null when the copy can't be made reliably (blank first frame, audio that can't be decoded): the caller then
 * offers captions-only export (SRT) instead of a broken MP4.
 */
export async function makeCompatCopy(
  file: Blob,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<Blob | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const audioTrack = await input.getPrimaryAudioTrack();
  if (audioTrack && !(await audioTrack.canDecode().catch(() => false))) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("The browser can't play this video."));
    });
    const dur = video.duration;
    const sw = video.videoWidth, sh = video.videoHeight;
    const k = Math.min(1, 720 / Math.min(sw, sh));
    const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
    const w = even(sw), h = even(sh);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: false })!;

    // a blank first frame means the picture path is protected or unsupported: don't make a black video
    ctx.drawImage(video, 0, 0, w, h);
    const probe = ctx.getImageData(0, 0, Math.min(16, w), Math.min(16, h)).data;
    let lit = 0;
    for (let i = 0; i < probe.length; i += 4) lit += probe[i]! + probe[i + 1]! + probe[i + 2]!;
    if (lit === 0 && !(await frameLooksReal(video, ctx, w, h))) return null;

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate: 2_500_000 });
    output.addVideoTrack(videoSource, { frameRate: 30 });
    const audioSource = audioTrack ? new AudioSampleSource({ codec: "aac", bitrate: 128_000 }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();

    // audio in parallel (decoding is far faster than playing the picture)
    const audioDone = (async () => {
      if (!audioTrack || !audioSource) return;
      const sink = new AudioSampleSink(audioTrack);
      for await (const s of sink.samples()) {
        await audioSource.add(s);
        s.close();
        if (opts.signal?.aborted) return;
      }
    })();

    video.playbackRate = 2;
    let last = -1;
    const abort = () => video.pause();
    opts.signal?.addEventListener("abort", abort, { once: true });
    await new Promise<void>((resolve, reject) => {
      const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number }).requestVideoFrameCallback;
      if (!rvfc) return reject(new Error("This browser can't copy video frames."));
      const pump = async (_now: number, meta: { mediaTime: number }) => {
        try {
          if (opts.signal?.aborted) return reject(new DOMException("Cancelled", "AbortError"));
          if (meta.mediaTime > last) {
            ctx.drawImage(video, 0, 0, w, h);
            await videoSource.add(meta.mediaTime, 1 / 30);
            last = meta.mediaTime;
            opts.onProgress?.(Math.min(0.99, meta.mediaTime / dur));
          }
          if (video.ended) return resolve();
          rvfc.call(video, pump);
        } catch (e) {
          reject(e);
        }
      };
      video.onended = () => resolve();
      video.onerror = () => reject(new Error("Playback stopped."));
      rvfc.call(video, pump);
      void video.play().catch(reject);
    });
    opts.signal?.removeEventListener("abort", abort);
    await audioDone;
    await output.finalize();
    opts.onProgress?.(1);
    return target.buffer ? new Blob([target.buffer], { type: "video/mp4" }) : null;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

/** The very first frame can legitimately be black (a fade-in): look a moment later before giving up. */
async function frameLooksReal(video: HTMLVideoElement, ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) {
  video.currentTime = Math.min(video.duration / 2, 1);
  await new Promise<void>((r) => { video.onseeked = () => r(); });
  ctx.drawImage(video, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, Math.min(16, w), Math.min(16, h)).data;
  video.currentTime = 0;
  await new Promise<void>((r) => { video.onseeked = () => r(); });
  for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 0) return true;
  return false;
}
