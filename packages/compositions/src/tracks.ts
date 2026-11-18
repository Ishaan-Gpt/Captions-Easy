/**
 * Multi-look caption tracks (captionseasy 0.2.0): several looks in one video, each owning some of the words, plus the
 * transitions where one look hands over to the next on the same layer. Pure in its inputs (pages are derived per
 * track with real font metrics by the composition first), so every frame is a function of time only.
 *
 * Transitions at a boundary T (the first page of the incoming track starts at T, when its first word is spoken):
 *   cut         the outgoing card holds until T (small gaps are bridged) and is replaced at T.
 *   exit-entry  the outgoing look plays its exit, ending at T + overlapMs, then/while the incoming look plays its own
 *               entrance from T. A look whose layout honours exits plays its own exit (stretched to durationMs);
 *               any other look gets a whole-card envelope of the requested exit kind.
 *   morph       one card turns into the next: both cards travel the same path (outgoing centre -> incoming centre),
 *               scale between the two type sizes and cross-dissolve, and the text colour interpolates. The incoming
 *               card skips its own entrance. Only for compatible looks (word-drawn text layouts with the same casing,
 *               checked when the props are built); everything else falls back to exit-entry.
 * Web exporter caveats: no z-index (layers are DOM order: later tracks draw above), and CSS filter blur may be ignored
 * by the in-browser exporter, so "blur-out" degrades to its fade + scale there.
 */
import type { CaptionStyleV2, Page } from "@capseasy/shared";
import { solvePlacement } from "@motion-ai/caption-engine/core";
import { layoutBox, type Canvas } from "@capseasy/templates";

export const TRACK_TRANSITIONS = ["cut", "exit-entry", "morph"] as const;
export type TrackTransitionType = (typeof TRACK_TRANSITIONS)[number];
/** whole-card exits a track can be given when its look has no exit of its own */
export const ENVELOPE_EXITS = ["fade", "fall", "zoom-out", "blur-out", "slide-up"] as const;
export type EnvelopeExit = (typeof ENVELOPE_EXITS)[number];

export interface TrackTransition {
  type: TrackTransitionType;
  /** exit (exit-entry) or travel (morph) duration */
  durationMs: number;
  /** exit-entry: how long the outgoing exit keeps playing after the incoming card has started */
  overlapMs: number;
}
export interface TrackExit {
  type: string;
  /** the look's layout plays this exit itself (else the composition draws a whole-card envelope) */
  native: boolean;
}

/** Per-page transition effects, all as absolute media-time windows. */
export interface PageFx {
  /** whole-card exit envelope (exit-entry, look without its own exit) */
  exit?: { kind: EnvelopeExit; fromMs: number; toMs: number };
  /** morph, outgoing side: travel toward the incoming card and fade out */
  morphOut?: { fromMs: number; toMs: number; dx: number; dy: number; scale: number; originX: number; originY: number };
  /** morph, incoming side: start where the outgoing card was, settle, fade in; text colour from -> to */
  morphIn?: { fromMs: number; toMs: number; dx: number; dy: number; scale: number; originX: number; originY: number; fromColor?: string; toColor?: string };
}
export type FxPage = Page & { fx?: PageFx };

export interface PlannedTrackInput {
  layer: number;
  style: CaptionStyleV2;
  gapBehavior: "hold" | "clear";
  transition: TrackTransition;
  exit: TrackExit;
  pages: Page[];
}
export interface PlannedTrack {
  layer: number;
  style: CaptionStyleV2;
  pages: FxPage[];
}

/** a hold may bridge this much silence before a hand-over (same as derivePages' hold bridge) */
const BRIDGE_MS = 1500;

const solidColor = (s: CaptionStyleV2) => (s.fill.type === "solid" ? s.fill.color : undefined);

/**
 * Apply the boundary transitions of every layer. Returns one entry per input track (same order) with adjusted page
 * windows (clipped / held / extended) and per-page effects. Tracks with a single look and no neighbours come back
 * with their pages untouched.
 */
