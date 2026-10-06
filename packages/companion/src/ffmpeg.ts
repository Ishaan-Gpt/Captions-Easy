import { spawn } from "node:child_process";
import { RenderInternals } from "@remotion/renderer";

/** Remotion ships its own ffmpeg/ffprobe, so users need nothing installed. */
export function ffmpegPath(): string {
  return RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });
}
export function ffprobePath(): string {
  return RenderInternals.getExecutablePath({ type: "ffprobe", indent: false, logLevel: "error", binariesDirectory: null });
}

export interface RunOptions {
  signal?: AbortSignal;
  onStderr?: (line: string) => void;
}

/** Runs a binary to completion; rejects with the tail of stderr on failure; kills the child on abort. */
export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    let tail = "";
    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      tail = (tail + s).slice(-3000);
      if (opts.onStderr) for (const l of s.split(/\r?\n|\r/)) if (l) opts.onStderr(l);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
      code === 0 ? resolve(out) : reject(new Error(`${bin.split(/[\\/]/).pop()} exited with ${code}: ${tail.trim().split("\n").slice(-6).join("\n")}`));
    });
  });
}

/** 16 kHz mono PCM WAV: the format whisper.cpp requires. */
export function extractWav(input: string, output: string, signal?: AbortSignal) {
  return run(ffmpegPath(), ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output], { signal });
}

export interface FfProbe {
  durationMs: number;
  hasAudio: boolean;
  width?: number;
  height?: number;
}

export async function probe(input: string): Promise<FfProbe> {
  const json = await run(ffprobePath(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input]);
  const j = JSON.parse(json) as { format?: { duration?: string }; streams?: { codec_type: string; width?: number; height?: number }[] };
  const v = j.streams?.find((s) => s.codec_type === "video");
  return {
    durationMs: Math.round(Number(j.format?.duration ?? 0) * 1000),
    hasAudio: Boolean(j.streams?.some((s) => s.codec_type === "audio")),
    width: v?.width,
    height: v?.height,
  };
}

/** H.264 proxy for browsers that cannot play the source codec (HEVC, ProRes, MKV...). */
export function makeProxy(input: string, output: string, height: number, durationMs: number, onProgress: (f: number) => void, signal?: AbortSignal) {
  return run(
    ffmpegPath(),
    ["-y", "-i", input, "-vf", `scale=-2:${height}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output],
    {
      signal,
      onStderr: (l) => {
        const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(l);
        if (m && durationMs > 0) onProgress(Math.min(1, ((+m[1]! * 3600 + +m[2]! * 60 + +m[3]!) * 1000) / durationMs));
      },
    },
  );
}
