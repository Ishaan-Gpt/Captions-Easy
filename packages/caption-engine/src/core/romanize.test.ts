import { describe, expect, it } from "vitest";
import { detectScript, normalizeTokens, romanize, romanizeAsync, romanizeWords, scriptsOf, scriptsOfWords } from "./index";
import { ROMANIZE_GOLDEN, ROMANIZE_HELDOUT } from "./romanize.golden";

const rate = (list: [string, string][], opts?: { dictionary?: boolean }) => {
  const miss: string[] = [];
  for (const [deva, want] of list) {
    const got = romanize(deva, opts);
    if (!want.split("|").includes(got)) miss.push(`${deva} -> ${got} (want ${want})`);
  }
  return { rate: 1 - miss.length / list.length, miss };
};

describe("romanize (Devanagari -> Hinglish)", () => {
  it("golden list: >= 150 entries, >= 90% exact", () => {
    expect(ROMANIZE_GOLDEN.length).toBeGreaterThanOrEqual(150);
    const r = rate(ROMANIZE_GOLDEN);
    console.info(`romanize golden: ${(r.rate * 100).toFixed(1)}% of ${ROMANIZE_GOLDEN.length}`, r.miss);
    expect(r.rate).toBeGreaterThanOrEqual(0.9);
  });

  it("rules alone (no dictionary) still clear 90% on the golden list", () => {
    const r = rate(ROMANIZE_GOLDEN, { dictionary: false });
    console.info(`romanize rules-only: ${(r.rate * 100).toFixed(1)}%`);
    expect(r.rate).toBeGreaterThanOrEqual(0.9);
  });

  it("held-out list (never tuned against) clears 85%", () => {
    const r = rate(ROMANIZE_HELDOUT);
    console.info(`romanize held-out: ${(r.rate * 100).toFixed(1)}% of ${ROMANIZE_HELDOUT.length}`, r.miss);
    expect(r.rate).toBeGreaterThanOrEqual(0.85);
  });

  it("spec examples", () => {
    expect(romanize("पहले हम ऐसे चलते थे")).toBe("pehle hum aise chalte the");
    expect(romanize("वो करते हैं")).toBe("wo karte hain");
    expect(romanize("क्या बात है यार")).toBe("kya baat hai yaar");
  });

  it("schwa deletion, nasals, nukta, conjuncts (rules only)", () => {
    const r = (s: string) => romanize(s, { dictionary: false });
    expect(r("समझना")).toBe("samajhna"); // medial: keep the first schwa, drop the second
    expect(r("करता")).toBe("karta");
    expect(r("कमल")).toBe("kamal"); // final dropped, medial kept before a cluster
    expect(r("लंबा")).toBe("lamba"); // anusvara before a labial -> m
    expect(r("हिंदी")).toBe("hindi");
    expect(r("में")).toBe("mein");
    expect(r("ज़िंदगी")).toBe("zindagi"); // nukta + schwa kept after a nasal coda
    expect(r("फ़ैसला")).toBe("faisla");
    expect(r("क्षमा")).toBe("kshama");
    expect(r("ज्ञान")).toBe("gyaan");
    expect(r("अच्छा")).toBe("achha");
    expect(r("बच्चा")).toBe("baccha");
    expect(r("मित्र")).toBe("mitra"); // final schwa kept after a conjunct ending in r
    expect(r("पहले")).toBe("pehle");
    expect(r("यह")).toBe("yeh");
  });

  it("leaves Latin, digits and punctuation alone; Devanagari digits and danda become ASCII", () => {
    expect(romanize("hello world")).toBe("hello world");
    expect(romanize("यार, ये तो कमाल है!")).toMatch(/^yaar, ye to kamaa?l hai!$/);
    expect(romanize("२०२४ में।")).toBe("2024 mein.");
    expect(romanize("video  देखो")).toBe("video  dekho");
  });

  it("custom exceptions win, dictionary can be disabled", () => {
    expect(romanize("हम", { exceptions: { "हम": "hm" } })).toBe("hm");
    expect(romanize("हम", { dictionary: false })).toBe("ham");
  });

  it("sync callback overrides per word, once per distinct word", () => {
    const seen: string[] = [];
    const out = romanize("हम हम नहीं", { callback: (w, ctx) => (seen.push(w), w === "नहीं" ? "nahin" : ctx.builtIn.toUpperCase()) });
    expect(out).toBe("HUM HUM nahin");
    expect(seen).toEqual(["हम", "नहीं"]);
    expect(romanize("हम", { callback: () => null })).toBe("hum");
  });

  it("async callback (e.g. an LLM) returns a Promise; a failing hook keeps the built-in word", async () => {
    const p = romanize("नहीं यार", { callback: async (w) => (w === "यार" ? "yaarr" : undefined) });
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toBe("nahi yaarr");
    expect(await romanizeAsync("नहीं", { callback: async () => { throw new Error("offline"); } })).toBe("nahi");
    expect(await romanizeAsync("hello")).toBe("hello");
  });

  it("deterministic", () => {
    const text = ROMANIZE_GOLDEN.map(([d]) => d).join(" ");
    expect(romanize(text)).toBe(romanize(text));
  });

  it("normalizeTokens({ romanize: true }) uses the built-in romanizer; default leaves text alone", () => {
    const toks = [{ text: " नमस्ते", startMs: 0, endMs: 300 }, { text: " दोस्तों", startMs: 300, endMs: 700 }, { text: " guys", startMs: 700, endMs: 900 }];
    expect(normalizeTokens(toks, { romanize: true }).map((w) => w.text)).toEqual(["namaste", "doston", "guys"]);
    expect(normalizeTokens(toks).map((w) => w.text)).toEqual(["नमस्ते", "दोस्तों", "guys"]);
    expect(normalizeTokens(toks, { romanize: false }).map((w) => w.text)).toEqual(["नमस्ते", "दोस्तों", "guys"]);
  });

  it("romanizeWords returns the same array when there is nothing to romanize", () => {
    const latin = [{ text: "hi" }, { text: "there" }];
    expect(romanizeWords(latin)).toBe(latin);
    const mixed = [{ text: "hi", id: 1 }, { text: "दोस्त", id: 2 }];
    const out = romanizeWords(mixed);
    expect(out).not.toBe(mixed);
    expect(out[0]).toBe(mixed[0]);
    expect(out[1]).toEqual({ text: "dost", id: 2 });
  });
});

describe("script detection", () => {
  it("detects the dominant script per word", () => {
    expect(detectScript("hello")).toBe("latin");
    expect(detectScript("नमस्ते")).toBe("devanagari");
    expect(detectScript("123!")).toBe("common");
    expect(detectScript("café")).toBe("latin");
    expect(detectScript("привет")).toBe("cyrillic");
    expect(detectScript("مرحبا")).toBe("arabic");
    expect(detectScript("வணக்கம்")).toBe("tamil");
    expect(scriptsOf("video देखो 😀")).toEqual(["latin", "devanagari"]);
    expect(scriptsOfWords([{ text: "hi" }, { text: "यार" }])).toEqual(["latin", "devanagari"]);
  });
});
