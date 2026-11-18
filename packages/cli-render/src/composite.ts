/**
 * Fast burn-in: Chrome draws only the captions (the transparent CaptionsOverlay composition, so the page never
 * decodes video), Remotion's bundled ffmpeg decodes the video to raw RGB, Node lays each caption frame over its video
 * frame, and the same ffmpeg encodes the result. The captions are the exact pixels of the overlay render, laid over
 * the picture with the same "over" blend Chrome uses, so a look renders as it does in a full in-Chrome burn.
 *
 * Only for looks that draw on top of the picture: a look made from the video (difference / inversion, knockouts) or
 * one with a backdrop blur needs the picture inside the page, and keeps the full render (see canComposite in render.ts).
 *
 * The bundled ffmpeg has no overlay/blend filter and no rawvideo (de)muxer, so raw frames travel through image2pipe
 * with the rawvideo codec in both directions.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { inflate, inflateSync } from "node:zlib";
import { ffmpegPath } from "@capseasy/companion/src/ffmpeg";
import { getLook } from "@capseasy/templates";
import { GUIDE } from "../../cli/src/guide";
import type { CaptionsProps } from "../../cli/src/types";

const inflateAsync = promisify(inflate);
/** overlay frames decoded ahead of the one being laid (in parallel, on the libuv pool) */
const DECODE_AHEAD = 4;

/** templates of the looks made from the picture (guide flag "video": #87 knockout, #118 difference, #132 shiny negative) */
const VIDEO_TEMPLATES = new Set(
  Object.entries(GUIDE)
    .filter(([, g]) => g.footage.needsVideoBehind)
    .map(([id]) => getLook(id)?.templateId)
    .filter((t): t is string => !!t),
);

/** A look that only draws on top of the picture: its captions can be rendered alone and laid over the video. */
export function canComposite(style: CaptionsProps["style"]): boolean {
  const bg = (style as { background?: { type?: string; blur?: number } }).background;
  // a backdrop blur (background.blur) blurs the picture behind the card
  return !VIDEO_TEMPLATES.has(style.templateId) && !(bg && bg.type !== "none" && (bg.blur ?? 0) > 0);
}

export interface CompositeOptions {
  video: string;
  out: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  hasAudio: boolean;
  /** renders the overlay frames as PNG buffers, in any order, through onFrame; resolves when all are rendered */
  renderOverlay: (onFrame: (png: Buffer, frame: number) => void) => Promise<unknown>;
  /** stops renderOverlay early (after a failure here) */
  cancelOverlay?: () => void;
  onProgress?: (progress: number) => void;
}

export interface Rgba {
  width: number;
  height: number;
  rgba: Uint8Array;
}
type PngParts = { width: number; height: number; channels: number; zdata: Buffer };

/** Straight-alpha RGBA pixels of a PNG (8-bit RGBA or RGB, non-interlaced: what Chrome's screenshots are). */
export function decodePng(buf: Buffer): Rgba {
  const parts = readPng(buf);
  return unfilter(parts, inflateSync(parts.zdata));
}

/** decodePng with the inflate on the libuv thread pool, so frames arriving together decode in parallel */
export async function decodePngAsync(buf: Buffer): Promise<Rgba> {
  const parts = readPng(buf);
  // one output chunk for the whole image: the default 16 KB chunks cost a pool round trip each (500 for a 1080p frame)
  const chunkSize = Math.max(65536, (parts.width * parts.channels + 1) * parts.height);
  return unfilter(parts, await inflateAsync(parts.zdata, { chunkSize }));
}

