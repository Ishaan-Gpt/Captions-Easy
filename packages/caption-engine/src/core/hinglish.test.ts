import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { hinglishSpelling, hinglishSpellingTokens, hinglishSpellingWords, normalizeTokens, type HinglishRewrite } from "./index";
import { HINGLISH_GOLDEN, HINGLISH_HELDOUT } from "./hinglish.golden";

const score = (list: [string, string][]) => {
  const miss: string[] = [];
  for (const [inp, want] of list) {
    const got = hinglishSpelling(inp);
    if (!want.split("|").includes(got)) miss.push(`${inp} -> ${got} (want ${want})`);
  }
  return { rate: 1 - miss.length / list.length, miss };
};

describe("hinglishSpelling (scholarly Roman -> creator spelling)", () => {
  it("golden list: >= 120 inputs incl. English traps, >= 95% exact", () => {
    expect(HINGLISH_GOLDEN.length).toBeGreaterThanOrEqual(120);
    const r = score(HINGLISH_GOLDEN);
    console.info(`hinglishSpelling golden: ${(r.rate * 100).toFixed(1)}% of ${HINGLISH_GOLDEN.length}`, r.miss);
    expect(r.rate).toBeGreaterThanOrEqual(0.95);
  });

  it("held-out list (never tuned against): >= 90%", () => {
    const r = score(HINGLISH_HELDOUT);
    console.info(`hinglishSpelling held-out: ${(r.rate * 100).toFixed(1)}% of ${HINGLISH_HELDOUT.length}`, r.miss);
    expect(r.rate).toBeGreaterThanOrEqual(0.9);
  });

  it("never touches English sentences", () => {
    for (const s of ["I had a ham sandwich", "the main road is closed", "these men are strong", "yah, I know", "close the door", "a banana and a mango"]) {
      expect(hinglishSpelling(s)).toBe(s);
    }
  });

  it("the Hinglish model's transcript reads the way creators type", () => {
    const model = "Yah video end tak zaroor dekhana kyonki last mein ek bahut bada surprise hai. Mainne yah phone pichhale mahine kharida tha aur honestly iska battery backup bahut achchha hai. Mujhe nahin pata tha. Chalo aaj ham Delhi ki sabse famous chaat try karte hain.";
    expect(hinglishSpelling(model)).toBe(
      "Yeh video end tak zaroor dekhna kyunki last mein ek bahut bada surprise hai. Maine yeh phone pichle mahine kharida tha aur honestly iska battery backup bahut achha hai. Mujhe nahi pata tha. Chalo aaj hum Delhi ki sabse famous chaat try karte hain.",
    );
  });

  it("keeps case and punctuation, reports why each word changed", () => {
    const why: HinglishRewrite[] = [];
    expect(hinglishSpellingTokens(["Nahin,", "ham", "nahin", "aayenge!"], {}, why)).toEqual(["Nahi,", "hum", "nahi", "aayenge!"]);
    expect(why.map((w) => w.why)).toEqual(["table", "context", "table"]);
  });

  it("words API returns the same array when nothing changes", () => {
    const en = [{ text: "hello" }, { text: "world" }];
    expect(hinglishSpellingWords(en)).toBe(en);
    const hi = [{ text: "yah", startMs: 0 }, { text: "kya", startMs: 1 }, { text: "hai", startMs: 2 }];
    const out = hinglishSpellingWords(hi);
    expect(out.map((w) => w.text)).toEqual(["yeh", "kya", "hai"]);
    expect(out[1]).toBe(hi[1]);
    expect(out[0]).toEqual({ text: "yeh", startMs: 0 });
  });

  it("opt-in only: normalizeTokens and settings default to unchanged output", () => {
    const toks = ["yah", "video", "dekhana"].map((t, i) => ({ text: ` ${t}`, startMs: i * 300, endMs: i * 300 + 280 }));
    expect(normalizeTokens(toks).map((w) => w.text)).toEqual(["yah", "video", "dekhana"]);
    expect(normalizeTokens(toks, { hinglishSpelling: "creator" }).map((w) => w.text)).toEqual(["yeh", "video", "dekhna"]);
    const parsed = ProjectSettingsSchema.parse({});
    expect("hinglishSpelling" in parsed).toBe(false);
    expect(ProjectSettingsSchema.parse({ hinglishSpelling: "creator" }).hinglishSpelling).toBe("creator");
  });

  it("deterministic", () => {
    const text = HINGLISH_GOLDEN.map(([i]) => i).join(" ");
    expect(hinglishSpelling(text)).toBe(hinglishSpelling(text));
  });
});
