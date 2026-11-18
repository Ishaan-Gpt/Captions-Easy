import { describe, expect, it } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type Page } from "@capseasy/shared";
import { getLook, resolveStyle } from "@capseasy/templates";
import { applyLayoutSafety, prepareDoc } from "./CaptionedVideo";
import { CaptionedVideoProps } from "./props";

const doc = (texts: string[]) => CaptionDocSchema.parse({ version: 2, words: texts.map((t, i) => ({ id: `w${i}`, text: t, startMs: i * 300, endMs: i * 300 + 280 })) });
const canvas = { width: 1080, height: 1920, fps: 30 };

describe("backward compatibility of the language / layout options", () => {
  it("props: layout defaults to null; existing props parse unchanged", () => {
    const p = CaptionedVideoProps.parse({});
    expect(p.layout).toBeNull();
    expect(CaptionedVideoProps.parse({ layout: { safeZone: "tiktok", avoid: [{ x: 0, y: 0.5, w: 1, h: 0.2 }] } }).layout?.avoid).toHaveLength(1);
  });

  it("prepareDoc: romanize off (default) or a Latin-only doc -> same doc object", () => {
    const d = doc(["hello", "world"]);
    expect(prepareDoc(d, ProjectSettingsSchema.parse({}))).toBe(d);
    expect(prepareDoc(d, ProjectSettingsSchema.parse({ romanize: true }))).toBe(d);
    const hi = doc(["नमस्ते", "दोस्तों"]);
    expect(prepareDoc(hi, ProjectSettingsSchema.parse({}))).toBe(hi);
    expect(prepareDoc(hi, ProjectSettingsSchema.parse({ romanize: true })).words.map((w) => w.text)).toEqual(["namaste", "doston"]);
  });

  it("prepareDoc: hinglishSpelling is opt-in", () => {
    const d = doc(["yah", "video", "zaroor", "dekhana"]);
    expect(prepareDoc(d, ProjectSettingsSchema.parse({}))).toBe(d);
    expect(prepareDoc(d, ProjectSettingsSchema.parse({ hinglishSpelling: "off" }))).toBe(d);
    expect(prepareDoc(d, ProjectSettingsSchema.parse({ hinglishSpelling: "creator" })).words.map((w) => w.text)).toEqual(["yeh", "video", "zaroor", "dekhna"]);
  });

  it("applyLayoutSafety: no layout -> the same pages array", () => {
    const style = resolveStyle(getLook("hormozi_box")!.style);
    const pages: Page[] = [{ id: "p", startMs: 0, endMs: 900, words: [], lines: [], heroIndex: 0, emotion: "neutral", position: null, styleOverride: null }];
    expect(applyLayoutSafety(pages, null, style, canvas)).toBe(pages);
    expect(applyLayoutSafety(pages, undefined, style, canvas)).toBe(pages);
    expect(applyLayoutSafety(pages, {}, style, canvas)).toBe(pages);
  });

  it("applyLayoutSafety: a face box over the caption moves it via page.position", () => {
    const style = resolveStyle(getLook("hormozi_box")!.style);
    const words = doc(["stop", "scrolling", "now"]).words;
    const pages: Page[] = [{ id: "p", startMs: 0, endMs: 900, words, lines: [words], heroIndex: 0, emotion: "neutral", position: null, styleOverride: null }];
    const out = applyLayoutSafety(pages, { avoid: [{ x: 0.1, y: style.position.y - 0.1, w: 0.8, h: 0.2, label: "face" }] }, style, canvas);
    expect(out).not.toBe(pages);
    expect(out[0]!.position).not.toBeNull();
    expect(Math.abs(out[0]!.position!.y - style.position.y)).toBeGreaterThan(0.1);
  });
});
