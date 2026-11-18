/**
 * captionseasy-web: CaptionsEasy captions in any web page, no framework needed. React, react-dom, Remotion and the
 * caption composition are bundled in; you give it the props from captionseasy's buildCaptions().
 *
 *   mountCaptions(el, props, { width, height })   live DOM layer; render(timeMs) is a pure function of time
 *   drawCaptions(ctx, props, timeMs, size)        draw one moment onto a 2D canvas (Remotion's DOM->canvas engine)
 *   exportFrames(props, { fps, width, height, format })   transparent PNG sequence or VP9-alpha WebM, in the browser
 *   ready(props, size)                            load the look's fonts before the first draw
 */
import type React from "react";
import { CaptionsScene, globalPending, mountScene, type SceneMount } from "./scene";
import { rasterise } from "./svg";
import { checkProps, checkSize, durationInFrames, fpsOf, frameAt, lastWordEndMs, toInputProps, type CaptionsInput, type FrameSize } from "./props";

export type { CaptionsInput, FrameSize } from "./props";
export { frameAt } from "./props";

/** Remotion licence key for the in-browser renderer (canvas + export). See README "Licence". */
export interface LicenseOption {
  /**
   * Passed to @remotion/web-renderer, which reports one usage event per render call (per drawCaptions() call, per
   * exportFrames() call). "free-license" if you qualify for Remotion's free licence; your company key otherwise.
   * Default "free-license".
   */
  licenseKey?: string | null;
}

const COMPOSITION_ID = "CaptionsEasyWeb";

const composition = (props: CaptionsInput, size: FrameSize) => {
  const fps = fpsOf(size);
  return {
    id: COMPOSITION_ID,
    component: CaptionsScene as unknown as React.ComponentType<Record<string, unknown>>,
    width: Math.round(size.width),
    height: Math.round(size.height),
    fps,
    durationInFrames: durationInFrames(props, fps),
  };
};

// ------------------------------------------------------------------ fonts

const readyCache = new WeakMap<object, Promise<void>>();

/**
 * Loads every font the captions use (the look's Google fonts, hero/accent fonts, emoji, Devanagari fallbacks,
 * every track's look) by mounting the captions once off screen and waiting until they are committed.
 * drawCaptions()/exportFrames() wait on their own; await this once to make the first draw fast.
 */
export function ready(props: CaptionsInput, size: FrameSize = { width: 1080, height: 1920 }): Promise<void> {
  checkProps(props);
  checkSize(size);
  const cached = readyCache.get(props);
  if (cached) return cached;
  const p = (async () => {
    const host = document.createElement("div");
    Object.assign(host.style, { position: "fixed", left: "0", top: "0", width: "0", height: "0", overflow: "hidden", visibility: "hidden", pointerEvents: "none", zIndex: "-1" });
    document.body.appendChild(host);
    const c = composition(props, size);
    const scene = mountScene(host, toInputProps(props, size), { width: c.width, height: c.height, fps: c.fps, durationInFrames: c.durationInFrames, frame: 0 });
    try {
      await scene.ready();
      if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
    } finally {
      scene.destroy();
      host.remove();
    }
  })();
  readyCache.set(props, p);
  p.catch(() => readyCache.delete(props));
  return p;
}

// ------------------------------------------------------------------ DOM

export interface MountOptions extends FrameSize {
  /**
   * How the width x height composition sits in the container: "contain" (default) scales it to fit, centred, like
   * object-fit: contain on a <video> of the same size; "none" keeps 1 CSS px per composition px.
   */
  fit?: "contain" | "none";
}

export interface CaptionsMount {
  /** show the captions at this moment (ms on the video's timeline). Synchronous; same time -> same DOM. */
  render(timeMs: number): void;
  /** swap the captions (new look, words, theme ...) keeping the mount */
  update(props: CaptionsInput): void;
  /** resolves once fonts are loaded and captions are on screen */
  ready(): Promise<void>;
  /** the element the captions are drawn in (width x height px, scaled into the container) */
  readonly element: HTMLElement;
  destroy(): void;
}

/**
 * A live DOM caption layer inside `container` (absolutely positioned on top of it; give the container
 * `position: relative` and put your <video> in it). Call render(video.currentTime * 1000) from your own loop.
 */
