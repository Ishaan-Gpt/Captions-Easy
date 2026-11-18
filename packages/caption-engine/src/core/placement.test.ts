import { describe, expect, it } from "vitest";
import { SAFE_ZONES, PLATFORM_PRESETS, aspectOf, safeZoneFor, type Page } from "@capseasy/shared";
import { activeAvoidBoxes, bandFor, placePages, resolveSafeZone, solvePlacement, type PagePlacementReport } from "./placement";

const card = { w: 0.6, h: 0.08 };

describe("placement solver", () => {
  it("leaves a clear card exactly where the look put it", () => {
    const r = solvePlacement({ size: card, center: { x: 0.5, y: 0.7 } });
    expect(r).toEqual({ x: 0.5, y: 0.7, scale: 1, moved: false, ok: true });
  });

  it("face box in the middle: minimal vertical move, inside the band", () => {
    const face = { x: 0.3, y: 0.35, w: 0.4, h: 0.25, label: "face" };
    const r = solvePlacement({ size: card, center: { x: 0.5, y: 0.5 }, avoid: [face], padding: 0.01 });
    expect(r.ok).toBe(true);
    expect(r.x).toBe(0.5); // vertical move preferred
    expect(r.scale).toBe(1);
    // just above (0.35 - 0.01 - 0.04 = 0.30) and just below (0.60 + 0.01 + 0.04 = 0.65) are both 0.15 away (0.30 is
    // 0.20, 0.65 is 0.15): the nearer one wins
    expect(r.y).toBeCloseTo(0.65, 4);
    const band = bandFor(0.5);
    expect(r.y + card.h / 2).toBeLessThanOrEqual(band.bottom);
  });

  it("burned-in text at the bottom: lifts a lower-third caption just above it", () => {
    const lower = { x: 0.1, y: 0.78, w: 0.8, h: 0.1, label: "burned-in subtitle" };
    const r = solvePlacement({ size: card, center: { x: 0.5, y: 0.8 }, avoid: [lower], padding: 0.01 });
    expect(r.ok).toBe(true);
    expect(r.moved).toBe(true);
    expect(r.y).toBeCloseTo(0.73, 4); // 0.78 - 0.01 - 0.04
    expect(r.x).toBe(0.5);
  });

  it("safe zone: pushes a card out of the platform UI", () => {
    const tiktok = safeZoneFor("tiktok");
    const r = solvePlacement({ size: card, center: { x: 0.5, y: 0.85 }, safe: tiktok, padding: 0 });
    expect(r.ok).toBe(true);
    expect(r.y + card.h / 2).toBeLessThanOrEqual(1 - tiktok.bottom + 1e-9);
    expect(r.x + card.w / 2).toBeLessThanOrEqual(1 - tiktok.right + 1e-9);
  });

  it("boxes over time: only boxes active during the card's span count", () => {
    const avoid = [{ x: 0, y: 0.6, w: 1, h: 0.2, fromMs: 2000, toMs: 4000, label: "insert" }];
    expect(activeAvoidBoxes(avoid, 0, 1999)).toHaveLength(0);
    expect(activeAvoidBoxes(avoid, 1500, 2500)).toHaveLength(1);
    expect(activeAvoidBoxes(avoid, 4000, 5000)).toHaveLength(0);
    const before = solvePlacement({ size: card, center: { x: 0.5, y: 0.7 }, avoid, startMs: 0, endMs: 1500 });
    const during = solvePlacement({ size: card, center: { x: 0.5, y: 0.7 }, avoid, startMs: 2500, endMs: 3500 });
    const after = solvePlacement({ size: card, center: { x: 0.5, y: 0.7 }, avoid, startMs: 4000, endMs: 5000 });
    expect(before.moved).toBe(false);
    expect(after.moved).toBe(false);
    expect(during.moved).toBe(true);
    expect(during.ok).toBe(true);
    const clearAbove = during.y + card.h / 2 <= 0.6 - 0.012 + 1e-9;
    const clearBelow = during.y - card.h / 2 >= 0.8 + 0.012 - 1e-9;
    expect(clearAbove || clearBelow).toBe(true);
  });

  it("horizontal move only when no vertical spot is clear", () => {
    const avoid = [{ x: 0, y: 0, w: 0.45, h: 1, label: "insert" }];
    const r = solvePlacement({ size: { w: 0.4, h: 0.08 }, center: { x: 0.5, y: 0.7 }, avoid, padding: 0 });
    expect(r.ok).toBe(true);
    expect(r.y).toBe(0.7);
    expect(r.x).toBeCloseTo(0.65, 4);
  });

  it("shrink-to-fit as the last resort", () => {
    // band 0.45-1 with only a 0.06-high gap (0.75-0.81): the 0.08-high card fits at <= 0.75 scale
    const avoid = [{ x: 0, y: 0.45, w: 1, h: 0.3 }, { x: 0, y: 0.81, w: 1, h: 0.19 }];
    const r = solvePlacement({ size: card, center: { x: 0.5, y: 0.7 }, avoid, padding: 0 });
    expect(r.ok).toBe(true);
    expect(r.scale).toBeLessThan(1);
    expect(card.h * r.scale).toBeLessThanOrEqual(0.06 + 1e-9);
    expect(r.y).toBeCloseTo(0.78, 4);
  });

  it("impossible case is reported, deterministically", () => {
    const avoid = [{ x: 0, y: 0, w: 1, h: 1, label: "full-frame insert" }];
    const a = solvePlacement({ size: card, center: { x: 0.5, y: 0.7 }, avoid });
    const b = solvePlacement({ size: card, center: { x: 0.5, y: 0.7 }, avoid });
    expect(a.ok).toBe(false);
    expect(a.reason).toBe("no-clear-spot");
    expect(a.overlaps).toEqual(["full-frame insert"]);
    expect(a).toEqual(b);
  });
});

