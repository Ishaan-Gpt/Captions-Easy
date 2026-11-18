/**
 * captionseasy-render: the rendering add-on for `captionseasy`. Renders the CaptionsEasy caption composition with
 * Remotion + headless Chrome on this machine: burn captions into a video (MP4) or export a transparent overlay
 * (.mov ProRes 4444 / .webm VP9). Usually used through `captionseasy` (render(), the CLI, the MCP caption_video tool).
 */
import { render as _render } from "./render";
import { VERSION } from "../../cli/src/version";

/** this add-on's version (captionseasy >= 0.2.0 checks it before passing 0.2.0-only options) */
export const version: string = VERSION;
import type { RenderOptionsExt, RenderResultExt } from "./render";

/**
 * Caption a local video. Transcribes first when no words are given (needs captionseasy-transcribe).
 * overlayFormat "png-sequence" writes a folder of transparent PNGs (frame_0000.png ...) for ffmpeg / editors.
 */
export const render: (opts: RenderOptionsExt) => Promise<RenderResultExt> = _render;
export type { RenderOptions, RenderResult } from "../../cli/src/types";
export type { RenderOptionsExt, RenderResultExt, RenderOverlayFormat } from "./render";
