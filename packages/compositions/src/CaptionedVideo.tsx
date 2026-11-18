import React, { useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useRemotionEnvironment, useVideoConfig } from "remotion";
import { Video as MediaVideo } from "@remotion/media";
import { CaptionDocSchema, type CaptionStyleV2, ProjectSettingsSchema, type CaptionDoc, type LayoutSafety, type Page, type ProjectSettings } from "@capseasy/shared";
import { applyFillerFilter, applyProfanity, bandFor, derivePages, hinglishSpellingWords, placePages, resolveSafeZone, romanizeWords } from "@motion-ai/caption-engine/core";
import { EMOJI_FONT, PageView, VideoFrameBus, VideoFrameContext, famCss, getFontEntry, getTemplate, layoutBox, measure, measureCardBox, resolveStyle, scaleOf, scriptFallbackFamilies, useFontsReady, wordGapEm, wordGapPx, type Canvas } from "@capseasy/templates";
import { CaptionTrackSchema, type CaptionedVideoInput } from "./props";
import { fxAt, planTracks, separateLayers, type FxPage, type PlannedTrack } from "./tracks";

/** Doc -> what the audience should see (filters are display-time, so the stored doc is never mutated). */
export function prepareDoc(doc: CaptionDoc, settings: ProjectSettings): CaptionDoc {
  let d = doc;
  if (settings.removeFillers) d = applyFillerFilter(d, settings.fillerList.length ? settings.fillerList : undefined, true);
  if (settings.profanity !== "off") d = applyProfanity(d, settings.profanity);
  // settings.romanize: Devanagari words shown in Hinglish (built-in romanizer); Latin-only docs are returned as is
  if (settings.romanize) {
    const words = romanizeWords(d.words);
    if (words !== d.words) d = { ...d, words };
  }
  // settings.hinglishSpelling "creator": scholarly romanized Hindi shown as creators type it (opt-in)
  if (settings.hinglishSpelling === "creator") {
    const words = hinglishSpellingWords(d.words);
    if (words !== d.words) d = { ...d, words };
  }
  return d;
}

/**
 * doc + settings + style -> pages, using real font metrics. The render, the Player AND the editor's caption
 * list all call this, so what is listed is exactly what is shown. Call only after fonts have loaded.
 */
export function computePages(doc: CaptionDoc, settings: ProjectSettings, style: CaptionStyleV2, canvas: Canvas): Page[] {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas);
  const spec = { fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, letterSpacing: style.letterSpacing * sc };
  const size = style.fontSize * sc;
  const at = { ...spec, fontSize: size };
  // words render as separate boxes with an explicit gap (see wordGapCss), not a space glyph: measure the same way
  const space = Math.max(0, measure("a a", at) - measure("aa", at));
  const gap = wordGapEm(style) * size + wordGapPx(style, sc);
  return derivePages(prepareDoc(doc, settings), settings, {
    measure: (text) => measure(text, at) + (text.split(" ").length - 1) * (gap - space),
    maxLineWidth: box.width,
  });
}

const PageSequence: React.FC<{ page: Page; fromFrame: number; canvas: Canvas; style: CaptionStyleV2 }> = ({ page, fromFrame, canvas, style }) => {
  const frame = useCurrentFrame();
  // absolute media time, derived from frames only (never a wall clock)
  const timeMs = ((fromFrame + frame) / canvas.fps) * 1000;
  const pageStyle = page.styleOverride ? resolveStyle(style, page.styleOverride) : style;
  return <PageView page={page} timeMs={timeMs} style={pageStyle} canvas={canvas} measure={measure} />;
};