describe("safe-zone table", () => {
  it("organic native-aspect entries equal PLATFORM_PRESETS.unsafe (no behaviour change)", () => {
    for (const p of ["tiktok", "reels", "shorts", "youtube", "linkedin"] as const) {
      const { top, bottom, left, right } = SAFE_ZONES.organic[p][PLATFORM_PRESETS[p].aspect];
      expect({ top, bottom, left, right }).toEqual(PLATFORM_PRESETS[p].unsafe);
    }
  });

  it("every profile x platform x aspect is filled, sane and sourced", () => {
    for (const prof of Object.values(SAFE_ZONES))
      for (const plat of Object.values(prof))
        for (const z of Object.values(plat)) {
          expect(z.top + z.bottom).toBeLessThan(0.6);
          expect(z.left + z.right).toBeLessThan(0.5);
          expect(z.source.length).toBeGreaterThan(5);
        }
  });

  it("aspect snapping and resolution", () => {
    expect(aspectOf(1080, 1920)).toBe("9:16");
    expect(aspectOf(1920, 1080)).toBe("16:9");
    expect(aspectOf(1080, 1350)).toBe("4:5");
    expect(aspectOf(1000, 1000)).toBe("1:1");
    expect(resolveSafeZone("youtube", { width: 1920, height: 1080 })).toMatchObject({ bottom: 0.1 });
    expect(resolveSafeZone({ platform: "reels", profile: "ads" }, { width: 1080, height: 1920 })).toMatchObject({ top: 0.14, bottom: 0.35 });
    expect(resolveSafeZone({ top: 0.1, bottom: 0.1, left: 0, right: 0 }, { width: 1, height: 1 })).toEqual({ top: 0.1, bottom: 0.1, left: 0, right: 0 });
  });
});

describe("placePages", () => {
  const page = (id: string, startMs: number, endMs: number, position: Page["position"] = null): Page => ({ id, startMs, endMs, words: [], lines: [], heroIndex: 0, emotion: "neutral", position, styleOverride: null });
  const ctx = { canvas: { width: 1080, height: 1920 }, defaultCenter: { x: 0.5, y: 0.7 }, measure: () => card, fontSize: 80 };

  it("no options -> the same array, untouched (backward compatible)", () => {
    const pages = [page("a", 0, 1000), page("b", 1000, 2000)];
    expect(placePages(pages, undefined, ctx)).toBe(pages);
    expect(placePages(pages, null, ctx)).toBe(pages);
    expect(placePages(pages, {}, ctx)).toBe(pages);
    expect(placePages(pages, { avoid: [] }, ctx)).toBe(pages);
  });

  it("moves only the cards that collide, via page.position; hand-placed cards are kept", () => {
    const pages = [page("a", 0, 1000), page("b", 1000, 2000), page("c", 1000, 2000, { x: 0.2, y: 0.2 })];
    const report: PagePlacementReport[] = [];
    const out = placePages(pages, { avoid: [{ x: 0, y: 0.6, w: 1, h: 0.15, fromMs: 1000, label: "insert" }] }, ctx, report);
    expect(out[0]).toBe(pages[0]);
    expect(out[1]!.position).not.toBeNull();
    const y = out[1]!.position!.y;
    expect(y + card.h / 2 <= 0.6 || y - card.h / 2 >= 0.75).toBe(true);
    expect(out[2]).toBe(pages[2]);
    expect(report.map((r) => r.pageId)).toEqual(["a", "b"]);
  });

  it("shrink writes styleOverride.fontSize", () => {
    const pages = [page("a", 0, 1000)];
    const out = placePages(pages, { avoid: [{ x: 0, y: 0.45, w: 1, h: 0.3 }, { x: 0, y: 0.81, w: 1, h: 0.19 }], padding: 0 }, ctx);
    expect((out[0]!.styleOverride as { fontSize: number }).fontSize).toBeLessThan(80);
  });
});
