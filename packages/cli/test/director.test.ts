/**
 * The caption director (src/director): rules-first look, key words, words per card and position, judged by the taste
 * rules in src/director/SKILL.md on three sample transcripts (test/__fixtures__/director-samples.json).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCaptions } from "../src/captions";
import { directCaptions, parseMeaning } from "../src/director";
import type { DirectCaptionsInput, TranscriptWord } from "../src/types";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLES = JSON.parse(readFileSync(join(here, "__fixtures__", "director-samples.json"), "utf8")) as {
  name: string;
  input: Record<string, unknown> & { words: TranscriptWord[] };
}[];

describe("caption director", () => {
  for (const s of SAMPLES) {
    it(`${s.name}: every taste rule holds and the arguments build`, () => {
      const r = directCaptions(s.input as never);
      for (const c of r.checks) expect(c.ok, `${c.rule}: ${c.detail}`).toBe(true);
      expect(r.wordsPerCard).toBeLessThanOrEqual(4);
      expect(r.keyWords.length).toBeGreaterThan(0);
      expect(r.keyWords.length).toBeLessThan(s.input.words.length / 2);
      // the arguments are valid buildCaptions input as they are
      const props = buildCaptions(r.args);
      expect(props.doc.words.length).toBe(s.input.words.length);
      // deterministic: same input, same decision
      expect(directCaptions(s.input as never)).toEqual(r);
    });
  }

  it("moves the captions to the upper band when a face fills the lower band", () => {
    const s = SAMPLES[0]!;
    const r = directCaptions({ ...(s.input as unknown as DirectCaptionsInput), faces: [{ x: 0.25, y: 0.45, w: 0.5, h: 0.4, label: "face" }] });
    expect(r.position.band).toBe("upper");
    expect(r.position.y * 1920).toBeGreaterThan(230);
    expect(r.position.y * 1920).toBeLessThan(560);
    expect(r.checks.find((c) => c.rule.includes("face"))!.ok).toBe(true);
  });

  it("the caller's roles win and the model's key words are used, one a card at most", () => {
    const words = SAMPLES[0]!.input.words.map((w, i) => (i === 1 ? { ...w, role: "key" as const } : w));
    const r = directCaptions({ words, meaning: { keyWords: [3, 4, 5, 6] }, look: 12 });
    expect(r.keyWords.map((k) => k.index)).toContain(1);
    // four adjacent model picks cannot all be emphasised: at most one or two a card
    expect(r.keyWords.filter((k) => [3, 4, 5, 6].includes(k.index)).length).toBeLessThan(4);
  });

  it("a model may only fill meaning: colours, timings and positions are refused", () => {
    expect(parseMeaning('{"mood":"calm","keyWords":[1,2]}', 5)).toEqual({ mood: "calm", keyWords: [1, 2] });
    expect(() => parseMeaning({ color: "#ff0000" }, 5)).toThrow(/refused/);
    expect(() => parseMeaning({ startMs: 100 }, 5)).toThrow(/refused/);
    expect(() => parseMeaning({ position: { y: 0.2 } }, 5)).toThrow(/refused/);
    expect(() => parseMeaning({ keyWords: [9] }, 5)).toThrow(/indices/);
    expect(() => parseMeaning({ mood: "#fff" }, 5)).toThrow(/mood/);
  });

  it("fast hype speech gets short cards, slow calm speech longer ones (never above 4)", () => {
    const at = (n: number, perMs: number): TranscriptWord[] => Array.from({ length: n }, (_, i) => ({ text: ["make", "this", "simple", "change", "today", "and", "watch", "growth"][i % 8]!, startMs: i * perMs, endMs: i * perMs + perMs - 20 }));
    expect(directCaptions({ words: at(24, 250), mood: "hype", look: 12 }).wordsPerCard).toBe(2);
    expect(directCaptions({ words: at(24, 520), mood: "calm", look: 12 }).wordsPerCard).toBe(4);
  });
});
