/**
 * "No namesake controls": every Style-panel control that is shown for a template must visibly change what
 * that template renders. Each case mirrors a control in apps/frontend/src/features/studio/panels/StylePanel.tsx
 * (same visibility rule via `controlVisible`). Rendering is pure, so comparing static markup at a few moments
 * of a card (entrance, a word being spoken, exit) is enough to prove the value reaches the output.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { PageView } from "./PageView";
import { resolveStyle } from "./registry";
import { TEMPLATES } from "./templates";
import { STYLE_CONTROLS, controlVisible } from "./controls";
import type { MeasureFn } from "./types";

const measure: MeasureFn = (t, s) => t.length * s.fontSize * 0.55 + t.length * (s.letterSpacing ?? 0);

const W = (id: string, text: string, startMs: number, extra: Partial<Word> = {}): Word => ({ id, text, startMs, endMs: startMs + 380, ...extra }) as Word;
const words = [
  // mixed case so every casing option produces different text
  W("a", "Stop", 0, { emoji: { char: "🔥", position: "above" } }),
  W("b", "scrolling", 400),
  W("c", "AND", 800),
  W("d", "Watch", 1200, { emphasis: "hero" }),
  W("e", "this", 1600),
  W("f", "trick", 2000),
];
const page: Page = {
  id: "p1", startMs: 0, endMs: 2600, words, lines: [words.slice(0, 3), words.slice(3)], heroIndex: 3,
  emotion: "excited", position: null, styleOverride: null,
};
const canvas = { width: 1080, height: 1920, fps: 30 };
// entrance in progress, a normal word being spoken, the hero being spoken, exit in progress
const MOMENTS = [40, 520, 1300, 2560];

const render = (style: CaptionStyleV2) =>
  MOMENTS.map((t) => renderToStaticMarkup(<PageView page={page} timeMs={t} style={style} canvas={canvas} measure={measure} />)).join("\n");

describe("every visible Style control changes the render", () => {
  for (const tpl of TEMPLATES) {
    const base = resolveStyle({ templateId: tpl.id, exit: { type: "fade", durationMs: 200 } } as Partial<CaptionStyleV2>);
    for (const c of STYLE_CONTROLS) {
      for (const variant of c.variants(base, tpl)) {
        const before = variant.from ?? base;
        if (!controlVisible(c.id, tpl, before)) continue;
        it(`${tpl.id}: ${c.id}${variant.label ? ` (${variant.label})` : ""}`, () => {
          expect(render(variant.to(before))).not.toBe(render(before));
        });
      }
    }
  }
});

describe("layout regressions", () => {
  // exits used to replace the container's centring transform, so captions jumped sideways when a card started leaving
  for (const tpl of TEMPLATES) {
    for (const exit of ["fall", "zoom-out", "slide-up"] as const) {
      it(`${tpl.id}: stays centred while the "${exit}" exit plays`, () => {
        const style = resolveStyle({ templateId: tpl.id, exit: { type: exit, durationMs: 300 } } as Partial<CaptionStyleV2>);
        const html = renderToStaticMarkup(<PageView page={page} timeMs={2500} style={style} canvas={canvas} measure={measure} />);
        expect(html).toMatch(/^<div style="[^"]*transform:translate\(-50%, -50%\)/);
      });
    }
  }

  it("letter exits take every letter out by the end of the card, and leave it alone before", () => {
    const style = resolveStyle({ templateId: "sentence_clean", exit: { type: "letter-spin", durationMs: 300 }, templateOptions: { reveal: "all" } } as Partial<CaptionStyleV2>);
    const early = renderToStaticMarkup(<PageView page={page} timeMs={1400} style={style} canvas={canvas} measure={measure} />);
    expect(early).not.toMatch(/scale\(0\.[0-8]/);
    const end = renderToStaticMarkup(<PageView page={page} timeMs={2599} style={style} canvas={canvas} measure={measure} />);
    expect(end).toMatch(/scale\(0, 0\)/);
  });

  it("subtitle bar stays centred while a sliding entrance plays", () => {
    const style = resolveStyle({ templateId: "subtitle_bar", entrance: { type: "slide-left", durationMs: 300 } } as Partial<CaptionStyleV2>);
    const html = renderToStaticMarkup(<PageView page={page} timeMs={60} style={style} canvas={canvas} measure={measure} />);
    expect(html).toMatch(/^<div style="[^"]*transform:translate\(-50%, -50%\)/);
  });
});
