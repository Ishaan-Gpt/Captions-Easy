/**
 * Caption placement solver: keeps each card clear of platform UI (safe zones) and of `avoid` boxes over time
 * (a face, burned-in text, an insert), moving it as little as possible. Pure and deterministic.
 *
 * Order of preference for a card whose default spot is blocked:
 *   1. the nearest clear spot straight up/down inside the look's vertical band
 *   2. the nearest clear spot with a horizontal move too (horizontal distance costs double)
 *   3. shrink-to-fit (scale steps down to minScale), repeating 1-2 at each step
 *   4. nothing clear: { ok: false } with the spot that overlaps least (callers may keep the default instead)
 * All geometry is in frame fractions (0..1); a card position is its CENTRE, as page.position / CardMeta.position.
 */
import { LayoutSafetySchema, SAFE_ZONE_PLATFORMS, aspectOf, safeZoneFor, type AvoidBox, type LayoutSafety, type Page, type SafeMargins, type SafeZone } from "@capseasy/shared";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Band {
  /** top edge the card box may reach (fraction of frame height) */
  top: number;
  /** bottom edge the card box may reach */
  bottom: number;
}

export interface PlacementInput {
  /** measured card size (frame fractions) */
  size: { w: number; h: number };
  /** where the look puts the card's centre */
  center: { x: number; y: number };
  /** card time span (ms), to pick the avoid boxes active while it is on screen */
  startMs?: number;
  endMs?: number;
  /** allowed vertical band for the card box; default derived from the centre (bandFor) */
  band?: Band;
  /** platform UI margins */
  safe?: SafeMargins & { rails?: Rect[] };
  avoid?: AvoidBox[];
  /** smallest scale for shrink-to-fit (default 0.7, 1 = never shrink) */
  minScale?: number;
  /** clearance kept around obstacles (default 0.012) */
  padding?: number;
}

export interface PlacementResult {
  x: number;
  y: number;
  /** shrink factor applied (1 = none) */
  scale: number;
  /** true when the position differs from the input centre */
  moved: boolean;
  /** false when no clear spot exists: x/y/scale are then the least-overlapping spot found */
  ok: boolean;
  reason?: "no-clear-spot";
  /** labels of the obstacles the result still overlaps (only when ok is false) */
  overlaps?: string[];
}

/**
 * Default vertical band from a look's default centre: lower-third looks stay in the lower half-ish, upper looks in the
 * upper half-ish, centred looks in the middle 60%. A template may declare its own (TemplateDefinition.placementBand).
 */
export function bandFor(centerY: number): Band {
  if (centerY >= 0.6) return { top: 0.45, bottom: 1 };
  if (centerY <= 0.4) return { top: 0, bottom: 0.55 };
  return { top: 0.2, bottom: 0.8 };
}

const EPS = 1e-9;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const intersects = (a: Rect, b: Rect) => overlapArea(a, b) > EPS;

/** avoid boxes active at any time during [startMs, endMs) */
export function activeAvoidBoxes(avoid: AvoidBox[] | undefined, startMs = 0, endMs = Number.POSITIVE_INFINITY): AvoidBox[] {
  return (avoid ?? []).filter((b) => (b.fromMs ?? Number.NEGATIVE_INFINITY) < endMs && (b.toMs ?? Number.POSITIVE_INFINITY) > startMs && b.w > 0 && b.h > 0);
}

interface Obstacle extends Rect {
  label: string;
}