function readPng(buf: Buffer): PngParts {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, color, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if (depth !== 8 || interlace !== 0 || (color !== 6 && color !== 2)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${color}, interlace ${interlace})`);
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!width || !idat.length) throw new Error("PNG without IHDR or IDAT");
  return { width, height, channels, zdata: idat.length === 1 ? idat[0]! : Buffer.concat(idat) };
}

function unfilter({ width, height, channels }: PngParts, raw: Buffer): Rgba {
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error("truncated PNG");
  const px = new Uint8Array(stride * height);
  const ch = channels;
  // the row above the first row is all zeros
  const zero = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const s = y * (stride + 1) + 1;
    const d = y * stride;
    const up = y > 0 ? px.subarray(d - stride, d) : zero;
    const row = px.subarray(d, d + stride);
    const r = raw.subarray(s, s + stride);
    // one tight loop per filter type (a = left, b = up, c = up-left)
    if (filter === 0) row.set(r);
    else if (filter === 1) {
      for (let x = 0; x < ch; x++) row[x] = r[x]!;
      for (let x = ch; x < stride; x++) row[x] = (r[x]! + row[x - ch]!) & 255;
    } else if (filter === 2) {
      for (let x = 0; x < stride; x++) row[x] = (r[x]! + up[x]!) & 255;
    } else if (filter === 3) {
      for (let x = 0; x < ch; x++) row[x] = (r[x]! + (up[x]! >> 1)) & 255;
      for (let x = ch; x < stride; x++) row[x] = (r[x]! + ((row[x - ch]! + up[x]!) >> 1)) & 255;
    } else if (filter === 4) {
      for (let x = 0; x < ch; x++) row[x] = (r[x]! + up[x]!) & 255;
      for (let x = ch; x < stride; x++) {
        const a = row[x - ch]!;
        const b = up[x]!;
        const c = up[x - ch]!;
        const pa = b > c ? b - c : c - b;
        const pb = a > c ? a - c : c - a;
        const pc = a + b - c - c > 0 ? a + b - c - c : c + c - a - b;
        row[x] = (r[x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    } else throw new Error(`bad PNG filter ${filter}`);
  }
  if (channels === 4) return { width, height, rgba: px };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    rgba[j] = px[i]!;
    rgba[j + 1] = px[i + 1]!;
    rgba[j + 2] = px[i + 2]!;
    rgba[j + 3] = 255;
  }
  return { width, height, rgba };
}

/** Lays straight-alpha RGBA over packed RGB, in place (the source-over blend, rounded). */
export function blendOver(rgb: Uint8Array, rgba: Uint8Array): void {
  for (let p = 0, q = 0; p < rgba.length; p += 4, q += 3) {
    const a = rgba[p + 3]!;
    if (a === 0) continue;
    if (a === 255) {
      rgb[q] = rgba[p]!;
      rgb[q + 1] = rgba[p + 1]!;
      rgb[q + 2] = rgba[p + 2]!;
      continue;
    }
    const ia = 255 - a;
    rgb[q] = ((rgba[p]! * a + rgb[q]! * ia + 127) / 255) | 0;
    rgb[q + 1] = ((rgba[p + 1]! * a + rgb[q + 1]! * ia + 127) / 255) | 0;
    rgb[q + 2] = ((rgba[p + 2]! * a + rgb[q + 2]! * ia + 127) / 255) | 0;
  }
}

/** Fixed-size frames off a stream, one at a time; null once the stream has ended. */
class FrameReader {
  private chunks: Buffer[] = [];
  private have = 0;
  private ended = false;
  private wake: (() => void) | null = null;
  constructor(
    private readonly stream: NodeJS.ReadableStream,
    private readonly size: number,
  ) {
    stream.on("data", (d: Buffer) => {
      this.chunks.push(d);
      this.have += d.length;
      // hold at most a few frames: ffmpeg waits on the pipe instead of filling memory
      if (this.have >= size * 4) stream.pause();
      this.poke();
    });
    stream.on("end", () => {
      this.ended = true;
      this.poke();
    });
  }
  private poke() {
    const w = this.wake;
    this.wake = null;
    w?.();
  }
  async next(): Promise<Buffer | null> {
    while (this.have < this.size) {
      if (this.ended) return null;
      this.stream.resume();
      await new Promise<void>((r) => (this.wake = r));
    }
    const frame = Buffer.allocUnsafe(this.size);
    for (let off = 0; off < this.size; ) {
      const c = this.chunks[0]!;
      const n = Math.min(c.length, this.size - off);
      c.copy(frame, off, 0, n);
      off += n;
      if (n === c.length) this.chunks.shift();
      else this.chunks[0] = c.subarray(n);
    }
    this.have -= this.size;
    if (this.have < this.size * 4) this.stream.resume();
    return frame;
  }
}

function ff(args: string[]): { child: ChildProcessWithoutNullStreams; done: Promise<void> } {
  const child = spawn(ffmpegPath(), ["-hide_banner", "-v", "error", ...args], { windowsHide: true });
  let err = "";
  child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
  const done = new Promise<void>((res, rej) => {
    child.on("error", rej);
    child.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}: ${err.trim()}`))));
  });
  done.catch(() => undefined);
  return { child, done };
}

