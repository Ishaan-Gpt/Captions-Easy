/**
 * Pack: Moovi's premium captions (Premium Caption 1.1, 1.2, 2, 3 and 4), each approved by Ishaan on a reference reel
 * in Moovi and imported here as looks. Wired in through ./index.ts.
 *
 * The drawing is Moovi's own painter (./moovi/draw.ts, presets.ts, theme.ts), ported with only the changes CaptionsEasy
 * needs: it paints one page (the card) on a full-frame <canvas>, pure in `timeMs`. At the look's defaults every tier,
 * colour and curve is exactly Moovi's preset; the Style controls change the preset (`resolvePreset`):
 *   font / weight-less italic / casing / letter and word spacing  the plain tiers (lead, tail)
 *   size, hero size, hero font                                      every tier / the key tier
 *   highlight colour                                                the accent the key's fill ramp and bloom come from
 *   text colour or gradient, outline, shadow, glow                  replace the preset's own (left alone at the defaults)
 *   position, max width, rotation, exit, motion intensity           where the card sits, how far it moves
 *
 * What Moovi has and CaptionsEasy does not: a face box and a person matte. Without them the tiers marked "behind the
 * speaker" draw in front, and the stack and poster cards sit in the caption box (defaults low on the frame, so the
 * giant key word lands on the chest, off the face; move it with position).
 *
 * Premium Caption 3's shiny negative needs the picture under the letters:
 *  - Player and server render: the letters go white into a second canvas in CSS `mix-blend-mode: difference` (the
 *    frame inverted, the background decides the colour), the sheen on the normal canvas over it.
 *  - In-browser export (@remotion/web-renderer ignores mix-blend-mode): the frame the video layer decoded
 *    (VideoFrameBus, see ../videoFrame.ts) is placed on the frame and the painter samples it, Moovi's full effect.
 */
import React, { useContext, useLayoutEffect, useRef } from "react";
import { useDelayRender, useRemotionEnvironment } from "remotion";
import type { CaptionStyleV2 } from "@capseasy/shared";
import type { LookSeed } from "../looks/new";
import { exitStyle, showAt } from "../motion";
import { fontStack } from "../fontCatalog";
import type { PageRenderProps, TemplateDefinition } from "../types";
import { VideoFrameContext, containRect, frameSourceSize, type VideoFrameBus } from "../videoFrame";
import { NO_EXIT, OWN_ENTRANCE, intensityOf, premiumCaps } from "./premium-b-kit";
import { drawCard, pageCard, type Card, type Scene, type Word as MWord } from "./moovi/draw";
import { REF_ACCENTS, REF_ACCENT_2, REF_ACCENT_4, premiumCaption1, premiumCaption2, premiumCaption3, premiumCaption4, type PremiumPreset, type TierSpec } from "./moovi/presets";

type Variant = "1.1" | "1.2" | "2" | "3" | "4";

/** the preset for an accent (Caption 3 takes its colour from the frame, so it has none) */
const PRESETS: Record<Variant, (accent: string) => PremiumPreset> = {
  "1.1": (a) => premiumCaption1("1.1", a),
  "1.2": (a) => premiumCaption1("1.2", a),
  "2": (a) => premiumCaption2(a),
  "3": () => premiumCaption3(),
  "4": (a) => premiumCaption4(a),
};
const ACCENTS: Record<Variant, string> = { "1.1": REF_ACCENTS["1.1"], "1.2": REF_ACCENTS["1.2"], "2": REF_ACCENT_2, "3": "#FFFFFF", "4": REF_ACCENT_4 };
/** the tiers the font, casing, colour and spacing controls set: Caption 4's lead is its fixed script, so only its sans line */
const PLAIN: Record<Variant, number[]> = { "1.1": [0], "1.2": [0], "2": [0, 2], "3": [0, 2], "4": [2] };