export function planTracks(tracks: PlannedTrackInput[], canvas: Canvas): PlannedTrack[] {
  const out: PlannedTrack[] = tracks.map((t) => ({ layer: t.layer, style: t.style, pages: t.pages.map((p) => ({ ...p })) }));
  const layers = [...new Set(tracks.map((t) => t.layer))];
  for (const layer of layers) {
    const seq = out
      .flatMap((t, ti) => (t.layer === layer ? t.pages.map((p, pi) => ({ ti, pi, start: p.startMs })) : []))
      .sort((a, b) => a.start - b.start || a.ti - b.ti);
    for (let k = 0; k + 1 < seq.length; k++) {
      const a = seq[k]!;
      const b = seq[k + 1]!;
      const pa = out[a.ti]!.pages[a.pi]!;
      const pb = out[b.ti]!.pages[b.pi]!;
      const T = pb.startMs;
      if (a.ti === b.ti) continue;
      const ta = tracks[a.ti]!;
      const tb = tracks[b.ti]!;
      // hold the outgoing card up to the hand-over across a short silence, never past it
      const gap = T - pa.endMs;
      const held = gap > 0 && gap <= BRIDGE_MS && ta.gapBehavior === "hold" ? T : Math.min(pa.endMs, T);
      const adjacent = held >= T;
      const tr = tb.transition;
      if (tr.type === "cut" || tr.durationMs <= 0) {
        pa.endMs = Math.max(pa.startMs + 1, held);
        continue;
      }
      if (tr.type === "morph" && adjacent) {
        const d = tr.durationMs;
        const sa = ta.style;
        const sb = tb.style;
        const ca = layoutBox(sa, canvas, pa.position);
        const cb = layoutBox(sb, canvas, pb.position);
        const ratio = sb.fontSize / Math.max(1, sa.fontSize);
        pa.endMs = T + d;
        pa.fx = { ...pa.fx, morphOut: { fromMs: T, toMs: T + d, dx: cb.cx - ca.cx, dy: cb.cy - ca.cy, scale: ratio, originX: ca.cx, originY: ca.cy } };
        const fromColor = solidColor(sa);
        const toColor = solidColor(sb);
        pb.fx = {
          ...pb.fx,
          morphIn: { fromMs: T, toMs: T + d, dx: ca.cx - cb.cx, dy: ca.cy - cb.cy, scale: 1 / ratio, originX: cb.cx, originY: cb.cy, ...(fromColor && toColor && fromColor !== toColor ? { fromColor, toColor } : {}) },
        };
        // the card is already on screen: no second entrance
        pb.styleOverride = { ...(pb.styleOverride ?? {}), entrance: { type: "none" } };
        continue;
      }
      // exit-entry (and morph across a silence, which has nothing to travel from)
      const end = adjacent ? T + tr.overlapMs : held;
      const d = Math.max(0, Math.min(tr.durationMs, (end - pa.startMs) * 0.6));
      pa.endMs = Math.max(pa.startMs + 1, end);
      if (d <= 0) continue;
      if (ta.exit.native) pa.styleOverride = { ...(pa.styleOverride ?? {}), exit: { type: ta.exit.type, durationMs: Math.round(d) } };
      else pa.fx = { ...pa.fx, exit: { kind: (ENVELOPE_EXITS as readonly string[]).includes(ta.exit.type) ? (ta.exit.type as EnvelopeExit) : "fade", fromMs: pa.endMs - d, toMs: pa.endMs } };
    }
  }
  return out;
}