export function mountCaptions(container: HTMLElement, props: CaptionsInput, options: MountOptions): CaptionsMount {
  if (!container || typeof container.appendChild !== "function") throw new TypeError("captionseasy-web: mountCaptions needs a container element.");
  checkProps(props);
  checkSize(options);
  let current = props;
  let c = composition(current, options);
  const layer = document.createElement("div");
  Object.assign(layer.style, { position: "absolute", inset: "0", overflow: "hidden", pointerEvents: "none" });
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  container.appendChild(layer);
  const scene: SceneMount = mountScene(layer, toInputProps(current, options), { width: c.width, height: c.height, fps: c.fps, durationInFrames: c.durationInFrames, frame: 0 });

  const fit = () => {
    if (options.fit === "none") {
      scene.root.style.transform = "";
      return;
    }
    const cw = layer.clientWidth || c.width;
    const ch = layer.clientHeight || c.height;
    const s = Math.min(cw / c.width, ch / c.height);
    const x = (cw - c.width * s) / 2;
    const y = (ch - c.height * s) / 2;
    scene.root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  fit();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  ro?.observe(layer);

  let destroyed = false;
  return {
    element: scene.root,
    render(timeMs) {
      if (destroyed) return;
      scene.setFrame(frameAt(timeMs, c.fps, c.durationInFrames));
    },
    update(next) {
      checkProps(next);
      current = next;
      c = composition(current, options);
      scene.setProps(toInputProps(current, options));
    },
    ready: () => scene.ready(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ro?.disconnect();
      scene.destroy();
      layer.remove();
    },
  };
}

// ------------------------------------------------------------------ canvas

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * How a frame becomes pixels:
 *  - "svg" (default where supported): the live caption DOM is serialised into an SVG <foreignObject> (fonts embedded) and painted by
 *    the browser itself, like the server renderer's screenshot. Closest to Remotion; ~1 mount per props, fast frames.
 *  - "remotion": @remotion/web-renderer's DOM->canvas engine (renderStillOnWeb, the studio's in-browser exporter).
 *    Works where foreignObject images are blocked; some CSS (filters on transforms, 3D, blend modes) is approximated.
 *    Reports one Remotion usage event per call (see licenseKey).
 */
export type CanvasEngine = "svg" | "remotion";

export interface DrawOptions extends FrameSize, LicenseOption {
  /** pixel density: the captions are rasterised at width*scale x height*scale (default 1) */
  scale?: number;
  /** where to draw on the target canvas (default 0, 0) */
  x?: number;
  y?: number;
  /** default "auto": "svg" where the browser lets a page read back foreignObject drawings (Chromium, Firefox), else "remotion" */
  engine?: CanvasEngine | "auto";
}

type WebRenderer = typeof import("@remotion/web-renderer");
let renderer: Promise<WebRenderer> | null = null;
const webRenderer = () => (renderer ??= import("@remotion/web-renderer"));

/** One off-screen live mount, reused while the same props/size are drawn (frames then only re-render). */
let offscreen: { props: CaptionsInput; key: string; scene: SceneMount; host: HTMLElement; frames: number } | null = null;

function offscreenScene(props: CaptionsInput, size: FrameSize) {
  const c = composition(props, size);
  const key = `${c.width}x${c.height}@${c.fps}`;
  if (offscreen && offscreen.props === props && offscreen.key === key) return offscreen;
  releaseCaptions();
  const host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", left: "0", top: "0", width: "0", height: "0", overflow: "hidden", visibility: "hidden", pointerEvents: "none", zIndex: "-1" });
  document.body.appendChild(host);
  const scene = mountScene(host, toInputProps(props, size), { width: c.width, height: c.height, fps: c.fps, durationInFrames: c.durationInFrames, frame: 0 });
  offscreen = { props, key, scene, host, frames: c.durationInFrames };
  return offscreen;
}

/** Frees the off-screen mount drawCaptions() keeps for the last props (optional; the next props replace it anyway). */
export function releaseCaptions(): void {
  if (!offscreen) return;
  offscreen.scene.destroy();
  offscreen.host.remove();
  offscreen = null;
}

/** Serialise draws: the off-screen mount shows one frame at a time. */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = queue.then(fn, fn);
  queue = p.catch(() => undefined);
  return p;
};

/**
 * Rasterises the captions at `timeMs` (transparent background) into a new canvas of width*scale x height*scale.
 * Same props + time + size -> same pixels.
 */