/** style.fontSize at which every tier is the preset's own size */
const SIZE = 100;
/** the shadow the looks list as theirs: while the style keeps it, every tier keeps its own preset shadow */
const SHADOW = { x: 0, y: 8, blur: 32, color: "rgba(0,0,0,0.7)" };
/** the glow radius at which the preset's bloom keeps its own radii */
const GLOW_R = 24;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const casingOf = (c: CaptionStyleV2["casing"]): TierSpec["casing"] => c;

/** the template's style defaults: the values at which resolvePreset returns Moovi's preset unchanged */
function defaultsOf(v: Variant): Partial<CaptionStyleV2> {
  const p = PRESETS[v](ACCENTS[v]);
  const plain = p.tiers[PLAIN[v][0]!]!;
  const key = p.tiers[1];
  return {
    fontId: plain.font, fontWeight: plain.weight, fontStyle: plain.italic ? "italic" : "normal", fontSize: SIZE,
    casing: plain.casing ?? "upper", letterSpacing: 0, wordSpacing: 0, lineHeight: 1, maxWidth: 0.9,
    position: { x: 0.5, y: v === "3" || v === "4" ? 0.7 : p.y }, rotation: 0,
    fill: { type: "solid", color: "#FFFFFF" }, stroke: { enabled: false, width: 4, color: "#000000" }, shadows: [SHADOW],
    glow: key.glow ? { enabled: true, color: key.glow.color, radius: GLOW_R, intensity: 1 } : { enabled: false, color: "#FFFFFF", radius: GLOW_R, intensity: 1 },
    hero: { scale: 1, rotate: 0 }, active: { effect: "none", color: ACCENTS[v], scale: 1, boxRadius: 12 },
    entrance: OWN_ENTRANCE, exit: NO_EXIT, motionIntensity: 1,
  };
}
const DEFAULTS: Record<Variant, Partial<CaptionStyleV2>> = { "1.1": defaultsOf("1.1"), "1.2": defaultsOf("1.2"), "2": defaultsOf("2"), "3": defaultsOf("3"), "4": defaultsOf("4") };

/** Moovi's preset with the creator's Style controls applied (identity at the look's defaults). */
export function resolvePreset(v: Variant, style: CaptionStyleV2, k: number, box: { x: number; y: number; w: number }): PremiumPreset {
  const d = DEFAULTS[v];
  const base = PRESETS[v](v === "3" ? ACCENTS[v] : style.active.color);
  const sizeK = style.fontSize / SIZE;
  const tiers = base.tiers.map((t) => (t ? { ...t } : t)) as PremiumPreset["tiers"];
  tiers.forEach((t, i) => {
    if (!t) return;
    const isKey = i === 1;
    const plain = PLAIN[v].includes(i);
    t.size *= sizeK * (isKey ? style.hero.scale : 1);
    t.tracking += style.letterSpacing / style.fontSize;
    if (style.wordSpacing) t.wordGap = (t.wordGap ?? 0) + style.wordSpacing / style.fontSize;
    if (plain) {
      t.font = style.fontId;
      t.italic = style.fontStyle === "italic";
      t.casing = casingOf(style.casing);
      if (style.fill.type === "gradient") {
        t.fill = style.fill.stops.map((s) => s.color);
        t.fillAngle = style.fill.angle;
      } else if (!same(style.fill, d.fill)) t.fill = style.fill.color;
    }
    if (isKey && style.hero.fontId) t.font = style.hero.fontId;
    if (style.stroke.enabled && style.stroke.width > 0) t.edge = { color: style.stroke.color, width: style.stroke.width * 2 };
    const sh = style.shadows[0];
    if (!sh) delete t.shadow;
    else if (!same(style.shadows, d.shadows)) t.shadow = { color: sh.color, blur: sh.blur / 1080, dy: sh.y / 1080 };
    // the glow: the preset's bloom at the defaults; a new colour, size or strength re-tints and re-scales it
    const g = style.glow;
    const dg = d.glow!;
    if (!g.enabled) delete t.glow;
    // a look without a bloom of its own grows one on its key word (Caption 3's key is the negative: its plain words)
    else if (t.glow || (!dg.enabled && (v === "3" ? plain : isKey))) {
      const layers = t.glow?.layers ?? [{ r: 0.05, a: 0.3 }, { r: 0.018, a: 0.45 }, { r: 0.005, a: 0.4 }];
      const own = t.glow && same({ c: g.color }, { c: dg.color });
      const rk = g.radius / GLOW_R;
      // the white tiers of Caption 2 keep their own white haze when only the key's colour changes
      const keepColor = own || (t.glow !== undefined && !isKey && v === "2");
      t.glow = {
        color: keepColor ? t.glow!.color : g.color,
        layers: layers.map((l) => ({ r: l.r * rk, a: Math.min(1, l.a * g.intensity), ...(keepColor ? (l.c ? { c: l.c } : {}) : {}) })),
      };
    }
  });
  const kk = Math.max(0, k);
  const e = base.enter;
  return {
    ...base,
    tiers,
    x: box.x,
    y: box.y,
    fitW: box.w,
    gap: base.gap * style.lineHeight,
    enter: {
      ...e,
      scaleFrom: 1 + (e.scaleFrom - 1) * kk,
      blur: e.blur * kk,
      flash: e.flash * kk,
      ...(e.rise !== undefined ? { rise: e.rise * kk } : {}),
    },
  };
}

