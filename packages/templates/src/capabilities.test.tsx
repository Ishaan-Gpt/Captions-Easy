/**
 * Measures, per look, which opt-in word levers its layout really honours (word roles compile to these), and whether
 * it keeps every word whole (letter-splitting layouts break complex-script shaping such as Devanagari conjuncts).
 * The result is committed as looks/capabilities.generated.json and read by the captionseasy API, so a look never
 * advertises a role effect it ignores. `UPDATE_CAPS=1 vitest run src/capabilities.test.tsx` rewrites it.
 */
import React from "react";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type Word } from "@capseasy/shared";
import { derivePages } from "@motion-ai/caption-engine/core";
import { PageView } from "./PageView";
import { LOOK_NUMBER_ORDER, applyLook, getLook } from "./registry";
import type { LookCapabilities } from "./capabilities";
import type { MeasureFn } from "./types";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "looks", "capabilities.generated.json");
const measure: MeasureFn = (t, s) => t.length * s.fontSize * 0.55 + t.length * (s.letterSpacing ?? 0);
const canvas = { width: 1080, height: 1920, fps: 30 };

const LATIN = "We grew our tiny bakery into a real business this year".split(" ");
const TARGET = 5; // "into": never the card's automatic key word ("bakery" is)
const DEVANAGARI = "नमस्ते दोस्तों आज हम क्रिकेट सीखेंगे".split(" ");

function pagesFor(id: string, words: Word[]) {
  const { style, settings } = applyLook(getLook(id)!);
  const doc = CaptionDocSchema.parse({ version: 2, words });
  const pages = derivePages(doc, ProjectSettingsSchema.parse(settings), { measure: (t) => measure(t, { fontFamily: "x", fontWeight: 400, fontSize: style.fontSize }), maxLineWidth: canvas.width * style.maxWidth });
  return { style, pages };
}
const html = (id: string, words: Word[], at: (p: { startMs: number; endMs: number; words: Word[] }) => number[]) => {
  const { style, pages } = pagesFor(id, words);
  return pages.flatMap((page) => at(page).map((t) => renderToStaticMarkup(<PageView page={page} timeMs={t} style={style} canvas={canvas} measure={measure} />))).join("\n");
};
const latin = (patch: Partial<Word> = {}): Word[] => LATIN.map((text, i) => ({ id: `w${i}`, text, startMs: i * 380, endMs: i * 380 + 340, ...(i === TARGET ? patch : {}) }));
const moments = (p: { startMs: number; endMs: number; words: Word[] }) => [p.startMs + 40, ...p.words.flatMap((w) => [w.startMs + 30, w.startMs + 120, w.endMs + 20]), Math.round((p.startMs + p.endMs) / 2), p.endMs - 30].filter((t) => t >= p.startMs && t < p.endMs);

export function measureCapabilities(id: string): LookCapabilities {
  const base = html(id, latin(), moments);
  const differs = (patch: Partial<Word>) => html(id, latin(patch), moments) !== base;
  const deva: Word[] = DEVANAGARI.map((text, i) => ({ id: `d${i}`, text, startMs: i * 420, endMs: i * 420 + 380 }));
  const { pages } = pagesFor(id, deva);
  const wholeWords = pages.every((p) => {
    // a word counts as drawn whole if it shows whole at any of these moments (while spoken, too: one-word-at-a-time
    // compositions show each word only while it is spoken)
    const late = html(id, deva, (q) => (q.startMs === p.startMs ? [Math.round((p.startMs + p.endMs) / 2), p.endMs - 30, ...p.words.flatMap((w) => [Math.min(p.endMs - 1, w.startMs + 60), Math.min(p.endMs - 1, w.endMs + 20)])] : []));
    return p.words.every((w) => late.includes(w.text));
  });
  return {
    levers: { emphasis: differs({ emphasis: "hero" }), color: differs({ color: "#13579B" }), size: differs({ scale: 0.6 }), entry: differs({ entry: "pop" }) },
    wholeWords,
  };
}

describe("look capabilities (role levers, whole words)", () => {
  const ids = LOOK_NUMBER_ORDER.filter((id) => getLook(id));
  const now: Record<string, LookCapabilities> = Object.fromEntries(ids.map((id) => [id, measureCapabilities(id)]));
  if (process.env.UPDATE_CAPS === "1") {
    it("writes the table", () => writeFileSync(FILE, `${JSON.stringify(now, null, 1)}\n`));
    return;
  }
  const recorded = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Record<string, LookCapabilities>) : {};
  for (const id of ids) it(id, () => expect(now[id]).toEqual(recorded[id]));
  it("covers exactly the looks", () => expect(Object.keys(recorded).sort()).toEqual([...ids].sort()));
});
