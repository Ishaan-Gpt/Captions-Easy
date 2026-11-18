// Typings for `captionseasy/react` (copied to dist/react.d.ts at build time).
import type { CSSProperties, JSX, RefObject, VideoHTMLAttributes } from "react";
import type { CaptionsProps } from "./types.js";

export interface CaptionsLayerProps {
  /** the props from buildCaptions() */
  captions: Pick<CaptionsProps, "doc" | "style" | "settings"> & Partial<Pick<CaptionsProps, "layout" | "tracks">>;
  /** follow this video: its time (play, pause, seek, playback rate), its size and its duration */
  video?: RefObject<HTMLVideoElement | null>;
  /** or drive the time yourself (ms); wins over `video` when both are given */
  timeMs?: number;
  /** the frame the captions are laid out for (default: the video's own size, else 1080 x 1920) */
  width?: number;
  height?: number;
  /** caption animation frame rate (default 30) */
  fps?: number;
  className?: string;
  /** the layer fills its positioned parent (position: absolute; inset: 0) unless you override it */
  style?: CSSProperties;
  /** extra @remotion/player props (e.g. acknowledgeRemotionLicense) */
  playerProps?: Record<string, unknown>;
}

export interface CaptionedVideoPlayerProps extends Omit<CaptionsLayerProps, "video" | "timeMs"> {
  /** the video URL */
  src: string;
  /** passed to the <video> (controls, autoPlay, muted, loop, poster ...) */
  videoProps?: VideoHTMLAttributes<HTMLVideoElement>;
}

/** Transparent captions over your own video, frame-locked to it. Put it inside a positioned parent that matches the video's box. */
export declare function Captions(props: CaptionsLayerProps): JSX.Element;
/** A <video> with its captions on top, in one tag. */
export declare function CaptionedVideoPlayer(props: CaptionedVideoPlayerProps): JSX.Element;
/** The current time (ms) of a <video>: every animation frame while it plays, and on every seek. */
export declare function useVideoTime(video: RefObject<HTMLVideoElement | null> | undefined): number;