// ------------------------------------------------------------------------------------------------ spec

interface MooviSpec {
  w: number;
  h: number;
  preset: PremiumPreset;
  card: Card;
  /** seconds, the time the card is painted at */
  t: number;
  /** every face the tiers use, as CSS font shorthands at 100px (what has to be loaded before painting) */
  fonts: string[];
  /** the shiny highlight: needs the picture under it */
  shiny: boolean;
  /** CSS for each layer: rotation about the card and the creator's exit */
  css: { transform: string; transformOrigin: string; opacity?: number; filter?: string };
}

function buildSpec(v: Variant, p: PageRenderProps): MooviSpec {
  const { page, timeMs, style, canvas, settled } = p;
  const W = Math.round(canvas.width);
  const H = Math.round(canvas.height);
  const pos = page.position ?? style.position;
  const sb = style.safeBox;
  const fitW = Math.max(0.2, Math.min(1 - sb.left - sb.right, style.maxWidth));
  const preset = resolvePreset(v, style, intensityOf(p), { x: pos.x, y: pos.y, w: fitW });
  const words: MWord[] = page.words.map((w) => ({ text: w.text, t: showAt(w) / 1000, end: w.endMs / 1000 }));
  const hero = page.words.findIndex((w) => w.emphasis === "hero");
  const card = { ...pageCard(words, preset.tailMax ?? 0, hero), t0: page.startMs / 1000, t1: page.endMs / 1000 };
  // paused / scrubbing: every word landed
  const last = words.length ? words[words.length - 1]!.t : card.t0;
  const t = settled ? Math.max(timeMs / 1000, last + 1.2) : timeMs / 1000;
  const fonts = [...new Set(preset.tiers.filter((x): x is TierSpec => !!x).map((x) => `${x.italic ? "italic " : ""}${x.weight} 100px ${fontStack(x.font)}`))];
  const ex = exitStyle(style, page.endMs - timeMs, settled, style.fontSize * (Math.min(W, H) / 1080));
  const exT = typeof ex.transform === "string" ? ` ${ex.transform}` : "";
  return {
    w: W, h: H, preset, card, t: +t.toFixed(4), fonts, shiny: preset.tiers.some((x) => !!x?.shiny),
    css: {
      transform: `translate(-50%, -50%)${style.rotation ? ` rotate(${style.rotation}deg)` : ""}${exT}`,
      transformOrigin: `${(pos.x * 100).toFixed(2)}% ${(pos.y * 100).toFixed(2)}%`,
      ...(ex.opacity !== undefined ? { opacity: +Number(ex.opacity).toFixed(4) } : {}),
      ...(typeof ex.filter === "string" ? { filter: ex.filter } : {}),
    },
  };
}

// ------------------------------------------------------------------------------------------------ surface

