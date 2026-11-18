/** Multi-look tracks in the composition: hand-over planning, transition effects (pure in timeMs) and per-track rendering. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type CaptionStyleV2, type Page, type Word } from "@capseasy/shared";
import { bandFor, derivePages, resolveSafeZone } from "@motion-ai/caption-engine/core";
import { PageView, applyLook, getLook, measureCardBox, resolveStyle, type MeasureFn } from "@capseasy/templates";
import { TrackPageView, parseTracks } from "./CaptionedVideo";
import { CaptionedVideoProps } from "./props";
import { fxAt, mixColor, planTracks, separateLayers, type PlannedTrackInput, type TrackTransition } from "./tracks";

const canvas = { width: 1080, height: 1920, fps: 30 };
const measure: MeasureFn = (t, s) => t.length * s.fontSize * 0.55;
const words = (texts: string[], from = 0, step = 360): Word[] => texts.map((text, i) => ({ id: `w${from + i}`, text, startMs: (from + i) * step, endMs: (from + i) * step + 320 }));

function track(lookId: string, ws: Word[], transition: Partial<TrackTransition> = {}, layer = 0, exit = { type: "blur-out", native: false }) {
  const { style: s, settings } = applyLook(getLook(lookId)!);
  const style = resolveStyle(s);
  const set = ProjectSettingsSchema.parse(settings);
  const doc = CaptionDocSchema.parse({ version: 2, words: ws });
  const pages = derivePages(doc, set, { measure: (t) => measure(t, { fontFamily: "x", fontWeight: 400, fontSize: style.fontSize }), maxLineWidth: canvas.width * style.maxWidth }).map((p) => ({ ...p, id: `${lookId}:${p.id}` }));
  const input: PlannedTrackInput = { layer, style, gapBehavior: set.gapBehavior, transition: { type: "cut", durationMs: 260, overlapMs: 0, ...transition }, exit, pages };
  return input;
}
const pageAt = (pages: Page[], t: number) => pages.find((p) => t >= p.startMs && t < p.endMs);

const HOOK = words("Stop scrolling right now.".split(" "));
const BODY = words("This one habit made me 10,000 dollars in a single month".split(" "), 4);

describe("planTracks: hand-overs between looks", () => {
  it("cut: the outgoing card holds up to the hand-over and never past it", () => {
    const [a, b] = planTracks([track("beast_bounce", HOOK), track("hormozi_box", BODY)], canvas);
    const T = b!.pages[0]!.startMs;
    expect(a!.pages.at(-1)!.endMs).toBe(T);
    expect(a!.pages.every((p) => !p.fx)).toBe(true);
    expect(b!.pages[0]!.fx).toBeUndefined();
  });

  it("exit-entry: the outgoing look exits, ending overlapMs after the new card starts (envelope for looks without an exit)", () => {
    const [a, b] = planTracks([track("beast_bounce", HOOK), track("hormozi_box", BODY, { type: "exit-entry", durationMs: 300, overlapMs: 80 })], canvas);
    const T = b!.pages[0]!.startMs;
    const last = a!.pages.at(-1)!;
    expect(last.endMs).toBe(T + 80);
    // the exit takes durationMs, capped at 60% of a short card so the card is readable first
    const d = Math.min(300, (T + 80 - last.startMs) * 0.6);
    expect(last.fx?.exit).toEqual({ kind: "blur-out", fromMs: T + 80 - d, toMs: T + 80 });
    // both on screen during the overlap
    expect(pageAt(a!.pages, T + 40)).toBeDefined();
    expect(pageAt(b!.pages, T + 40)).toBeDefined();
  });

  it("exit-entry with a look that has its own exit stretches that exit instead", () => {
    const [a, b] = planTracks([track("beast_bounce", HOOK, {}, 0, { type: "fade", native: true }), track("hormozi_box", BODY, { type: "exit-entry", durationMs: 300 })], canvas);
    const last = a!.pages.at(-1)!;
    expect(last.fx).toBeUndefined();
    expect(last.styleOverride).toMatchObject({ exit: { type: "fade", durationMs: Math.round(Math.min(300, (b!.pages[0]!.startMs - last.startMs) * 0.6)) } });
    expect(last.endMs).toBe(b!.pages[0]!.startMs);
  });

  it("morph: both cards travel the same path, rescale and recolour; the incoming card skips its entrance", () => {
    const hook = track("hormozi_box", HOOK);
    hook.style = resolveStyle({ ...hook.style, fill: { type: "solid", color: "#FFFFFF" }, position: { x: 0.5, y: 0.4 }, fontSize: 120 } as Partial<CaptionStyleV2>);
    const body = track("minimal_pro", BODY, { type: "morph", durationMs: 400 });
    body.style = resolveStyle({ ...body.style, fill: { type: "solid", color: "#FFE600" }, position: { x: 0.5, y: 0.7 }, fontSize: 60 } as Partial<CaptionStyleV2>);
    const [a, b] = planTracks([hook, body], canvas);
    const T = b!.pages[0]!.startMs;
    const out = a!.pages.at(-1)!.fx!.morphOut!;
    const inn = b!.pages[0]!.fx!.morphIn!;
    expect(out).toMatchObject({ fromMs: T, toMs: T + 400, dx: 0, scale: 0.5 });
    expect(out.dy).toBeCloseTo(576, 6);
    expect(inn).toMatchObject({ fromMs: T, toMs: T + 400, scale: 2, fromColor: "#FFFFFF", toColor: "#FFE600" });
    expect(inn.dy).toBeCloseTo(-576, 6);
    expect(b!.pages[0]!.styleOverride).toMatchObject({ entrance: { type: "none" } });
    // the incoming card starts exactly where the outgoing one was, at its size, and lands on its own spot
    expect(fxAt(b!.pages[0]!.fx, T, 60).css!.transform).toBe("translate(0.00px, -576.00px) scale(2.0000)");
    expect(fxAt(b!.pages[0]!.fx, T + 400, 60).css).toEqual({});
    expect(fxAt(b!.pages[0]!.fx, T + 200, 60).stylePatch).toEqual({ fill: { type: "solid", color: mixColor("#FFFFFF", "#FFE600", 0.5) } });
    expect(fxAt(a!.pages.at(-1)!.fx, T + 400, 60).css!.opacity).toBe(0);
  });

  it("layers are independent: stamps over the body never clip the body", () => {
    const body = track("hormozi_box", BODY);
    const stamps = track("beast_bounce", [BODY[3]!, BODY[5]!], { type: "exit-entry" }, 1);
    const before = body.pages.map((p) => [p.startMs, p.endMs]);
    const [b, s] = planTracks([body, stamps], canvas);
    expect(b!.pages.map((p) => [p.startMs, p.endMs])).toEqual(before);
    expect(s!.pages.length).toBeGreaterThan(0);
  });

  it("is deterministic and leaves its inputs alone", () => {
    const input = [track("beast_bounce", HOOK), track("hormozi_box", BODY, { type: "exit-entry" })];
    const snap = JSON.stringify(input);
    expect(JSON.stringify(planTracks(input, canvas))).toBe(JSON.stringify(planTracks(input, canvas)));
    expect(JSON.stringify(input)).toBe(snap);
  });
});

describe("fxAt: transition effects are pure in timeMs", () => {
  it("no effect -> no wrapper", () => {
    expect(fxAt(undefined, 100, 80)).toEqual({ css: null, stylePatch: null });
  });
  it("exit envelopes run from 0 to 1 over their window", () => {
    const fx = { exit: { kind: "zoom-out" as const, fromMs: 1000, toMs: 1300 } };
    expect(fxAt(fx, 900, 80).css).toEqual({});
    expect(fxAt(fx, 1300, 80).css).toEqual({ opacity: 0, transform: "scale(0.5500)" });
    expect(fxAt(fx, 1150, 80)).toEqual(fxAt(fx, 1150, 80));
  });
});

describe("rendering each track with its own look", () => {
  it("a page renders exactly like PageView when no transition is playing", () => {
    const t = track("hormozi_box", BODY);
    const page = t.pages[0]!;
    const at = page.startMs + 100;
    expect(renderToStaticMarkup(<TrackPageView page={page} timeMs={at} canvas={canvas} style={t.style} />)).toBe(renderToStaticMarkup(<PageView page={page} timeMs={at} style={t.style} canvas={canvas} measure={measure} />));
  });

  it("each track draws its own template; the exit envelope wraps the outgoing card", () => {
    const [a, b] = planTracks([track("beast_bounce", HOOK), track("hormozi_box", BODY, { type: "exit-entry", durationMs: 300, overlapMs: 80 })], canvas);
    const sa = track("beast_bounce", HOOK).style;
    const sb = track("hormozi_box", BODY).style;
    const T = b!.pages[0]!.startMs;
    const out = a!.pages.at(-1)!;
    const mid = renderToStaticMarkup(<TrackPageView page={out} timeMs={T + 20} canvas={canvas} style={sa} />);
    expect(mid).toMatch(/^<div style="position:absolute;left:0;top:0;width:100%;height:100%;opacity:0\.\d+;transform:scale\([\d.]+\);filter:blur/);
    const inn = renderToStaticMarkup(<TrackPageView page={b!.pages[0]!} timeMs={T + 20} canvas={canvas} style={sb} />);
    expect(inn).not.toBe("");
    expect(inn).not.toBe(renderToStaticMarkup(<PageView page={b!.pages[0]!} timeMs={T + 20} style={sa} canvas={canvas} measure={measure} />));
    // after the hand-over the outgoing card is gone
    expect(renderToStaticMarkup(<TrackPageView page={out} timeMs={T + 90} canvas={canvas} style={sa} />)).toBe("");
  });
});

describe("props: tracks are opt-in", () => {
  it("defaults to null and parses a track with defaults filled in", () => {
    expect(CaptionedVideoProps.parse({}).tracks).toBeNull();
    const p = CaptionedVideoProps.parse({ tracks: [{ doc: { version: 2, words: HOOK }, style: { templateId: "sentence" } }] });
    expect(p.tracks![0]).toMatchObject({ layer: 0, transition: { type: "cut", durationMs: 260, overlapMs: 0 }, exit: { type: "fade", native: false } });
    expect(parseTracks([{ doc: { version: 2, words: HOOK } }])[0]!.id).toBe("t0");
  });
});

describe("separateLayers: stamps never sit on the body", () => {
  it("the 3-track plan (hook #127, body #22, number stamp #19, creator-yellow): no stamp card overlaps an active body card", async () => {
    const { buildCaptions } = await import("../../cli/src/captions");
    const text = "Look at this. Last month this simple habit made me 10000 dollars and it can do the same for you, honestly".split(" ");
    const words = text.map((t, i) => ({ text: t, startMs: i * 330, endMs: i * 330 + 300 }));
    const props = buildCaptions({
      words,
      theme: "creator-yellow",
      layout: { safeZone: "reels" },
      tracks: [
        { slot: "hook", look: 127, words: [0, 3] },
        { slot: "body", look: 22, rest: true, transition: "exit-entry" },
        // the stamp asks for the body's own spot: the worst case
        { slot: "number", look: 19, role: "number", position: { y: 0.5 } },
      ],
    });
    const body22 = props.tracks!.find((t) => t.slot === "body")!;
    const parsed = parseTracks(props.tracks!.map((t) => (t.slot === "number" ? { ...t, style: { ...t.style, position: body22.style.position } } : t)));
    const plannedIn = parsed.map((t) => ({
      layer: t.layer, style: t.resolved, gapBehavior: t.settings.gapBehavior, transition: t.transition, exit: t.exit,
      pages: derivePages(t.doc, t.settings, { measure: (x) => measure(x, { fontFamily: "x", fontWeight: 400, fontSize: t.resolved.fontSize }), maxLineWidth: canvas.width * t.resolved.maxWidth }),
    }));
    const measureBox = (p: Page, s: CaptionStyleV2) => measureCardBox(p, s, canvas, measure);
    const ctx = { canvas, measure: measureBox, bandOf: (s: CaptionStyleV2) => bandFor(s.position.y), safe: resolveSafeZone("reels", canvas) };
    const before = planTracks(plannedIn, canvas);
    const after = separateLayers(before, ctx);
    const box = (p: Page, s: CaptionStyleV2) => {
      const st = typeof (p.styleOverride as { fontSize?: number } | null)?.fontSize === "number" ? { ...s, fontSize: (p.styleOverride as { fontSize: number }).fontSize } : s;
      const z = measureBox(p, st);
      const c = p.position ?? st.position;
      return { x0: c.x - z.w / 2, x1: c.x + z.w / 2, y0: c.y - z.h / 2, y1: c.y + z.h / 2 };
    };
    const overlaps = (tracks: typeof after) => {
      let n = 0;
      for (const st of tracks.filter((t) => t.layer === 1)) for (const sp of st.pages) for (const bt of tracks.filter((t) => t.layer === 0)) for (const bp of bt.pages) {
        if (!(bp.startMs < sp.endMs && bp.endMs > sp.startMs)) continue;
        const a = box(sp, st.style);
        const b = box(bp, bt.style);
        if (Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0)) n++;
      }
      return n;
    };
    const stamp = after.find((t) => t.layer === 1)!;
    expect(stamp.pages.map((p) => p.words.map((w) => w.text).join(" "))).toEqual(["10000"]);
    expect(overlaps(before)).toBeGreaterThan(0);
    expect(overlaps(after)).toBe(0);
    // above the body, inside the reels safe zone
    const s0 = box(stamp.pages[0]!, stamp.style);
    const bodyTrack = after.find((t) => t.layer === 0 && t.pages.some((p) => p.startMs <= stamp.pages[0]!.startMs && p.endMs > stamp.pages[0]!.startMs))!;
    const under = bodyTrack.pages.find((p) => p.startMs <= stamp.pages[0]!.startMs && p.endMs > stamp.pages[0]!.startMs)!;
    expect(s0.y1).toBeLessThanOrEqual(box(under, bodyTrack.style).y0);
    expect(s0.y0).toBeGreaterThanOrEqual(0.12 - 1e-9);
    // base layer untouched, deterministic
    expect(after.filter((t) => t.layer === 0)).toEqual(before.filter((t) => t.layer === 0));
    expect(JSON.stringify(separateLayers(before, ctx))).toBe(JSON.stringify(after));
  });

  it("one layer, or no overlap -> the same tracks back", () => {
    const one = planTracks([track("hormozi_box", BODY)], canvas);
    expect(separateLayers(one, { canvas, measure: () => ({ w: 0.5, h: 0.05 }), bandOf: () => ({ top: 0, bottom: 1 }) })).toBe(one);
  });
});