// ---------------------------------------------------------------- per-frame effect values (pure in timeMs)

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeInCubic = (t: number) => t * t * t;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hexRgb(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split("").map((x) => x + x).join("") : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/** sRGB mix of two hex colours (null when either is not a hex colour). */
export function mixColor(a: string, b: string, t: number): string | null {
  const x = hexRgb(a);
  const y = hexRgb(b);
  if (!x || !y) return null;
  const k = clamp01(t);
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

export interface FxFrame {
  /** wrapper CSS for the whole card (null = no wrapper, the page renders exactly as without tracks) */
  css: { opacity?: number; transform?: string; transformOrigin?: string; filter?: string } | null;
  /** per-frame style patch (morph colour) */
  stylePatch: Record<string, unknown> | null;
}

/** The effect values of one page at one media time. */
export function fxAt(fx: PageFx | undefined, timeMs: number, sizePx: number): FxFrame {
  if (!fx) return { css: null, stylePatch: null };
  let opacity = 1;
  let transform = "";
  let origin: string | undefined;
  let filter: string | undefined;
  let stylePatch: Record<string, unknown> | null = null;
  if (fx.exit && timeMs >= fx.exit.fromMs) {
    const p = easeInCubic(clamp01((timeMs - fx.exit.fromMs) / Math.max(1, fx.exit.toMs - fx.exit.fromMs)));
    const u = sizePx;
    opacity *= 1 - p;
    switch (fx.exit.kind) {
      case "fall": transform += ` translateY(${(p * 0.9 * u).toFixed(2)}px) rotate(${(p * 4).toFixed(2)}deg)`; break;
      case "zoom-out": transform += ` scale(${(1 - p * 0.45).toFixed(4)})`; break;
      case "blur-out": filter = `blur(${(p * 0.35 * u).toFixed(2)}px)`; transform += ` scale(${(1 + p * 0.06).toFixed(4)})`; break;
      case "slide-up": transform += ` translateY(${(-p * 0.9 * u).toFixed(2)}px)`; break;
      default: break;
    }
  }
  if (fx.morphOut && timeMs >= fx.morphOut.fromMs) {
    const m = fx.morphOut;
    const p = easeInOutCubic(clamp01((timeMs - m.fromMs) / Math.max(1, m.toMs - m.fromMs)));
    origin = `${m.originX.toFixed(1)}px ${m.originY.toFixed(1)}px`;
    transform += ` translate(${(m.dx * p).toFixed(2)}px, ${(m.dy * p).toFixed(2)}px) scale(${(1 + (m.scale - 1) * p).toFixed(4)})`;
    // gone by two thirds of the travel, so the two cards never read as one muddle
    opacity *= 1 - clamp01(p * 1.5);
  }
  if (fx.morphIn && timeMs < fx.morphIn.toMs) {
    const m = fx.morphIn;
    const p = easeInOutCubic(clamp01((timeMs - m.fromMs) / Math.max(1, m.toMs - m.fromMs)));
    origin = `${m.originX.toFixed(1)}px ${m.originY.toFixed(1)}px`;
    transform += ` translate(${(m.dx * (1 - p)).toFixed(2)}px, ${(m.dy * (1 - p)).toFixed(2)}px) scale(${(m.scale + (1 - m.scale) * p).toFixed(4)})`;
    opacity *= clamp01(0.15 + p * 1.6);
    if (m.fromColor && m.toColor) {
      const c = mixColor(m.fromColor, m.toColor, p);
      if (c) stylePatch = { fill: { type: "solid", color: c } };
    }
  }
  const css: FxFrame["css"] = {};
  if (opacity < 1) css.opacity = Number(opacity.toFixed(4));
  if (transform) css.transform = transform.trim();
  if (origin) css.transformOrigin = origin;
  if (filter) css.filter = filter;
  return { css, stylePatch };
}

// ---------------------------------------------------------------- layers never cover each other

export interface LayerContext {
  canvas: Canvas;
  /** platform UI margins (resolved layout.safeZone) */
  safe?: { top: number; bottom: number; left: number; right: number; rails?: { x: number; y: number; w: number; h: number }[] };
  /** a card's measured box (frame fractions) in its own style */
  measure: (page: Page, style: CaptionStyleV2) => { w: number; h: number };
  /** a look's allowed vertical band (template band or bandFor its default centre) */
  bandOf: (style: CaptionStyleV2) => { top: number; bottom: number };
  padding?: number;
}

const styleOf = (style: CaptionStyleV2, page: Page): CaptionStyleV2 => {
  const fs = (page.styleOverride as { fontSize?: unknown } | null)?.fontSize;
  return typeof fs === "number" ? { ...style, fontSize: fs } : style;
};

/**
 * A card on a higher layer (stamps) that would sit on an active card of a lower layer (the body) moves to the nearest
 * clear spot inside its look's band, preferring above the lower cards, inside the safe zone (shrinking as a last resort,
 * like layout safety). Lower layers never move. Deterministic; returns the same tracks when nothing overlaps.
 */
export function separateLayers(tracks: PlannedTrack[], ctx: LayerContext): PlannedTrack[] {
  const layers = [...new Set(tracks.map((t) => t.layer))].sort((a, b) => a - b);
  if (layers.length < 2) return tracks;
  const pad = ctx.padding ?? 0.012;
  const boxOf = (p: Page, style: CaptionStyleV2) => {
    const s = styleOf(style, p);
    const size = ctx.measure(p, s);
    const c = p.position ?? s.position;
    return { x: c.x - size.w / 2, y: c.y - size.h / 2, w: size.w, h: size.h };
  };
  const hits = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > -pad && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > -pad;
  let changed = false;
  const out = tracks.map((t) => ({ ...t }));
  for (const layer of layers.slice(1)) {
    // obstacles: every card of every lower layer, over the time it is on screen
    const below = out.filter((t) => t.layer < layer).flatMap((t) => t.pages.map((p) => ({ ...boxOf(p, t.style), fromMs: p.startMs, toMs: p.endMs, label: `layer${t.layer}:${p.id}` })));
    for (const t of out.filter((x) => x.layer === layer)) {
      let touched = false;
      const pages = t.pages.map((p) => {
        const box = boxOf(p, t.style);
        const active = below.filter((o) => o.fromMs < p.endMs && o.toMs > p.startMs);
        const over = active.filter((o) => hits(box, o));
        if (!over.length) return p;
        const s = styleOf(t.style, p);
        const size = ctx.measure(p, s);
        const center = p.position ?? s.position;
        const band = ctx.bandOf(s);
        const ceiling = Math.min(...over.map((o) => o.y));
        const base = { size, center, startMs: p.startMs, endMs: p.endMs, safe: ctx.safe, avoid: active, padding: pad };
        // above the lower cards first, then anywhere in the look's band
        let r = ceiling - band.top > size.h * 0.7 ? solvePlacement({ ...base, band: { top: band.top, bottom: Math.min(band.bottom, ceiling) } }) : null;
        if (!r?.ok) r = solvePlacement({ ...base, band });
        if (!r.ok) r = solvePlacement({ ...base, band: { top: 0, bottom: 1 } });
        if (!r.ok) return p;
        touched = true;
        const next: FxPage = { ...p, position: { x: r.x, y: r.y } };
        if (r.scale < 1) next.styleOverride = { ...(p.styleOverride ?? {}), fontSize: Math.round(s.fontSize * r.scale * 10) / 10 };
        return next;
      });
      if (touched) {
        t.pages = pages;
        changed = true;
      }
    }
  }
  return changed ? out : tracks;
}
