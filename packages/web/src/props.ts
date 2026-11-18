/**
 * The props contract: whatever `buildCaptions()` (captionseasy core) returns goes in as is. Everything the
 * CaptionedVideo composition reads (doc, style, settings, layout, and any field later versions add, such as
 * multi-look `tracks`) is passed through untouched; the report-only fields (look, warnings, theme, roles) are dropped.
 */

/** What `buildCaptions()` returns (only the fields this package reads are typed). */
export interface CaptionsInput {
  doc: { words: { startMs: number; endMs: number }[] } & Record<string, unknown>;
  style: Record<string, unknown>;
  settings?: Record<string, unknown>;
  layout?: unknown;
  [key: string]: unknown;
}

export interface FrameSize {
  /** composition width in px (the size the look is laid out for, e.g. the video's width) */
  width: number;
  /** composition height in px */
  height: number;
  /** frames per second the look is sampled at (default 30, like the Remotion renders) */
  fps?: number;
}

/** Fields of the buildCaptions() result that are reports, not composition input. */
const REPORT_ONLY = new Set(["look", "warnings", "theme", "roles"]);

export const DEFAULT_FPS = 30;

export function fpsOf(size: { fps?: number }): number {
  const fps = size.fps ?? DEFAULT_FPS;
  if (!Number.isFinite(fps) || fps <= 0) throw new TypeError(`captionseasy-web: fps must be a positive number (got ${fps})`);
  return fps;
}

export function checkSize(size: FrameSize): void {
  for (const k of ["width", "height"] as const) {
    const v = size?.[k];
    if (!Number.isFinite(v) || v <= 0) throw new TypeError(`captionseasy-web: ${k} must be a positive number of pixels (got ${v})`);
  }
}

export function checkProps(props: CaptionsInput): void {
  if (!props || typeof props !== "object" || !props.doc || !Array.isArray(props.doc.words) || !props.style) {
    throw new TypeError("captionseasy-web: props must be the object returned by buildCaptions() ({ doc, style, settings, ... }).");
  }
}

/** End of the last word, every multi-look track (captionseasy 0.2 `tracks`, each with its own doc) included. */
export function lastWordEndMs(props: CaptionsInput): number {
  let end = 0;
  for (const w of props.doc.words) end = Math.max(end, w.endMs);
  const tracks = props.tracks as { doc?: { words?: { endMs: number }[] } }[] | null | undefined;
  if (Array.isArray(tracks)) for (const t of tracks) for (const w of t?.doc?.words ?? []) end = Math.max(end, w.endMs);
  return end;
}

/** Last moment anything is on screen: the last word's end or media.durationMs. */
export function captionsEndMs(props: CaptionsInput): number {
  const end = lastWordEndMs(props);
  const media = props.media as { durationMs?: number } | undefined;
  return media?.durationMs && media.durationMs > end ? media.durationMs : end;
}

/** Composition length in frames: always long enough to hold every caption (and a margin). */
export function durationInFrames(props: CaptionsInput, fps: number): number {
  return Math.max(1, Math.ceil(((captionsEndMs(props) + 1000) / 1000) * fps));
}

/**
 * Time -> frame, exactly like a Remotion render samples time: frame f shows t = f / fps, so a time between two
 * frames shows the earlier one. A tiny epsilon absorbs float error (1000/30*3 = 100.00000000000001).
 */
export function frameAt(timeMs: number, fps: number, frames: number): number {
  if (!Number.isFinite(timeMs)) throw new TypeError(`captionseasy-web: timeMs must be a number (got ${timeMs})`);
  const f = Math.floor((Math.max(0, timeMs) / 1000) * fps + 1e-6);
  return Math.min(frames - 1, f);
}

/** buildCaptions() result -> CaptionedVideo input (transparent overlay, no video). */
export function toInputProps(props: CaptionsInput, size: FrameSize): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (!REPORT_ONLY.has(k)) out[k] = v;
  const fps = fpsOf(size);
  out.src = null;
  out.mode = "overlay";
  out.backdrop = null;
  out.media = { width: size.width, height: size.height, fps, durationMs: captionsEndMs(props), rotation: 0 };
  return out;
}
