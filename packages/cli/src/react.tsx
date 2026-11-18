/**
 * `captionseasy/react`: captions in your own React app, locked to your own <video> (or any clock you own).
 *
 *   const video = useRef<HTMLVideoElement>(null);
 *   <div style={{ position: "relative" }}>
 *     <video ref={video} src={url} controls />
 *     <Captions captions={props} video={video} />           // follows play, pause, seek and playback rate
 *   </div>
 *
 *   <Captions captions={props} timeMs={ms} width={1080} height={1920} />   // or drive the time yourself
 *
 * Built on @remotion/player's public API (a paused Player seeked to your clock every frame), so it keeps working as
 * Remotion updates. react, remotion and @remotion/player are peer dependencies.
 */
import React, { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionsOverlay } from "./remotion";
import type { CaptionsProps } from "./types";

export interface CaptionsLayerProps {
  /** the props from buildCaptions() */
  captions: Pick<CaptionsProps, "doc" | "style" | "settings"> & Partial<Pick<CaptionsProps, "layout" | "tracks">>;
  /** follow this video: its time, its size (videoWidth / videoHeight) and its duration */
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
  /** extra @remotion/player props (e.g. acknowledgeRemotionLicense, numberOfSharedAudioTags) */
  playerProps?: Record<string, unknown>;
}

const lastWordEnd = (c: CaptionsLayerProps["captions"]) => {
  const ws = c.doc?.words ?? [];
  return ws.length ? Math.max(...ws.map((w) => w.endMs)) : 0;
};

/** The current time (ms) of a <video>, updated every animation frame while it plays and on every seek. */
export function useVideoTime(video: RefObject<HTMLVideoElement | null> | undefined): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const v = video?.current;
    if (!v) return;
    let raf = 0;
    const read = () => setMs(v.currentTime * 1000);
    const loop = () => {
      read();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      read();
    };
    const events: [string, () => void][] = [["play", start], ["playing", start], ["pause", stop], ["ended", stop], ["seeked", read], ["seeking", read], ["loadedmetadata", read], ["timeupdate", read]];
    for (const [e, f] of events) v.addEventListener(e, f);
    if (!v.paused) start();
    else read();
    return () => {
      cancelAnimationFrame(raf);
      for (const [e, f] of events) v.removeEventListener(e, f);
    };
  }, [video]);
  return ms;
}

/** The size of a <video> once its metadata is known. */
function useVideoSize(video: RefObject<HTMLVideoElement | null> | undefined) {
  const [size, setSize] = useState<{ width: number; height: number; durationMs: number } | null>(null);
  useEffect(() => {
    const v = video?.current;
    if (!v) return;
    const read = () => {
      if (v.videoWidth > 0) setSize({ width: v.videoWidth, height: v.videoHeight, durationMs: Number.isFinite(v.duration) ? v.duration * 1000 : 0 });
    };
    read();
    v.addEventListener("loadedmetadata", read);
    v.addEventListener("durationchange", read);
    return () => {
      v.removeEventListener("loadedmetadata", read);
      v.removeEventListener("durationchange", read);
    };
  }, [video]);
  return size;
}

/** Transparent captions over your own video, frame-locked to it. */
export function Captions({ captions, video, timeMs, width, height, fps = 30, className, style, playerProps }: CaptionsLayerProps) {
  const videoTime = useVideoTime(timeMs === undefined ? video : undefined);
  const meta = useVideoSize(video);
  const t = timeMs ?? videoTime;
  const W = width ?? meta?.width ?? 1080;
  const H = height ?? meta?.height ?? 1920;
  const durationMs = Math.max(meta?.durationMs ?? 0, lastWordEnd(captions) + 1000, 1000);
  const durationInFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));
  const player = useRef<PlayerRef>(null);
  const inputProps = useMemo(
    () => ({ ...captions, media: { width: W, height: H, fps, durationMs } }),
    [captions, W, H, fps, durationMs],
  );

  useEffect(() => {
    const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round((t / 1000) * fps)));
    if (player.current && player.current.getCurrentFrame() !== frame) player.current.seekTo(frame);
  }, [t, fps, durationInFrames]);

  return (
    <div className={className} style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }} aria-hidden>
      <Player
        ref={player}
        component={CaptionsOverlay as unknown as React.FC<Record<string, unknown>>}
        inputProps={inputProps as unknown as Record<string, unknown>}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={W}
        compositionHeight={H}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        {...playerProps}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      />
    </div>
  );
}

export interface CaptionedVideoPlayerProps extends Omit<CaptionsLayerProps, "video" | "timeMs"> {
  /** the video URL */
  src: string;
  /** passed to the <video> (controls, autoPlay, muted, loop, poster ...) */
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
}

/** A <video> with its captions on top: the whole thing in one tag. */
export function CaptionedVideoPlayer({ src, videoProps, className, style, ...layer }: CaptionedVideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  return (
    <div className={className} style={{ position: "relative", display: "inline-block", lineHeight: 0, ...style }}>
      <video ref={ref} src={src} playsInline {...videoProps} style={{ display: "block", width: "100%", height: "100%", ...videoProps?.style }} />
      <Captions {...layer} video={ref} />
    </div>
  );
}
