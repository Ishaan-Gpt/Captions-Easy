/**
 * Server-side rendering with Remotion: the exact CaptionedVideo composition the CaptionsEasy studio previews and
 * exports, rendered by headless Chrome on this machine.
 */
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { serveFile } from "@capseasy/companion/src/media-server";
import { buildCaptions } from "../../cli/src/captions";
import { CaptionsEasyError } from "../../cli/src/errors";
import { existingFile } from "../../cli/src/fsutil";
import { probeMedia } from "../../cli/src/node/media";
import { cacheDir } from "../../cli/src/node/paths";
import type { CaptionsProps, RenderOptions, RenderResult, TranscribeOptions, Transcript } from "../../cli/src/types";
import { burnComposite, canComposite } from "./composite";

/** overlay containers this add-on writes; "png-sequence" (a folder of transparent PNGs) is new in 0.2.0 */
export type RenderOverlayFormat = "mov" | "webm" | "png-sequence";
export type RenderOptionsExt = Omit<RenderOptions, "overlayFormat"> & {
  /**
   * overlay output: "mov" = ProRes 4444 with alpha (default), "webm" = VP9 with alpha, "png-sequence" = a folder of
   * transparent PNGs (frame_0000.png ...; `out` is the folder, default <video>.captions/)
   */
  overlayFormat?: RenderOverlayFormat;
};
export type RenderResultExt = RenderResult & {
  /** png-sequence only: number of PNGs written and their file-name pattern for ffmpeg (e.g. "frame_%04d.png") */
  frames?: number;
  pattern?: string;
};

/** Transcription is a separate optional add-on, loaded only when no words are given. */
async function transcribe(video: string, opts: TranscribeOptions): Promise<Transcript> {
  const pkg = "captionseasy-transcribe";
  let mod: { transcribe: (v: string, o: TranscribeOptions) => Promise<Transcript> };
  try {
    mod = await import(/* webpackIgnore: true */ pkg);
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_MODULE_NOT_FOUND" && String((e as Error).message).includes(pkg)) {
      throw new CaptionsEasyError("ADDON_MISSING", "No words were given, and transcribing speech needs the optional add-on captionseasy-transcribe: `npm i captionseasy-transcribe`. Or pass words (--words words.json).", { addon: pkg, install: `npm i ${pkg}` });
    }
    throw e;
  }
  return mod.transcribe(video, opts);
}

/** Slow machines / cold video decoders need more than Remotion's 30 s default per delayRender. */
const FRAME_TIMEOUT_MS = 120_000;

/** templates drawn with mix-blend-mode against the video */
const BLEND_TEMPLATES = new Set(["pack_difference"]);

let sitePromise: Promise<string> | null = null;

/**
 * The Remotion site (bundled composition). The published package ships it pre-bundled in dist/site, so users never
 * need webpack; from the monorepo sources it is bundled once into the cache.
 */
export function getSite(quiet?: boolean): Promise<string> {
  sitePromise ??= (async () => {
    // dist/site, seen from dist/*.mjs or from a shared chunk in dist/chunks/
    const candidates = [process.env.CAPTIONSEASY_SITE, fileURLToPath(new URL("./site", import.meta.url)), fileURLToPath(new URL("../site", import.meta.url))].filter(Boolean) as string[];
    for (const c of candidates) if (existsSync(join(c, "index.html"))) return c;
    const entryPoint = fileURLToPath(new URL("../../compositions/src/entry.ts", import.meta.url)); // monorepo sources (dev only)
    if (!existsSync(entryPoint)) throw new CaptionsEasyError("RENDER_FAILED", "The bundled caption composition (dist/site) is missing from this install. Reinstall captionseasy.");
    if (!quiet) process.stderr.write("captionseasy: bundling the caption composition (dev mode)...\n");
    const { bundle } = await import("@remotion/bundler");
    return bundle({ entryPoint, outDir: join(cacheDir(), "dev-site"), onProgress: () => undefined });
  })().catch((e) => {
    sitePromise = null;
    throw e;
  });
  return sitePromise;
}

/** What to do about a renderer error, appended to RENDER_FAILED's message ("" when there is nothing to add). */
export function failureHint(msg: string, concurrency: number): string {
  if (/No frame found at position/.test(msg)) return " The video has frames the decoder cannot reach (common after cutting with ffmpeg -c copy). Re-encode it (e.g. ffmpeg -i in.mp4 -c:v libx264 -c:a aac out.mp4) or render an --overlay instead.";
  if (/Compositor quit|Mingw-w64 runtime failure/i.test(msg)) return ` Remotion's frame compositor crashed; it does at high concurrency (seen at 8 on Windows). Render again with a lower --concurrency (e.g. ${Math.max(1, Math.min(4, concurrency - 2))}; this render used ${concurrency}).`;
  return "";
}

