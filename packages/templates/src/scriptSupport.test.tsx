import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Page } from "@capseasy/shared";
import { KNOWN_FONTS, LOOKS, fontStack, getTemplate, measure, resolveStyle } from "./index";
import { NATIVE_DEVANAGARI, activateDevanagariFallback, devanagariPartner, resetScriptFallbacks, scriptFallbackFamilies, scriptFallbackKey, DEVANAGARI_FONTS } from "./scriptFonts";
import { LATIN_ONLY_TEMPLATES, lookScriptSupport, measureCardBox, templateScripts } from "./scriptSupport";
import { lookCapabilities } from "./capabilities";

const MODULE: Record<string, string> = { "Baloo 2": "Baloo2", Mukta: "Mukta", Hind: "Hind", "Noto Sans Devanagari": "NotoSansDevanagari", "Tiro Devanagari Hindi": "TiroDevanagariHindi" };

afterEach(() => resetScriptFallbacks());

describe("script fallback fonts", () => {
  it("Latin-only: font stacks are byte-for-byte what they were (nothing activated)", () => {
    expect(fontStack("Anton")).toBe("'Anton', system-ui, sans-serif");
    expect(fontStack("Montserrat")).toBe("'Montserrat', system-ui, sans-serif");
    expect(fontStack("Impact")).toBe("'Impact', 'Anton', system-ui, sans-serif");
    expect(scriptFallbackFamilies([{ text: "hello" }, { text: "world!" }], ["Anton", "Montserrat"])).toEqual([]);
  });

  it("Devanagari words ask for one partner per look font; activation adds only that alias to the stack", () => {
    expect(scriptFallbackFamilies([{ text: "hello" }, { text: "यार" }], ["Anton", "Bebas Neue", "Playfair Display"])).toEqual([scriptFallbackKey("Mukta"), scriptFallbackKey("Tiro Devanagari Hindi")]);
    activateDevanagariFallback("Mukta");
    expect(fontStack("Anton")).toBe("'Anton', 'ce-deva Mukta', system-ui, sans-serif");
    expect(fontStack("Playfair Display")).toBe("'Playfair Display', system-ui, sans-serif"); // its partner is not active
    expect(fontStack("Impact")).toBe("'Impact', 'Anton', 'ce-deva Mukta', system-ui, sans-serif");
  });

  it("every look font has a Devanagari partner from the OFL set (or draws Devanagari itself)", () => {
    for (const f of KNOWN_FONTS) {
      const p = devanagariPartner(f);
      if (NATIVE_DEVANAGARI.has(f)) expect(p).toBe(f);
      else expect(DEVANAGARI_FONTS as readonly string[]).toContain(p);
    }
  });

  it("the native list and the fallback families really ship a devanagari subset", async () => {
    for (const fam of [...NATIVE_DEVANAGARI, ...DEVANAGARI_FONTS]) {
      const mod = (await import(`@remotion/google-fonts/${MODULE[fam] ?? fam.replace(/ /g, "")}`)) as { getInfo: () => { subsets: string[] } };
      expect(mod.getInfo().subsets, fam).toContain("devanagari");
    }
  });
});

describe("look script support", () => {
  const words = ["क्या", "ज़िंदगी", "पहले"].map((t, i) => ({ id: `w${i}`, text: t, startMs: i * 300, endMs: i * 300 + 300 }));
  const page = { id: "p", index: 0, startMs: 0, endMs: 900, words, lines: [words], heroIndex: 1, emotion: "neutral", position: null, styleOverride: null } as Page;
  /** a text run starting with a dependent sign / ending in a virama = a word split inside a syllable */
  const splits = (html: string) => [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1]!).some((x) => /^[ऀ-ःऺ-्॑-ॗॢॣ]/.test(x) || /्$/.test(x));

  it("LATIN_ONLY_TEMPLATES = (templates splitting a syllable) + (looks not drawing whole words, capabilities table)", () => {
    const split = new Set<string>();
    for (const look of LOOKS) {
      const t = getTemplate(look.templateId);
      const html = [60, 200, 450, 700, 850]
        .map((timeMs) => renderToStaticMarkup(React.createElement(t.Page, { page, timeMs, style: resolveStyle(look.style), canvas: { width: 1080, height: 1920, fps: 30 }, measure, settled: false })))
        .join("");
      if (splits(html)) split.add(look.templateId);
    }
    const broken = new Set(LOOKS.filter((l) => !lookCapabilities(l.id).wholeWords).map((l) => l.templateId));
    expect([...new Set([...split, ...broken])].sort()).toEqual([...LATIN_ONLY_TEMPLATES].sort());
    // and per look: unsupported devanagari <=> its template is on the list
    for (const l of LOOKS) expect(lookScriptSupport(l).unsupported.includes("devanagari"), l.id).toBe(LATIN_ONLY_TEMPLATES.has(l.templateId));
  });

  it("declares support per look", () => {
    expect(templateScripts(getTemplate("typewriter"))).toEqual(["latin"]);
    expect(lookScriptSupport("beast_bounce")).toEqual({ native: ["latin"], fallback: { devanagari: "Baloo 2" }, unsupported: [] }); // Luckiest Guy
    const metal = LOOKS.find((l) => l.templateId === "metal_script")!;
    expect(lookScriptSupport(metal).unsupported).toEqual(["devanagari"]);
    for (const l of LOOKS) expect(lookScriptSupport(l).native).toContain("latin");
  });
});

describe("measureCardBox", () => {
  it("returns a sane fraction box that grows with the text", () => {
    const style = resolveStyle(LOOKS[0]!.style);
    const mk = (texts: string[]) => {
      const ws = texts.map((t, i) => ({ id: `${t}${i}`, text: t, startMs: 0, endMs: 1 }));
      return { id: "p", startMs: 0, endMs: 1, words: ws, lines: [ws], heroIndex: 0, emotion: "neutral", position: null, styleOverride: null } as Page;
    };
    const canvas = { width: 1080, height: 1920, fps: 30 };
    const a = measureCardBox(mk(["hi"]), style, canvas, measure);
    const b = measureCardBox(mk(["hello", "there", "friend"]), style, canvas, measure);
    expect(a.w).toBeGreaterThan(0);
    expect(a.h).toBeGreaterThan(0);
    expect(b.w).toBeGreaterThanOrEqual(a.w);
    expect(b.w).toBeLessThanOrEqual(1);
  });
});