const fontsReady = (fonts: string[]) => typeof document === "undefined" || !document.fonts || fonts.every((f) => document.fonts.check(f, "AZaz"));
const loadFonts = (fonts: string[]) => Promise.all(fonts.map((f) => document.fonts.load(f, "AZaz").catch(() => undefined)));

/** buses whose video stopped handing over frames (past its end): later frames don't wait the full timeout */
const stalled = new WeakMap<VideoFrameBus, number>();

function paint(spec: MooviSpec, main: HTMLCanvasElement, blend: HTMLCanvasElement | null, backdrop: HTMLCanvasElement | null) {
  const ctx = main.getContext("2d");
  if (!ctx) return;
  const b = blend?.getContext("2d") ?? null;
  for (const c of [ctx, b]) {
    if (!c) continue;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.filter = "none";
    c.clearRect(0, 0, spec.w, spec.h);
  }
  const scene: Scene = { backdrop, blend: backdrop ? null : b };
  drawCard(ctx, spec.preset, spec.card, spec.t, spec.w, spec.h, scene);
}

const MooviSurface: React.FC<{ spec: MooviSpec; timeMs: number }> = ({ spec, timeMs }) => {
  const env = useRemotionEnvironment();
  const bus = useContext(VideoFrameContext);
  // only the shiny highlight in the in-browser export needs the frame itself; everything else paints on its own
  const exportPath = spec.shiny && env.isClientSideRendering && bus !== null;
  const { delayRender, continueRender } = useDelayRender();
  const mainRef = useRef<HTMLCanvasElement>(null);
  const blendRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<{ video: HTMLCanvasElement; placed: HTMLCanvasElement } | null>(null);
  const key = JSON.stringify(spec);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const whenFonts = (fn: () => void, done: () => void) => {
      if (fontsReady(spec.fonts)) {
        fn();
        done();
        return;
      }
      loadFonts(spec.fonts).then(() => {
        fn();
        done();
      });
    };

    if (!exportPath || !bus) {
      const native = () => paint(spec, main, blendRef.current, null);
      if (fontsReady(spec.fonts)) {
        native();
        return;
      }
      const h = delayRender(`moovi caption fonts ${spec.fonts.join(", ")}`);
      whenFonts(native, () => continueRender(h));
      return;
    }

    // ---- in-browser export: wait for this frame's picture, place it on the frame, then paint against it
    const off = (offRef.current ??= { video: document.createElement("canvas"), placed: document.createElement("canvas") });
    off.placed.width = spec.w;
    off.placed.height = spec.h;
    const handle = delayRender(`moovi caption, video frame at ${timeMs.toFixed(0)} ms`);
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: () => void = () => undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      unsub();
      continueRender(handle);
    };
    unsub = bus.subscribe((src) => {
      // the frame is an ImageBitmap that is closed right after this callback: copy it now
      const size = frameSourceSize(src);
      let placed: HTMLCanvasElement | null = null;
      if (size) {
        off.video.width = size.w;
        off.video.height = size.h;
        const pc = off.placed.getContext("2d");
        try {
          off.video.getContext("2d")?.drawImage(src, 0, 0);
          if (pc) {
            pc.fillStyle = "#000000";
            pc.fillRect(0, 0, spec.w, spec.h);
            const r = containRect(size.w, size.h, spec.w, spec.h);
            pc.drawImage(off.video, r.x, r.y, r.w, r.h);
            placed = off.placed;
          }
        } catch {
          /* closed / undecodable frame */
        }
      }
      stalled.delete(bus);
      unsub();
      whenFonts(() => paint(spec, main, null, placed), finish);
    });
    // a frame that never comes (past the end of the video): the highlight inverts black rather than stall the export
    const waitMs = stalled.get(bus) === bus.count ? 300 : 20_000;
    timer = setTimeout(() => {
      if (finished) return;
      console.warn(`[capseasy] moovi caption: no video frame at ${timeMs.toFixed(0)} ms; painting the highlight without it`);
      stalled.set(bus, bus.count);
      whenFonts(() => paint(spec, main, null, null), finish);
    }, waitMs);
    return () => finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, exportPath, timeMs]);

  const layer: React.CSSProperties = { position: "absolute", left: spec.w / 2, top: spec.h / 2, width: spec.w, height: spec.h, pointerEvents: "none", ...spec.css };
  const fill: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
  return (
    <>
      {/* the shiny highlight's letters, in difference against everything painted before them (the video) */}
      {spec.shiny && !exportPath ? (
        <div style={{ ...layer, mixBlendMode: "difference" }}>
          <canvas ref={blendRef} width={spec.w} height={spec.h} style={fill} />
        </div>
      ) : null}
      <div style={layer}>
        <canvas ref={mainRef} width={spec.w} height={spec.h} data-moovi={key} style={fill} />
      </div>
    </>
  );
};