/** A page of a multi-look track: the same PageView, inside a whole-card wrapper only while a transition plays. */
export const TrackPageView: React.FC<{ page: FxPage; timeMs: number; canvas: Canvas; style: CaptionStyleV2 }> = ({ page, timeMs, canvas, style }) => {
  if (timeMs < page.startMs || timeMs >= page.endMs) return null;
  let pageStyle = page.styleOverride ? resolveStyle(style, page.styleOverride) : style;
  const fx = fxAt(page.fx, timeMs, pageStyle.fontSize * scaleOf(canvas));
  if (fx.stylePatch) pageStyle = resolveStyle(pageStyle, fx.stylePatch);
  const view = <PageView page={page} timeMs={timeMs} style={pageStyle} canvas={canvas} measure={measure} />;
  if (!fx.css || !Object.keys(fx.css).length) return view;
  return <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", ...fx.css }}>{view}</div>;
};
const TrackPageSequence: React.FC<{ page: FxPage; fromFrame: number; canvas: Canvas; style: CaptionStyleV2 }> = ({ page, fromFrame, canvas, style }) => {
  const frame = useCurrentFrame();
  // absolute media time, derived from frames only (never a wall clock)
  return <TrackPageView page={page} timeMs={((fromFrame + frame) / canvas.fps) * 1000} canvas={canvas} style={style} />;
};

/**
 * Multi-look tracks -> planned pages per track (each track paginated with its own look, settings and fonts, layout
 * safety applied, then the hand-over transitions of each layer). Call only after fonts have loaded.
 */
export function computeTrackPages(tracks: CaptionTrackParsed[], layout: LayoutSafety | null | undefined, canvas: Canvas): PlannedTrack[] {
  const planned = planTracks(
    tracks.map((t) => ({
      layer: t.layer,
      style: t.resolved,
      gapBehavior: t.settings.gapBehavior,
      transition: t.transition,
      exit: t.exit,
      pages: applyLayoutSafety(computePages(t.doc, t.settings, t.resolved, canvas), layout, t.resolved, canvas).map((p) => ({ ...p, id: `${t.id}:${p.id}` })),
    })),
    canvas,
  );
  // stamps (higher layers) never sit on the body card under them
  return separateLayers(planned, {
    canvas,
    safe: resolveSafeZone(layout?.safeZone, canvas),
    measure: (p, st) => measureCardBox(p, st, canvas, measure),
    bandOf: (st) => getTemplate(st.templateId).placementBand ?? bandFor(st.position.y),
  });
}
export type CaptionTrackParsed = ReturnType<typeof CaptionTrackSchema.parse> & { resolved: CaptionStyleV2 };
export const parseTracks = (tracks: unknown[]): CaptionTrackParsed[] =>
  tracks.map((raw, i) => {
    const t = CaptionTrackSchema.parse({ id: `t${i}`, ...(raw as object) });
    return { ...t, resolved: resolveStyle(t.style as Partial<CaptionStyleV2>) };
  });

/**
 * Remotion does NOT run inputProps through the zod schema at render time, and the Player passes props
 * verbatim, so every surface must normalize here. Partial settings/styles are completed with defaults.
 */
/**
 * Layout safety (safe zones + avoid boxes over time) applied to derived pages through page.position (and
 * styleOverride.fontSize for shrink-to-fit). No `layout` -> the same pages array, untouched.
 */
export function applyLayoutSafety(pages: Page[], layout: LayoutSafety | null | undefined, style: CaptionStyleV2, canvas: Canvas): Page[] {
  if (!layout || (!layout.safeZone && !layout.avoid?.length)) return pages;
  return placePages(pages, layout, {
    canvas,
    defaultCenter: style.position,
    measure: (p) => measureCardBox(p, p.styleOverride ? resolveStyle(style, p.styleOverride) : style, canvas, measure),
    band: getTemplate(style.templateId).placementBand,
    fontSize: style.fontSize,
  });
}

/** How many times the Player quietly reloads a video the browser failed to read before it shows "Reload preview". */
export const PLAYER_VIDEO_RELOADS = 3;

/** Event the Player fires on window when its video can't be read (the app reports it as a warning, never a crash). */
export const PREVIEW_VIDEO_ERROR_EVENT = "captionseasy:preview-video-error";