export function solvePlacement(input: PlacementInput): PlacementResult {
  const pad = input.padding ?? 0.012;
  const minScale = Math.min(1, Math.max(0.3, input.minScale ?? 0.7));
  const safe = input.safe ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const band = input.band ?? bandFor(input.center.y);
  // usable region: inside the safe margins and the band
  const region = {
    left: safe.left,
    right: 1 - safe.right,
    top: Math.max(safe.top, band.top),
    bottom: Math.min(1 - safe.bottom, band.bottom),
  };
  const obstacles: Obstacle[] = [
    ...activeAvoidBoxes(input.avoid, input.startMs, input.endMs).map((b, i) => ({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad, label: b.label ?? `avoid#${i}` })),
    ...(safe.rails ?? []).map((r, i) => ({ ...r, label: (r as Rect & { label?: string }).label ?? `rail#${i}` })),
  ];
  const { x: cx0, y: cy0 } = input.center;

  const boxAt = (cx: number, cy: number, w: number, h: number): Rect => ({ x: cx - w / 2, y: cy - h / 2, w, h });
  const inside = (b: Rect) => b.x >= region.left - EPS && b.x + b.w <= region.right + EPS && b.y >= region.top - EPS && b.y + b.h <= region.bottom + EPS;
  const clear = (b: Rect) => inside(b) && !obstacles.some((o) => intersects(b, o));

  // default spot already fine: never touch it
  if (clear(boxAt(cx0, cy0, input.size.w, input.size.h))) return { x: cx0, y: cy0, scale: 1, moved: false, ok: true };

  const scales: number[] = [];
  for (let s = 1; s >= minScale - EPS; s = r4(s - 0.05)) scales.push(s);
  if (scales[scales.length - 1]! > minScale + EPS) scales.push(minScale);

  for (const s of scales) {
    const w = input.size.w * s;
    const h = input.size.h * s;
    // horizontal: keep the look's x when it fits, else the nearest x that does
    const clampX = (x: number) => Math.min(Math.max(x, region.left + w / 2), region.right - w / 2);
    const ys = candidates(cy0, h, region.top, region.bottom, obstacles.map((o) => [o.y, o.y + o.h]));
    const xs = candidates(cx0, w, region.left, region.right, obstacles.map((o) => [o.x, o.x + o.w]));
    // 1. vertical only
    const x1 = w <= region.right - region.left + EPS ? clampX(cx0) : cx0;
    let best: { x: number; y: number; cost: number } | null = null;
    for (const y of ys) {
      if (!clear(boxAt(x1, y, w, h))) continue;
      const cost = Math.abs(y - cy0) + Math.abs(x1 - cx0) * 2;
      if (!best || cost < best.cost - EPS) best = { x: x1, y, cost };
    }
    // 2. with a horizontal move (only if no vertical move worked)
    if (!best) {
      for (const x of xs) {
        for (const y of ys) {
          if (!clear(boxAt(x, y, w, h))) continue;
          const cost = Math.abs(y - cy0) + Math.abs(x - cx0) * 2;
          if (!best || cost < best.cost - EPS) best = { x, y, cost };
        }
      }
    }
    if (best) return { x: r4(best.x), y: r4(best.y), scale: s, moved: Math.abs(best.x - cx0) > EPS || Math.abs(best.y - cy0) > EPS, ok: true };
  }

  // 4. impossible: least overlap at the smallest scale, clamped inside the region where it fits
  const w = input.size.w * minScale;
  const h = input.size.h * minScale;
  const ys = candidates(cy0, h, region.top, region.bottom, obstacles.map((o) => [o.y, o.y + o.h]));
  const xs = candidates(cx0, w, region.left, region.right, obstacles.map((o) => [o.x, o.x + o.w]));
  let worst: { x: number; y: number; area: number; cost: number } | null = null;
  for (const x of xs) {
    for (const y of ys) {
      const b = boxAt(x, y, w, h);
      const area = obstacles.reduce((a, o) => a + overlapArea(b, o), 0) + (inside(b) ? 0 : 1);
      const cost = Math.abs(y - cy0) + Math.abs(x - cx0) * 2;
      if (!worst || area < worst.area - EPS || (Math.abs(area - worst.area) <= EPS && cost < worst.cost - EPS)) worst = { x, y, area, cost };
    }
  }
  const at = worst ?? { x: cx0, y: cy0 };
  const b = boxAt(at.x, at.y, w, h);
  return {
    x: r4(at.x),
    y: r4(at.y),
    scale: minScale,
    moved: Math.abs(at.x - cx0) > EPS || Math.abs(at.y - cy0) > EPS,
    ok: false,
    reason: "no-clear-spot",
    overlaps: obstacles.filter((o) => intersects(b, o)).map((o) => o.label),
  };
}

/**
 * Candidate centre coordinates along one axis: the default (clamped), both region edges, and the spots just before /
 * just after every obstacle. The optimum of "nearest clear spot" always lies on one of these, so the search is exact
 * (no grid) and deterministic. Sorted by distance from the default, then by value.
 */