export function renderCaptionsFrame(props: CaptionsInput, timeMs: number, options: DrawOptions): Promise<OffscreenCanvas | HTMLCanvasElement> {
  checkProps(props);
  checkSize(options);
  const scale = options.scale ?? 1;
  if (!(scale > 0)) throw new TypeError(`captionseasy-web: scale must be > 0 (got ${scale})`);
  const want = options.engine ?? "auto";
  if (want !== "svg" && want !== "remotion" && want !== "auto") throw new TypeError(`captionseasy-web: engine must be "auto", "svg" or "remotion" (got ${JSON.stringify(want)})`);
  return serial(async () => {
    const engine: CanvasEngine = want === "auto" ? ((await canUseSvgEngine()) ? "svg" : "remotion") : want;
    const c = composition(props, options);
    if (engine === "remotion") {
      await ready(props, options);
      const { renderStillOnWeb } = await webRenderer();
      const result = await renderStillOnWeb({
        composition: c,
        frame: frameAt(timeMs, c.fps, c.durationInFrames),
        inputProps: toInputProps(props, options),
        scale,
        licenseKey: options.licenseKey === undefined ? "free-license" : options.licenseKey,
        logLevel: "error",
        delayRenderTimeoutInMilliseconds: 60_000,
      } as never);
      return (await result.canvas()) as OffscreenCanvas;
    }
    const o = offscreenScene(props, options);
    await o.scene.ready();
    o.scene.setFrame(frameAt(timeMs, c.fps, c.durationInFrames));
    await o.scene.ready();
    const img = await rasterise(o.scene.root, { width: c.width, height: c.height, scale, baseCss: o.scene.css });
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(Math.round(c.width * scale), Math.round(c.height * scale)) : Object.assign(document.createElement("canvas"), { width: Math.round(c.width * scale), height: Math.round(c.height * scale) });
    (canvas.getContext("2d") as Ctx2D).drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  });
}

/**
 * Draws the captions at `timeMs` onto a 2D canvas (over whatever is already there, e.g. the current video frame).
 * `width`/`height` are the composition size the look is laid out for; the drawn image is width*scale x height*scale.
 */