/**
 * In the Player, Chrome sometimes fails to read a local blob video mid-seek ("PIPELINE_ERROR_READ: FFmpegDemuxer:
 * demuxer seek failed"). Without an onError, Remotion throws from an event listener and the preview dies
 * (Sentry SENTRY-COPPER-QUEEN-C). Here the error never escapes: the <video> is remounted (a fresh element usually
 * reads the file fine), up to PLAYER_VIDEO_RELOADS times per source; after that the preview shows a calm
 * "Reload preview" state and the error is announced as PREVIEW_VIDEO_ERROR_EVENT for the app to log.
 */
export function usePlayerVideoRecovery(src: string | null) {
  const [state, setState] = React.useState({ src, reloads: 0, failed: false });
  const current = state.src === src ? state : { src, reloads: 0, failed: false }; // a new source starts fresh
  const onError = React.useCallback(
    (err: Error) => {
      const next = nextVideoReload(current.reloads);
      if (next === null) {
        console.warn("[captions] the preview couldn't read this video:", err.message);
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PREVIEW_VIDEO_ERROR_EVENT, { detail: { message: err.message, reloads: current.reloads } }));
        setState({ src, reloads: current.reloads, failed: true });
        return;
      }
      console.warn(`[captions] reloading the preview video after a playback error (${next}/${PLAYER_VIDEO_RELOADS}):`, err.message);
      setState({ src, reloads: next, failed: false });
    },
    [src, current.reloads],
  );
  const reload = React.useCallback(() => setState({ src, reloads: 0, failed: false }), [src]);
  return { key: playerVideoKey(src, current.reloads), failed: current.failed, onError, reload };
}

/** The reload count after a playback error, or null when the quiet reloads are used up. */
export function nextVideoReload(reloads: number): number | null {
  return reloads >= PLAYER_VIDEO_RELOADS ? null : reloads + 1;
}

/** A new key per reload remounts the <video> element; the source stays the same. */
export function playerVideoKey(src: string | null, reloads: number): string {
  return `${src ?? ""}#${reloads}`;
}

/** Shown in the Player (never in a render) when the video still can't be read after the quiet reloads. */
const PreviewVideoUnavailable: React.FC<{ onReload: () => void }> = ({ onReload }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 14, color: "rgba(255,255,255,0.86)", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 32 }}>
    <div style={{ fontSize: 28, maxWidth: 640, lineHeight: 1.35 }}>The preview lost its place in this video. Your captions and edits are safe.</div>
    <button
      type="button"
      // the Player toggles play on any click: keep this one to ourselves, or playback starts mid-reload
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onReload();
      }}
      style={{ fontSize: 26, padding: "12px 28px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.12)", color: "white", cursor: "pointer" }}
    >
      Reload preview
    </button>
  </AbsoluteFill>
);

