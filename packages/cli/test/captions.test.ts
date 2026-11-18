import { describe, expect, it } from "vitest";
import { buildCaptions } from "../src/captions";
import type { CaptionsEasyError } from "../src/errors";

const words = [
  { text: "Stop", startMs: 0, endMs: 300 },
  { text: "scrolling", startMs: 300, endMs: 800 },
  { text: "now.", startMs: 800, endMs: 1200 },
];

const err = (f: () => unknown): CaptionsEasyError => {
  try {
    f();
  } catch (e) {
    return e as CaptionsEasyError;
  }
  throw new Error("expected an error");
};

describe("buildCaptions", () => {
  it("says a look is needed when none is given (0.3.0), instead of 'Unknown look \"\"'", () => {
    for (const look of [undefined, null, ""]) {
      const e = err(() => buildCaptions({ words, look } as never));
      expect(e.code).toBe("BAD_ARGS");
      expect(e.message).toMatch(/needs a look/);
    }
  });

  it("is deterministic: the same input gives deep-equal props, word ids included (0.2.0)", () => {
    for (const look of [12, 1, "ransom_cutouts"] as const) {
      const a = buildCaptions({ words, look });
      const b = buildCaptions({ words, look });
      expect(a).toEqual(b);
      expect(new Set(a.doc.words.map((w) => w.id)).size).toBe(a.doc.words.length);
    }
    const tracks = [{ name: "a", look: 12, time: [0, 600] as [number, number] }, { name: "b", look: 104, time: { fromMs: 600 } }];
    expect(buildCaptions({ words, tracks })).toEqual(buildCaptions({ words, tracks }));
    // ids depend on content: changed timing -> changed id
    const moved = buildCaptions({ words: [{ ...words[0]!, startMs: 10 }, ...words.slice(1)], look: 12 });
    expect(moved.doc.words[0]!.id).not.toBe(buildCaptions({ words, look: 12 }).doc.words[0]!.id);
  });

  it("builds valid props from words + look number", () => {
    const p = buildCaptions({ words, look: 12 });
    expect(p.look).toEqual({ number: 12, id: "hormozi_box", name: "Jumping Box" });
    expect(p.doc.version).toBe(2);
    expect(p.doc.words.map((w) => w.text)).toEqual(["Stop", "scrolling", "now."]);
    expect(p.doc.words.every((w) => typeof w.id === "string" && w.id.length > 0)).toBe(true);
    expect(p.style.templateId).toBe("boxed_word");
    expect(p.settings.maxWordsPerCard).toBe(3);
    expect(p.warnings).toEqual([]);
  });

  it("applies flat and nested overrides and pacing settings", () => {
    const p = buildCaptions({
      words,
      look: "hormozi_box",
      overrides: { "active.boxColor": "#FF3366", position: { y: 0.6 }, fontSize: "80" },
      settings: { maxWordsPerCard: 2, gapBehavior: "clear" },
    });
    expect((p.style.active as { boxColor: string }).boxColor).toBe("#FF3366");
    expect((p.style.position as { y: number }).y).toBe(0.6);
    expect(p.style.fontSize).toBe(80);
    expect(p.settings).toMatchObject({ maxWordsPerCard: 2, gapBehavior: "clear" });
  });

  it("switches a toggle on for its dependent control, with a warning", () => {
    const p = buildCaptions({ words, look: 12, overrides: { "glow.radius": 20 } });
    expect(p.style.glow).toMatchObject({ enabled: true, radius: 20 });
    expect(p.warnings.join(" ")).toMatch(/glow.enabled=true/);
  });

  it("rejects unknown keys with the list of valid ones", () => {
    const e = err(() => buildCaptions({ words, look: 12, overrides: { "nope.key": 1 } }));
    expect(e.code).toBe("BAD_OVERRIDE");
    expect(e.message).toMatch(/Unknown style key "nope.key"/);
    expect((e.details as { validKeys: string[] }).validKeys).toContain("active.color");
  });

  it("rejects keys the design of the look ignores", () => {
    const e = err(() => buildCaptions({ words, look: 118, overrides: { "background.type": "box" } }));
    expect(e.code).toBe("BAD_OVERRIDE");
    expect(e.message).toMatch(/does not use "background.type"/);
  });

  it("rejects bad values: range, number, enum, colour, font, boolean", () => {
    expect(err(() => buildCaptions({ words, look: 12, overrides: { fontSize: 9000 } })).message).toMatch(/between/);
    expect(err(() => buildCaptions({ words, look: 12, overrides: { fontSize: "big" } })).message).toMatch(/must be a number/);
    expect(err(() => buildCaptions({ words, look: 12, overrides: { casing: "shouty" } })).message).toMatch(/one of/);
    expect(err(() => buildCaptions({ words, look: 12, overrides: { "active.color": "not-a-colour" } })).message).toMatch(/colour/);
    expect(err(() => buildCaptions({ words, look: 12, overrides: { fontId: "Comic Sans MS" } })).message).toMatch(/not a bundled font/);
    expect(err(() => buildCaptions({ words, look: 12, overrides: { "stroke.enabled": "maybe" } })).message).toMatch(/true or false/);
  });

  it("asks for prerequisites that change the motion instead of switching them silently", () => {
    expect(err(() => buildCaptions({ words, look: 12, overrides: { "exit.durationMs": 300 } })).message).toMatch(/only takes effect when exit.type=/);
    const ok = buildCaptions({ words, look: 12, overrides: { "exit.durationMs": 300, "exit.type": "fade" } });
    expect(ok.style.exit).toEqual({ type: "fade", durationMs: 300 });
  });

  it("rejects bad settings and bad words", () => {
    expect(err(() => buildCaptions({ words, look: 12, settings: { maxWordsPerCard: 50 } })).code).toBe("BAD_SETTINGS");
    expect(err(() => buildCaptions({ words, look: 12, settings: { bogus: 1 } })).message).toMatch(/Unknown setting/);
    expect(err(() => buildCaptions({ words: [{ text: "x", startMs: 10 } as never], look: 12 })).code).toBe("BAD_WORDS");
    expect(err(() => buildCaptions({ words: [{ text: "x", startMs: 500, endMs: 100 }], look: 12 })).message).toMatch(/ends before/);
  });

  it("one-word looks keep one word per card", () => {
    const p = buildCaptions({ words, look: "beast_bounce", settings: { maxWordsPerCard: 4 } });
    expect(p.settings.maxWordsPerCard).toBe(1);
    expect(p.warnings.join(" ")).toMatch(/maxWordsPerCard ignored/);
  });
});