function candidates(c0: number, size: number, lo: number, hi: number, spans: number[][]): number[] {
  const min = lo + size / 2;
  const max = hi - size / 2;
  const raw = [c0, min, max];
  for (const [a, b] of spans) raw.push(a! - size / 2, b! + size / 2);
  const out = [...new Set(raw.filter((v) => v >= min - EPS && v <= max + EPS).map((v) => r4(Math.min(max, Math.max(min, v)))))];
  if (min > max + EPS) out.push(r4(c0)); // wider than the region: only the default makes sense
  return out.sort((a, b) => Math.abs(a - c0) - Math.abs(b - c0) || a - b);
}

/** Resolve LayoutSafety.safeZone into margins (+ rails) for a canvas. */
export function resolveSafeZone(safeZone: LayoutSafety["safeZone"], canvas: { width: number; height: number }): (SafeMargins & { rails?: Rect[] }) | undefined {
  if (!safeZone) return undefined;
  const aspect = aspectOf(canvas.width, canvas.height);
  if (typeof safeZone === "string") return pick(safeZoneFor(safeZone, aspect));
  if ("platform" in safeZone) return pick(safeZoneFor(safeZone.platform, safeZone.aspect ?? aspect, safeZone.profile ?? "organic"));
  return { top: safeZone.top, bottom: safeZone.bottom, left: safeZone.left, right: safeZone.right };
}
const pick = (z: SafeZone) => ({ top: z.top, bottom: z.bottom, left: z.left, right: z.right, ...(z.rails ? { rails: z.rails } : {}) });

export const isSafeZonePlatform = (p: string): p is (typeof SAFE_ZONE_PLATFORMS)[number] => (SAFE_ZONE_PLATFORMS as readonly string[]).includes(p);

export interface PagePlacementContext {
  canvas: { width: number; height: number };
  /** the look's default centre (style.position) */
  defaultCenter: { x: number; y: number };
  /** measure a card's box in frame fractions */
  measure: (page: Page) => { w: number; h: number };
  /** the template's declared band, if any (LayoutSafety.band wins) */
  band?: Band;
  /** base font size, used to write the shrink into page.styleOverride.fontSize */
  fontSize?: number;
}

export interface PagePlacementReport {
  pageId: string;
  startMs: number;
  result: PlacementResult;
}

/**
 * Apply layout safety to derived pages through the existing per-card mechanism (page.position, and
 * page.styleOverride.fontSize for shrink-to-fit). No options -> the SAME array is returned, untouched.
 * A page that already has a creator-set position keeps it. When no clear spot exists, the card stays at its default.
 */
export function placePages(pages: Page[], safety: LayoutSafety | null | undefined, ctx: PagePlacementContext, report?: PagePlacementReport[]): Page[] {
  if (!safety || (!safety.safeZone && !safety.avoid?.length)) return pages;
  const opts = LayoutSafetySchema.parse(safety);
  const safe = resolveSafeZone(opts.safeZone, ctx.canvas);
  let changed = false;
  const out = pages.map((page) => {
    if (page.position) return page; // the creator placed this card by hand
    const result = solvePlacement({
      size: ctx.measure(page),
      center: ctx.defaultCenter,
      startMs: page.startMs,
      endMs: page.endMs,
      band: opts.band ?? ctx.band,
      safe,
      avoid: opts.avoid,
      minScale: opts.minScale,
      padding: opts.padding,
    });
    report?.push({ pageId: page.id, startMs: page.startMs, result });
    if (!result.ok || (!result.moved && result.scale === 1)) return page;
    changed = true;
    const next: Page = { ...page, position: { x: result.x, y: result.y } };
    if (result.scale < 1 && ctx.fontSize) {
      const prev = (page.styleOverride ?? {}) as Record<string, unknown>;
      const base = typeof prev.fontSize === "number" ? prev.fontSize : ctx.fontSize;
      next.styleOverride = { ...prev, fontSize: Math.round(base * result.scale * 10) / 10 };
    }
    return next;
  });
  return changed ? out : pages;
}