export async function drawCaptions(ctx: Ctx2D, props: CaptionsInput, timeMs: number, options: DrawOptions): Promise<void> {
  if (!ctx || typeof (ctx as CanvasRenderingContext2D).drawImage !== "function") throw new TypeError("captionseasy-web: drawCaptions needs a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
  const frame = await renderCaptionsFrame(props, timeMs, options);
  ctx.drawImage(frame, options.x ?? 0, options.y ?? 0);
}

// ------------------------------------------------------------------ export

export interface ExportOptions extends FrameSize, LicenseOption {
  /** "png-sequence" (default): one transparent PNG per frame. "webm": one VP9 file with alpha (WebCodecs). */
  format?: "png-sequence" | "webm";
  /** default 0 */
  startMs?: number;
  /** default: the end of the last caption */
  endMs?: number;
  scale?: number;
  /** default "auto": "svg" where the browser lets a page read back foreignObject drawings (Chromium, Firefox), else "remotion" */
  engine?: CanvasEngine | "auto";
  /** WebM bitrate in bits/s (default 8 Mbit/s) */
  bitrate?: number;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  format: "png-sequence" | "webm";
  engine: CanvasEngine;
  fps: number;
  width: number;
  height: number;
  /** first exported frame (frame n of the sequence is at (startFrame + n) / fps seconds) */
  startFrame: number;
  frameCount: number;
  /** png-sequence: one PNG per frame, in order */
  frames?: Blob[];
  /** webm: the video file */
  blob?: Blob;
}

let probe: Promise<boolean> | null = null;
/** Can this page read back a canvas that drew an SVG <foreignObject> image? (false in Safari: it taints) */
export function canUseSvgEngine(): Promise<boolean> {
  return (probe ??= (async () => {
    try {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><foreignObject width="2" height="2"><div xmlns="http://www.w3.org/1999/xhtml" style="width:2px;height:2px;background:#f00"></div></foreignObject></svg>`;
      const img = new Image(2, 2);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, 1, 1).data[0] > 200;
    } catch {
      return false;
    }
  })());
}

/**
 * Transparent overlay frames for ffmpeg / an editor, rendered in this tab. Deterministic (frame by frame, no
 * real-time capture). PNG sequence: `ffmpeg -framerate 30 -i frame_%05d.png -c:v prores_ks -profile:v 4444 out.mov`.
 */
export async function exportFrames(props: CaptionsInput, options: ExportOptions): Promise<ExportResult> {
  checkProps(props);
  checkSize(options);
  const format = options.format ?? "png-sequence";
  if (format !== "png-sequence" && format !== "webm") throw new TypeError(`captionseasy-web: format must be "png-sequence" or "webm" (got ${JSON.stringify(format)})`);
  const want = options.engine ?? "auto";
  const engine: CanvasEngine = want === "auto" ? ((await canUseSvgEngine()) ? "svg" : "remotion") : want;
  await ready(props, options);
  const c = composition(props, options);
  const start = frameAt(options.startMs ?? 0, c.fps, c.durationInFrames);
  const endMs = options.endMs ?? lastWordEndMs(props);
  const end = Math.max(start, Math.min(c.durationInFrames - 1, Math.ceil((endMs / 1000) * c.fps)));
  const scale = options.scale ?? 1;
  const width = Math.round(c.width * scale);
  const height = Math.round(c.height * scale);
  const base = { format, engine, fps: c.fps, width, height, startFrame: start, frameCount: end - start + 1 } as const;
  const licenseKey = options.licenseKey === undefined ? "free-license" : options.licenseKey;
  const aborted = () => {
    if (options.signal?.aborted) throw new Error("captionseasy-web: exportFrames() was cancelled");
  };

  if (engine === "svg") {
    const frames: Blob[] = [];
    const enc = format === "webm" ? await (await import("./webm")).webmEncoder(width, height, c.fps, options.bitrate ?? 8_000_000) : null;
    try {
      for (let f = start; f <= end; f++) {
        aborted();
        const frame = await renderCaptionsFrame(props, (f / c.fps) * 1000, { ...options, scale, engine: "svg" });
        if (enc) {
          const x = enc.canvas.getContext("2d")!;
          x.clearRect(0, 0, width, height);
          x.drawImage(frame, 0, 0);
          await enc.add((f - start) / c.fps, 1 / c.fps);
        } else {
          frames.push(await toPng(frame));
        }
        options.onProgress?.((f - start + 1) / (end - start + 1));
      }
      if (enc) return { ...base, blob: await enc.finish() };
      return { ...base, frames };
    } catch (e) {
      if (enc) await enc.cancel().catch(() => undefined);
      throw e;
    }
  }

  const { renderMediaOnWeb } = await webRenderer();
  const frames: Blob[] = [];
  const pending: Promise<void>[] = [];
  const result = await renderMediaOnWeb({
    composition: c,
    inputProps: toInputProps(props, options),
    container: "webm",
    videoCodec: "vp9",
    transparent: true,
    muted: true,
    scale,
    frameRange: [start, end],
    signal: options.signal ?? null,
    onProgress: (p: { progress: number }) => options.onProgress?.(p.progress),
    licenseKey,
    logLevel: "error",
    delayRenderTimeoutInMilliseconds: 60_000,
    onFrame:
      format === "png-sequence"
        ? (vf: VideoFrame) => {
            // copy the frame to a PNG before the encoder closes it; keep order
            const idx = frames.length;
            frames.push(undefined as unknown as Blob);
            const canvas = new OffscreenCanvas(vf.displayWidth, vf.displayHeight);
            canvas.getContext("2d")!.drawImage(vf, 0, 0);
            pending.push(canvas.convertToBlob({ type: "image/png" }).then((b) => void (frames[idx] = b)));
            return vf;
          }
        : undefined,
  } as never);
  if (format === "webm") return { ...base, blob: await (result as { getBlob: () => Promise<Blob> }).getBlob() };
  await Promise.all(pending);
  return { ...base, frames };
}

const toPng = (c: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> =>
  "convertToBlob" in c ? c.convertToBlob({ type: "image/png" }) : new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));

/** File name for frame `i` of a PNG sequence: frame_00000.png ... (matches the ffmpeg pattern frame_%05d.png). */
export const frameFileName = (i: number) => `frame_${String(i).padStart(5, "0")}.png`;

/** true while fonts or other render holds are pending in this page (diagnostics) */
export const isBusy = globalPending;