const layoutOf = (v: Variant): React.FC<PageRenderProps> => {
  const L: React.FC<PageRenderProps> = (p) => <MooviSurface spec={buildSpec(v, p)} timeMs={p.timeMs} />;
  L.displayName = `MooviCaption${v.replace(".", "_")}`;
  return L;
};

// ------------------------------------------------------------------------------------------------ templates + looks

const fontsOf = (v: Variant) => [...new Set(PRESETS[v](ACCENTS[v]).tiers.filter((x): x is TierSpec => !!x).map((x) => x.font))];
const slug = (v: Variant) => v.replace(".", "_");

const INFO: Record<Variant, { description: string; tags: string[] }> = {
  "1.1": {
    description: "Two tiers of rounded caps: a white lead line over the spoken key word, lit in your accent with a lens bloom; each word pops in soft and snaps sharp with a small bounce",
    tags: ["Lit key word", "Caps", "Bloom"],
  },
  "1.2": {
    description: "A sentence-case white lead over a slanted, lit caps key word in your accent, blooming like a lens flare; each word pops in soft and snaps sharp",
    tags: ["Lit key word", "Slant", "Bloom"],
  },
  "2": {
    description: "Three tiers in an After Effects glow: a white italic lead, the key words tall in gold condensed caps, and a lighter italic tail; every word fades in out of a heavy blur",
    tags: ["Gold key", "Italic mix", "Glow"],
  },
  "3": {
    description: "A stacked card: small white connector words, content words a size up, and the highlight huge as a shiny negative of the video under it, so the background decides its colour",
    tags: ["Shiny negative", "Stack", "Lowercase"],
  },
  "4": {
    description: "A poster card: the key word giant in tall condensed caps, glossy and extruded in 3D, rising letter by letter, with a handwritten script lead and a white sans line",
    tags: ["Poster", "3D key word", "Script mix"],
  },
};

const VARIANTS: Variant[] = ["1.1", "1.2", "2", "3", "4"];

export const PREMIUM_MOOVI_TEMPLATES: TemplateDefinition[] = VARIANTS.map((v) => {
  const p = PRESETS[v](ACCENTS[v]);
  return {
    id: `pack_moovi_caption_${slug(v)}`, name: `Premium Caption ${v}`,
    description: INFO[v].description,
    layout: `pack-moovi-caption-${slug(v)}`,
    defaults: DEFAULTS[v],
    settingsDefaults: { maxWordsPerCard: p.maxWords, maxLines: 3 },
    // Caption 3's highlight has no colour of its own (the frame decides it), so its hero controls have nothing to set
    capabilities: premiumCaps({ hero: v !== "3", weight: false }),
    heroDrawn: v !== "3",
    fonts: fontsOf(v),
    Page: layoutOf(v),
  };
});

export const PREMIUM_MOOVI_LOOKS: LookSeed[] = VARIANTS.map((v) => ({
  id: `moovi_caption_${slug(v)}`, name: `Premium Caption ${v}`, description: INFO[v].description, category: "Premium",
  templateId: `pack_moovi_caption_${slug(v)}`, tags: INFO[v].tags, style: {},
  settings: { maxWordsPerCard: PRESETS[v](ACCENTS[v]).maxWords, maxLines: 3 },
}));
