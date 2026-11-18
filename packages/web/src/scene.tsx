/**
 * The React side: the CaptionedVideo composition (the exact component the studio previews and captionseasy-render
 * renders), mounted with Remotion's root contexts the way @remotion/web-renderer mounts it, at a frame we choose.
 */
import React, { createRef, useEffect, useImperativeHandle, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Internals, useDelayRender } from "remotion";
import { CaptionedVideo } from "@capseasy/compositions/src/CaptionedVideo";
import { recordFontFaces } from "./svg";

const COMP_ID = "CaptionsEasyWeb";

type GlobalScope = { remotion_renderReady?: boolean; remotion_delayRenderHandles?: number[] };
const globalScope = (): GlobalScope => (typeof window === "undefined" ? {} : (window as unknown as GlobalScope));

/** true while some global delayRender() (caption fonts, knockout fonts) is still pending */
export const globalPending = (): boolean => {
  const g = globalScope();
  return g.remotion_renderReady === false || (g.remotion_delayRenderHandles?.length ?? 0) > 0;
};

/** setTimeout-based tick: requestAnimationFrame does not fire in background tabs */
const tick = (fn: () => void) => setTimeout(fn, 16);

/**
 * The templates hold their font loading with the GLOBAL delayRender() (window scope), which @remotion/web-renderer
 * does not watch (it only watches its own scope). This bridge holds a scoped delayRender until the global ones are
 * released (pages are committed by then: useFontsReady continues only after React committed them), so no frame is
 * ever captured with missing captions or fallback glyphs.
 */
export const CaptionsScene: React.FC<Record<string, unknown>> = (props) => {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("captionseasy-web: caption fonts"));
  useEffect(() => {
    let alive = true;
    let settled = 0;
    const check = () => {
      if (!alive) return;
      // two quiet ticks in a row: a late delayRender (a font chunk resolving) gets a chance to register
      settled = globalPending() ? 0 : settled + 1;
      if (settled >= 2) continueRender(handle);
      else tick(check);
    };
    tick(check);
    return () => {
      alive = false;
    };
  }, [handle, continueRender]);
  const Comp = CaptionedVideo as unknown as React.FC<Record<string, unknown>>;
  return <Comp {...props} />;
};

type TimeHandle = { update: (frame: number) => void };

const FrameState: React.FC<{ initialFrame: number; timeRef: React.Ref<TimeHandle>; children: React.ReactNode }> = ({ initialFrame, timeRef, children }) => {
  const [frame, setFrame] = useState(initialFrame);
  useImperativeHandle(timeRef, () => ({ update: (f: number) => flushSync(() => setFrame(f)) }), []);
  return (
    <Internals.RemotionRootContexts audioEnabled={false} videoEnabled logLevel="error" numberOfAudioTags={0} audioLatencyHint="interactive" previewSampleRate={null} frameState={{ [COMP_ID]: frame }}>
      {children}
    </Internals.RemotionRootContexts>
  );
};

export interface SceneMount {
  /** the element the composition renders into (width x height px, unscaled) */
  root: HTMLDivElement;
  /** the base CSS injected for the root's class (Remotion's default composition CSS) */
  css: string;
  setFrame(frame: number): void;
  setProps(props: Record<string, unknown>): void;
  /** resolves once fonts are loaded and the captions are committed */
  ready(): Promise<void>;
  destroy(): void;
}

/** Mount the composition into `host` (a live DOM mount, the DOM renderer and ready()). */
export function mountScene(host: HTMLElement, inputProps: Record<string, unknown>, cfg: { width: number; height: number; fps: number; durationInFrames: number; frame: number }): SceneMount {
  recordFontFaces();
  const div = document.createElement("div");
  Object.assign(div.style, { position: "absolute", top: "0", left: "0", display: "flex", flexDirection: "column", backgroundColor: "transparent", width: `${cfg.width}px`, height: `${cfg.height}px`, transformOrigin: "0 0", pointerEvents: "none" });
  const cls = `captionseasy-web-${Math.random().toString(36).slice(2, 12)}`;
  div.className = cls;
  // the same base CSS the Remotion renderers give a composition (font smoothing, box sizing ...)
  const css = Internals.CSSUtils.makeDefaultPreviewCSS(`.${cls}`, "white");
  const cleanupCSS = Internals.CSSUtils.injectCSS(css);
  host.appendChild(div);

  const scope = { remotion_renderReady: true, remotion_delayRenderTimeouts: {}, remotion_puppeteerTimeout: 60_000, remotion_attempt: 0, remotion_delayRenderHandles: [] as number[] };
  const timeRef = createRef<TimeHandle>();
  const root: Root = createRoot(div);
  let props = inputProps;

  const manager = () =>
    ({
      compositions: [{ id: COMP_ID, component: CaptionsScene, nonce: [[0, 0]], defaultProps: {}, folderName: null, parentFolderName: null, schema: null, calculateMetadata: null, durationInFrames: cfg.durationInFrames, fps: cfg.fps, height: cfg.height, width: cfg.width }],
      canvasContent: { type: "composition", compositionId: COMP_ID },
      currentCompositionMetadata: { props, durationInFrames: cfg.durationInFrames, fps: cfg.fps, height: cfg.height, width: cfg.width, defaultCodec: null, defaultOutName: null, defaultVideoImageFormat: null, defaultPixelFormat: null, defaultProResProfile: null, defaultSampleRate: null },
      folders: [],
    }) as never;
  const tree = () => (
    <Internals.RemotionEnvironmentContext.Provider value={{ isStudio: false, isRendering: true, isPlayer: false, isReadOnlyStudio: false, isClientSideRendering: true }}>
      <Internals.DelayRenderContextType.Provider value={scope as never}>
        <Internals.CompositionManager.Provider value={manager()}>
          <Internals.RenderAssetManagerProvider collectAssets={null}>
            <FrameState initialFrame={cfg.frame} timeRef={timeRef}>
              <Internals.CanUseRemotionHooks.Provider value>
                <CaptionsScene {...props} />
              </Internals.CanUseRemotionHooks.Provider>
            </FrameState>
          </Internals.RenderAssetManagerProvider>
        </Internals.CompositionManager.Provider>
      </Internals.DelayRenderContextType.Provider>
    </Internals.RemotionEnvironmentContext.Provider>
  );

  flushSync(() => root.render(tree()));

  return {
    root: div,
    css,
    setFrame: (f) => timeRef.current?.update(f),
    setProps: (p) => {
      props = p;
      flushSync(() => root.render(tree()));
    },
    ready: () =>
      new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const check = () => {
          const cancelled = (scope as { remotion_cancelledError?: string }).remotion_cancelledError;
          if (cancelled) return reject(new Error(cancelled.split("\n")[0]));
          if (scope.remotion_renderReady && !globalPending()) return resolve();
          if (Date.now() - started > 65_000) return reject(new Error("captionseasy-web: fonts did not load within 65 s"));
          tick(check);
        };
        check();
      }),
    destroy: () => {
      root.unmount();
      div.remove();
      cleanupCSS();
    },
  };
}