export const CaptionedVideo: React.FC<CaptionedVideoInput> = ({ src = null, doc: docIn, style: styleIn, settings: settingsIn, mode = "burn", backdrop = null, videoEngine = "offthread", layout = null, tracks: tracksIn = null }) => {
  const doc = useMemo(() => CaptionDocSchema.parse(docIn ?? { version: 2, words: [] }), [docIn]);
  const settings = useMemo(() => ProjectSettingsSchema.parse(settingsIn ?? {}), [settingsIn]);
  const style = styleIn ?? {};
  const { fps, width, height } = useVideoConfig();
  const canvas = useMemo<Canvas>(() => ({ width, height, fps }), [width, height, fps]);
  const resolved = useMemo(() => resolveStyle(style as Partial<CaptionStyleV2>), [style]);

  const shownDoc = useMemo(() => prepareDoc(doc, settings), [doc, settings]);
  // multi-look tracks (opt-in): absent/empty = the single-look render below, unchanged
  const tracks = useMemo(() => (tracksIn && tracksIn.length ? parseTracks(tracksIn) : null), [tracksIn]);
  const fontFamilies = useMemo(() => {
    const families = (s: CaptionStyleV2, words: CaptionDoc["words"]) => {
      const look = [s.fontId, s.hero.fontId ?? "", ...getTemplate(s.templateId).fonts];
      // Devanagari words: the look's partner Devanagari font (nothing is added for Latin-only tracks)
      return [...look, s.emoji.enabled ? EMOJI_FONT : "", ...scriptFallbackFamilies(words, look, (f) => getFontEntry(f)?.category)];
    };
    if (!tracks) return families(resolved, shownDoc.words);
    return [...new Set(tracks.flatMap((t) => families(t.resolved, prepareDoc(t.doc, t.settings).words)))];
  }, [resolved, shownDoc, tracks]);
  const fontsReady = useFontsReady(fontFamilies);

  const pages = useMemo(() => (fontsReady && !tracks ? applyLayoutSafety(computePages(doc, settings, resolved, canvas), layout, resolved, canvas) : []), [fontsReady, tracks, doc, settings, resolved, canvas, layout]);
  const planned = useMemo(() => (fontsReady && tracks ? computeTrackPages(tracks, layout, canvas) : null), [fontsReady, tracks, layout, canvas]);

  // The in-browser exporter redraws the DOM on a canvas and ignores mix-blend-mode, so a look that blends with the
  // picture (the difference look) composites it itself from the video layer's frames (see templates videoFrame.ts).
  // Only there: the Player and the server renderer blend natively.
  const { isClientSideRendering, isPlayer } = useRemotionEnvironment();
  const frameBus = useMemo(() => (isClientSideRendering && mode === "burn" && src ? new VideoFrameBus() : null), [isClientSideRendering, mode, src]);
  const recovery = usePlayerVideoRecovery(src);

  return (
    <AbsoluteFill>
      {mode === "burn" && src ? (
        <AbsoluteFill style={{ backgroundColor: "black" }}>
          {videoEngine === "media" ? (
            <MediaVideo src={src} objectFit="contain" style={{ width: "100%", height: "100%" }} onVideoFrame={frameBus?.emit} />
          ) : (
            isPlayer && recovery.failed ? (
              <PreviewVideoUnavailable onReload={recovery.reload} />
            ) : (
              <OffthreadVideo
                key={isPlayer ? recovery.key : undefined}
                src={src}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={isPlayer ? recovery.onError : undefined}
              />
            )
          )}
        </AbsoluteFill>
      ) : mode === "burn" && backdrop ? (
        <AbsoluteFill style={{ background: backdrop }} />
      ) : null}
      <VideoFrameContext.Provider value={frameBus}>
        {planned
          ? planned
              .map((t, i) => ({ t, i }))
              .sort((a, b) => a.t.layer - b.t.layer || a.i - b.i)
              .flatMap(({ t }) =>
                t.pages.map((page) => {
                  const from = Math.floor((page.startMs / 1000) * fps);
                  const duration = Math.max(1, Math.ceil(((page.endMs - page.startMs) / 1000) * fps));
                  return (
                    <Sequence key={page.id} from={from} durationInFrames={duration} layout="none">
                      <TrackPageSequence page={page} fromFrame={from} canvas={canvas} style={t.style} />
                    </Sequence>
                  );
                }),
              )
          : null}
        {pages.map((page) => {
          const from = Math.floor((page.startMs / 1000) * fps);
          const duration = Math.max(1, Math.ceil(((page.endMs - page.startMs) / 1000) * fps));
          return (
            <Sequence key={page.id} from={from} durationInFrames={duration} layout="none">
              <PageSequence page={page} fromFrame={from} canvas={canvas} style={resolved} />
            </Sequence>
          );
        })}
      </VideoFrameContext.Provider>
    </AbsoluteFill>
  );
};
