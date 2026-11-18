/**
 * Backward compatibility guard: every look (gallery + retired) must render byte-identical markup for a caption doc
 * that uses none of the opt-in features added later (word roles, role sizes/entries, themes). The fixture was
 * recorded before those features existed; `UPDATE_COMPAT=1 vitest run src/compat.test.tsx` rewrites it, which must
 * only ever happen together with a deliberate, changelogged change to a look's output.
 * Re-recorded so far: echo_zoom (#126) in 0.2.0, a fix for long lines running off the frame (see packages/cli/CHANGELOG.md);
 * every look on 2026-11-19 when hashing started to drop decimals past the 6th (same output, Node-version-proof).
 */
import React from "react";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type Word } from "@capseasy/shared";
import { derivePages } from "@motion-ai/caption-engine/core";
import { PageView } from "./PageView";
import { LOOK_NUMBER_ORDER, applyLook, getLook } from "./registry";
import type { MeasureFn } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "__fixtures__", "look-render-hashes.json");

const measure: MeasureFn = (t, s) => t.length * s.fontSize * 0.55 + t.length * (s.letterSpacing ?? 0);
const canvas = { width: 1080, height: 1920, fps: 30 };

const TEXT = "So in 2024 Priya built a REALLY simple app and it made 10,000 dollars in one month. Wow!".split(" ");
const sampleWords = (): Word[] =>
  TEXT.map((text, i) => ({ id: `w${i}`, text, startMs: i * 360, endMs: i * 360 + 320, ...(text === "simple" ? { emphasis: "hero" as const } : {}) }));

export function renderLook(id: string): string {
  const look = getLook(id)!;
  const { style, settings } = applyLook(look);
  const doc = CaptionDocSchema.parse({ version: 2, words: sampleWords() });
  const pages = derivePages(doc, ProjectSettingsSchema.parse(settings), { measure: (t) => measure(t, { fontFamily: "x", fontWeight: 400, fontSize: style.fontSize }), maxLineWidth: canvas.width * style.maxWidth });
  const out: string[] = [];
  for (const page of pages) {
    const mid = page.words[Math.floor(page.words.length / 2)]!;
    for (const t of [page.startMs + 40, mid.startMs + 60, Math.round((page.startMs + page.endMs) / 2), page.endMs - 30]) {
      out.push(renderToStaticMarkup(<PageView page={page} timeMs={t} style={style} canvas={canvas} measure={measure} />));
    }
  }
  return out.join("\n");
}

/**
 * Decimals past the 6th are floating-point noise, not output: V8 versions round Math.sin/pow differently in the last
 * digit (Node 22 vs 24 gave opacity 0.024306795603287572 vs ...575 in #123 and #126), which no viewer can see.
 * Hashing them made the guard fail on a Node upgrade with no change to any look (2026-11-19).
 */
const normalise = (s: string) => s.replace(/(\d+\.\d{6})\d+/g, (_, kept: string) => kept);
const hash = (s: string) => createHash("sha256").update(normalise(s)).digest("hex").slice(0, 32);

describe("existing looks render byte-identical output (no opt-in features used)", () => {
  const current: Record<string, string> = {};
  for (const id of LOOK_NUMBER_ORDER) if (getLook(id)) current[id] = hash(renderLook(id));

  if (process.env.UPDATE_COMPAT === "1") {
    it("writes the fixture", () => {
      writeFileSync(FIXTURE, `${JSON.stringify(current, null, 1)}\n`);
    });
    return;
  }
  const recorded = existsSync(FIXTURE) ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, string>) : {};
  it("has a recorded hash for every look", () => {
    expect(Object.keys(recorded).sort()).toEqual(Object.keys(current).sort());
  });
  for (const id of Object.keys(current)) {
    it(`#${LOOK_NUMBER_ORDER.indexOf(id) + 1} ${id}`, () => {
      expect(current[id]).toBe(recorded[id]);
    });
  }
});