const defaultOut = (video: string, mode: "burn" | "overlay", fmt: RenderOverlayFormat) => {
  const stem = join(dirname(video), basename(video, extname(video)));
  return mode === "burn" ? `${stem}.captioned.mp4` : fmt === "png-sequence" ? `${stem}.captions` : `${stem}.captions.${fmt}`;
};

/**
 * Caption a local video. Transcribes it first when no words are given, then renders either the video with captions
 * burned in (MP4, original audio) or a transparent captions-only overlay sized to the video (ProRes 4444 .mov or
 * VP9-alpha .webm) to lay over it in any editor.
 */
export async function render(opts: RenderOptionsExt): Promise<RenderResultExt> {
  const video = existingFile(opts.video, "Video");
  const mode = opts.mode ?? "burn";
  if (mode !== "burn" && mode !== "overlay") throw new CaptionsEasyError("BAD_ARGS", `mode must be "burn" or "overlay" (got ${JSON.stringify(mode)}).`);
  const fmt = opts.overlayFormat ?? (opts.out && extname(opts.out).toLowerCase() === ".webm" ? "webm" : "mov");
  if (fmt !== "mov" && fmt !== "webm" && fmt !== "png-sequence") throw new CaptionsEasyError("BAD_ARGS", `overlayFormat must be "mov", "webm" or "png-sequence" (got ${JSON.stringify(fmt)}).`);
  if (fmt === "png-sequence" && mode !== "overlay") throw new CaptionsEasyError("BAD_ARGS", `overlayFormat "png-sequence" needs mode "overlay" (got mode ${JSON.stringify(mode)}).`);
  const out = resolve(opts.out ?? defaultOut(video, mode, fmt));
  const info = await probeMedia(video);
  if (!info.hasVideo || !info.width || !info.height) throw new CaptionsEasyError("NO_VIDEO", `${video} has no video track.`);

  // words: given, from a transcript, or transcribed now
  let words = opts.words ?? opts.transcript?.words;
  let language = opts.transcript?.language;
  let transcribeMs: number | undefined;
  if (!words) {
    const t = await transcribe(video, { language: opts.language, quiet: opts.quiet, onProgress: (f) => opts.onProgress?.(f, "transcribe") });
    words = t.words;
    language = t.language;
    transcribeMs = t.elapsedMs;
  }

  // validate everything before starting a browser
  const props: CaptionsProps = buildCaptions({ words, look: opts.look, overrides: opts.overrides, settings: opts.settings, theme: opts.theme, roles: opts.roles, roleMap: opts.roleMap, stamps: opts.stamps, layout: opts.layout, ...(opts.tracks !== undefined ? { tracks: opts.tracks } : {}), language: language === "auto" ? undefined : language, durationMs: info.durationMs || undefined });

  const styles = props.tracks?.map((t) => t.style) ?? [props.style];
  // looks that blend with the picture (difference) have no picture to blend with in a transparent overlay
  if (mode === "overlay" && styles.some((st) => BLEND_TEMPLATES.has(st.templateId))) {
    props.warnings.push(`${props.look.name} (#${props.look.number}) blends with the video picture; an overlay has no picture, so it renders as plain text. Use mode "burn" for this look.`);
  }
  // a burn whose looks only draw on top of the picture renders the captions alone and lays them over the video
  // outside Chrome (composite.ts): the same pixels, without the page decoding and screenshotting every video frame.
  // The picture is laid 1:1, so the video must already be the frame's (even) size.
  const fast = mode === "burn" && opts.fastBurn !== false && styles.every(canComposite) && info.width % 2 === 0 && info.height % 2 === 0;

  const { ensureBrowser, makeCancelSignal, renderFrames, renderMedia, selectComposition } = await import("@remotion/renderer");
  const started = performance.now();
  await ensureBrowser({
    logLevel: "error",
    onBrowserDownload: () => {
      if (!opts.quiet) process.stderr.write("captionseasy: downloading a headless Chrome for rendering (one time)...\n");
      return { version: null, onProgress: () => undefined };
    },
  });
  const serveUrl = await getSite(opts.quiet);
  const media = mode === "burn" && !fast ? await serveFile(video) : null;
  mkdirSync(fmt === "png-sequence" && mode === "overlay" ? out : dirname(out), { recursive: true });
  let sequence: { frames: number; pattern: string } | undefined;
  const concurrency = opts.concurrency ?? Math.max(1, Math.floor(cpus().length / 2));
  const writeStart = Date.now() - 1000; // file-time granularity
  try {
    const drawn = fast ? "overlay" : mode;
    const inputProps = {
      src: media?.url ?? null,
      media: { width: info.width, height: info.height, fps: info.fps, durationMs: info.durationMs, rotation: 0 },
      doc: props.doc,
      style: props.style,
      settings: props.settings,
      mode: drawn,
      // opt-in 0.2.0 props: only sent when present
      ...(props.layout ? { layout: props.layout } : {}),
      ...(props.tracks ? { tracks: props.tracks } : {}),
    };
    const id = drawn === "burn" ? "CaptionedVideo" : "CaptionsOverlay";
    const composition = await selectComposition({ serveUrl, id, inputProps, timeoutInMilliseconds: FRAME_TIMEOUT_MS, logLevel: "error" });
    const common = {
      // renderMedia draws composition.props: pass the real ones in
      composition: { ...composition, props: inputProps },
      serveUrl,
      inputProps,
      outputLocation: out,
      overwrite: true,
      timeoutInMilliseconds: FRAME_TIMEOUT_MS,
      concurrency,
      logLevel: "error" as const,
      onProgress: ({ progress }: { progress: number }) => opts.onProgress?.(progress, "render"),
    };
    if (fast) {
      const { composition: comp, timeoutInMilliseconds, logLevel } = common;
      const { cancelSignal, cancel } = makeCancelSignal();
      await burnComposite({
        video,
        out,
        width: comp.width,
        height: comp.height,
        fps: comp.fps,
        frames: comp.durationInFrames,
        hasAudio: info.hasAudio,
        onProgress: (p) => opts.onProgress?.(p, "render"),
        renderOverlay: (onFrameBuffer) =>
          renderFrames({ composition: comp, serveUrl, inputProps, outputDir: null, imageFormat: "png", onFrameBuffer, timeoutInMilliseconds, concurrency, logLevel, cancelSignal, onStart: () => undefined, onFrameUpdate: () => undefined }),
        cancelOverlay: cancel,
      });
    } else if (mode === "burn") {
      await renderMedia({ ...common, codec: "h264", crf: 18, pixelFormat: "yuv420p" });
    } else if (fmt === "png-sequence") {
      // one transparent PNG per frame: frame_<n>.png, n zero-padded to the frame count's width
      const { composition: comp, serveUrl: url, inputProps: ip, timeoutInMilliseconds, concurrency, logLevel } = common;
      let total = composition.durationInFrames;
      await renderFrames({
        composition: comp,
        serveUrl: url,
        inputProps: ip,
        outputDir: out,
        imageFormat: "png",
        imageSequencePattern: "frame_[frame].[ext]",
        timeoutInMilliseconds,
        concurrency,
        logLevel,
        onStart: ({ frameCount }) => void (total = frameCount),
        onFrameUpdate: (done) => opts.onProgress?.(done / Math.max(1, total), "render"),
      });
      sequence = { frames: total, pattern: `frame_%0${Math.max(1, String(total - 1).length)}d.png` };
    } else if (fmt === "mov") {
      await renderMedia({ ...common, codec: "prores", proResProfile: "4444", pixelFormat: "yuva444p10le", imageFormat: "png", muted: true });
    } else {
      await renderMedia({ ...common, codec: "vp9", pixelFormat: "yuva420p", imageFormat: "png", muted: true });
    }
    if (sequence) {
      if (!existsSync(join(out, sequence.pattern.replace(/%0(\d+)d/, (_m, n: string) => "0".repeat(Number(n)))))) throw new CaptionsEasyError("RENDER_FAILED", "The renderer produced no PNG frames.");
    } else if (!existsSync(out) || statSync(out).size === 0) throw new CaptionsEasyError("RENDER_FAILED", "The renderer produced an empty file.");
    return {
      out,
      mode,
      durationMs: Math.round((composition.durationInFrames / composition.fps) * 1000),
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      look: props.look,
      words: props.doc.words.length,
      renderMs: Math.round(performance.now() - started),
      ...(transcribeMs !== undefined ? { transcribeMs } : {}),
      warnings: props.warnings,
      ...(sequence ?? {}),
    };
  } catch (e) {
    // an empty file, or the half-written MP4 of a fast burn (never a file this render did not write)
    if (!sequence && existsSync(out) && statSync(out).isFile() && (statSync(out).size === 0 || (fast && statSync(out).mtimeMs >= writeStart))) rmSync(out, { force: true });
    if (e instanceof CaptionsEasyError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new CaptionsEasyError("RENDER_FAILED", `Rendering failed: ${msg.split("\n")[0]}${failureHint(msg, concurrency)}`, { cause: msg.slice(0, 2000) });
  } finally {
    await media?.close();
  }
}