export async function burnComposite(o: CompositeOptions): Promise<void> {
  const { width: w, height: h, fps, frames } = o;
  const size = w * h * 3;
  const seconds = (frames / fps).toFixed(6);
  // video frame f is the picture at f / fps, as OffthreadVideo picks it
  // (output-side frame-rate conversion: the bundled ffmpeg has no fps filter)
  const decoder = ff(["-i", o.video, "-an", "-sn", "-fps_mode", "cfr", "-r", String(fps), "-frames:v", String(frames), "-f", "image2pipe", "-c:v", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  // the same streams and encoding as a Remotion burn: H.264 CRF 18 in full-range BT.601 4:2:0, AAC 48 kHz stereo
  // 320 kb/s (silent when the video has none)
  const audioIn = o.hasAudio ? ["-i", o.video] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];
  const encoder = ff([
    ...["-f", "image2pipe", "-frame_size", String(size), "-c:v", "rawvideo", "-pixel_format", "rgb24", "-video_size", `${w}x${h}`, "-framerate", String(fps), "-i", "pipe:0"],
    ...audioIn,
    ...["-map", "0:v:0", "-map", "1:a:0", "-t", seconds],
    ...["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuvj420p", "-colorspace", "bt470bg", "-color_range", "pc", "-video_track_timescale", "90000"],
    ...["-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2"],
    ...["-map_metadata", "-1", "-movflags", "+faststart", "-y", o.out],
  ]);
  const kill = () => {
    decoder.child.kill();
    encoder.child.kill();
  };
  // a write to an encoder that died rejects through its callback; without a listener the pipe error would be thrown
  encoder.child.stdin.on("error", () => undefined);
  const reader = new FrameReader(decoder.child.stdout, size);
  // frames Chrome finished, still as PNGs (small); only the next few are decoded, as decoded frames are large
  const pending = new Map<number, Buffer>();
  const decoding = new Map<number, Promise<Rgba>>();
  const decodeAhead = (from: number) => {
    for (let k = from; k < Math.min(frames, from + DECODE_AHEAD); k++) {
      const png = pending.get(k);
      if (!png || decoding.has(k)) continue;
      const d = decodePngAsync(png);
      d.catch(() => undefined); // awaited in frame order
      decoding.set(k, d);
      pending.delete(k);
    }
  };
  let wake: (() => void) | null = null;
  let renderError: unknown = null;
  let rendered = false;
  const rendering = o
    .renderOverlay((png, frame) => {
      pending.set(frame, png);
      const r = wake;
      wake = null;
      r?.();
    })
    .then(
      () => void (rendered = true),
      (e) => void (renderError = e),
    )
    .finally(() => {
      const r = wake;
      wake = null;
      r?.();
    });

  // a few frames may queue for the encoder, so blending the next frame overlaps with encoding this one
  const stdin = encoder.child.stdin;
  const stopped = encoder.done.then(() => {
    throw new Error("ffmpeg stopped reading frames");
  });
  stopped.catch(() => undefined);
  const write = async (buf: Uint8Array) => {
    if (stdin.write(buf) || stdin.writableLength < size * 3) return;
    await Promise.race([once(stdin, "drain"), stopped]);
  };

  try {
    let last: Buffer | null = null;
    for (let f = 0; f < frames; f++) {
      while (!pending.has(f) && !decoding.has(f)) {
        if (renderError) throw renderError;
        if (rendered) throw new Error(`the overlay render ended without frame ${f}`);
        await new Promise<void>((r) => (wake = r));
      }
      decodeAhead(f);
      const png = await decoding.get(f)!;
      decoding.delete(f);
      if (png.width !== w || png.height !== h) throw new Error(`overlay frame is ${png.width}x${png.height}, expected ${w}x${h}`);
      let pic = await reader.next();
      if (!pic) {
        await decoder.done; // a decoding error, not the end of the video
        if (!last) throw new Error("ffmpeg decoded no video frames");
        // past the last decodable frame the picture holds, as it does in the page
        pic = Buffer.from(last);
      }
      last = pic;
      const out = Buffer.from(pic);
      blendOver(out, png.rgba);
      await write(out);
      o.onProgress?.((f + 1) / frames);
    }
    encoder.child.stdin.end();
    await rendering;
    if (renderError) throw renderError;
    decoder.child.stdout.resume();
    await Promise.all([encoder.done, decoder.done.catch(() => undefined)]);
  } catch (e) {
    // an encoder that died on its own explains a failed write better than the write does
    const encoderDied = encoder.child.exitCode !== null && encoder.child.exitCode !== 0;
    kill();
    o.cancelOverlay?.();
    await rendering;
    throw renderError ?? (encoderDied ? await encoder.done.then(() => e, (x: unknown) => x) : e);
  }
}
