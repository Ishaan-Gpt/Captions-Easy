/** 0.2.0 multi-look tracks: buildCaptions({ tracks }), validation (BAD_TRACKS), planTracks, CLI/MCP wiring, plus the
 *  Hinglish detection and theme font-weight fixes found while building the demos. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getFontEntry, applyLook } from "@capseasy/templates";
import { parseArgs } from "../src/args";
import { buildCaptions } from "../src/captions";
import type { CaptionsEasyError } from "../src/errors";
import { listLooks, resolveLook } from "../src/looks";
import { handle } from "../src/mcp";
import { planTracks } from "../src/plan";
import { analyzeTranscript } from "../src/recommend";
import { listThemes, themeOverrides, visualWeight } from "../src/themes";
import { morphCompatible } from "../src/tracks";

const err = (f: () => unknown): CaptionsEasyError => {
  try {
    f();
  } catch (e) {
    return e as CaptionsEasyError;
  }
  throw new Error("expected an error");
};
const TEXT = "Maybe it's not a popular opinion, but my language is dying. Not that there's only two of us left who speak it, but because of various factors. Number one, there's encroachment of English.";
const WORDS = TEXT.split(" ").map((text, i) => ({ text, startMs: i * 330, endMs: i * 330 + 300 }));
const HOOK_END = 11; // "... is dying."

const plan = () => [
  { slot: "hook" as const, look: 127, words: [0, HOOK_END] as [number, number] },
  { slot: "body" as const, look: 22, rest: true, transition: { type: "exit-entry" as const, overlapMs: 80 } },
  { slot: "stamp" as const, look: 19, role: ["number" as const, "name" as const], position: "top" as const },
];

describe("buildCaptions({ tracks })", () => {
  it("no tracks -> exactly today's single-look props (no tracks key)", () => {
    const a = buildCaptions({ words: WORDS, look: 12 });
    expect("tracks" in a).toBe(false);
  });

  it("one props object: every track with its own words, style, settings and look; one theme", () => {
    const p = buildCaptions({ words: WORDS, theme: "earthy-film", tracks: plan() });
    expect(p.tracks!.map((t) => [t.name, t.layer, t.look.number])).toEqual([["hook", 0, 127], ["body", 0, 22], ["stamp", 1, 19]]);
    const [hook, body, stamp] = p.tracks!;
    expect(hook!.doc.words.map((w) => w.text).join(" ")).toBe(TEXT.split(" ").slice(0, HOOK_END).join(" "));
    expect(hook!.doc.words.length + body!.doc.words.length).toBe(WORDS.length);
    expect(stamp!.doc.words.map((w) => w.text)).toEqual(["two", "one,", "English."]);
    expect(stamp!.style.position).toMatchObject({ y: 0.2 });
    expect(body!.transition).toEqual({ type: "exit-entry", durationMs: 260, overlapMs: 80 });
    expect(hook!.transition.type).toBe("cut");
    expect(new Set(p.tracks!.map((t) => t.theme?.id))).toEqual(new Set(["earthy-film"]));
    // the summary: all words, the main (base layer, most words) look
    expect(p.doc.words.length).toBe(WORDS.length);
    expect(p.look.number).toBe(22);
    expect(p.style).toEqual(body!.style);
    // word ids are shared between the summary doc and the tracks
    expect(new Set(p.doc.words.map((w) => w.id))).toEqual(new Set([...hook!.doc.words, ...body!.doc.words].map((w) => w.id)));
  });

  it("selects by time span (word middle) and by role inside a span", () => {
    const p = buildCaptions({ words: WORDS, tracks: [{ name: "a", look: 12, time: [0, 3300] }, { name: "b", look: 104, time: { fromMs: 3300 } }, { name: "s", slot: "number", look: 13, role: "number", time: [0, 6000] }] });
    expect(p.tracks![0]!.doc.words.length).toBe(10);
    expect(p.tracks![1]!.doc.words.length).toBe(WORDS.length - 10);
    expect(p.tracks![2]!.doc.words.map((w) => w.text)).toEqual(["two"]);
    expect(p.tracks![2]!.layer).toBe(1);
  });

  it("is deterministic", () => {
    const strip = (x: unknown) => JSON.stringify(x).replace(/"id":"[^"]+"/g, "");
    expect(strip(buildCaptions({ words: WORDS, theme: "neon-night", tracks: plan() }))).toBe(strip(buildCaptions({ words: WORDS, theme: "neon-night", tracks: plan() })));
  });

  it("morph only between compatible looks; otherwise exit-entry with a warning", () => {
    const sentence = listLooks().filter((l) => morphCompatible({ id: l.id, casing: String(applyLook(resolveLook(l.number)).style.casing) }, { id: l.id, casing: String(applyLook(resolveLook(l.number)).style.casing) }).ok);
    expect(sentence.length).toBeGreaterThan(5);
    const casing = (n: number) => String(applyLook(resolveLook(n)).style.casing);
    const a = sentence[0]!;
    const b = sentence.find((x) => x.id !== a.id && casing(x.number) === casing(a.number))!;
    const ok = buildCaptions({ words: WORDS, tracks: [{ look: a.number, words: [0, HOOK_END] }, { look: b.number, rest: true, transition: "morph" }] });
    expect(ok.tracks![1]!.transition).toEqual({ type: "morph", durationMs: 420, overlapMs: 0 });
    const no = buildCaptions({ words: WORDS, tracks: [{ look: 127, words: [0, HOOK_END] }, { look: 22, rest: true, transition: "morph" }] });
    expect(no.tracks![1]!.transition.type).toBe("exit-entry");
    expect(no.warnings.join(" ")).toMatch(/morph from track0 is not possible/);
  });

  it("custom looks and per-track overrides/settings are validated like single-look builds", () => {
    expect(err(() => buildCaptions({ words: WORDS, tracks: [{ look: 12, rest: true, overrides: { fontSize: 999 } }] })).code).toBe("BAD_OVERRIDE");
    expect(err(() => buildCaptions({ words: WORDS, tracks: [{ look: 12, rest: true, settings: { nope: 1 } }] })).code).toBe("BAD_SETTINGS");
    expect(err(() => buildCaptions({ words: WORDS, tracks: [{ look: 99999, rest: true }] })).code).toBe("UNKNOWN_LOOK");
  });
});

describe("track validation (BAD_TRACKS)", () => {
  const bad = (tracks: unknown, extra: object = {}) => err(() => buildCaptions({ words: WORDS, tracks: tracks as never, ...extra }));
  it("overlapping words on one layer name the words and tracks", () => {
    const e = bad([{ name: "a", look: 12, words: [0, 6] }, { name: "b", look: 104, words: [5, 20] }]);
    expect(e.code).toBe("BAD_TRACKS");
    expect(e.message).toMatch(/word 5 "opinion," \(a and b\)/);
    expect(e.message).toMatch(/higher layer/);
  });
  it("stamps over the body are fine on a higher layer", () => {
    expect(() => buildCaptions({ words: WORDS, tracks: [{ look: 12, rest: true }, { look: 13, words: [0, 4], layer: 1 }] })).not.toThrow();
  });
  it("every malformed plan says what is wrong", () => {
    expect(bad([]).code).toBe("BAD_TRACKS");
    expect(bad([{ look: 12 }]).message).toMatch(/selects no words/);
    expect(bad([{ words: [0, 3] }]).message).toMatch(/needs a look/);
    expect(bad([{ look: 12, words: [3, 3] }]).message).toMatch(/0 <= from < to/);
    expect(bad([{ look: 12, words: [0, 999] }]).code).toBe("BAD_TRACKS");
    expect(bad([{ look: 12, time: [500, 100] }]).message).toMatch(/fromMs < toMs/);
    expect(bad([{ look: 12, role: "hero" }]).message).toMatch(/not a role/);
    expect(bad([{ look: 12, rest: true, slot: "intro" }]).message).toMatch(/slot must be one of/);
    expect(bad([{ look: 12, rest: true, layer: 12 }]).message).toMatch(/layer/);
    expect(bad([{ look: 12, rest: true, transition: "wipe" }]).message).toMatch(/cut, exit-entry, morph/);
    expect(bad([{ look: 12, words: [0, 5], transition: { type: "exit-entry", durationMs: 100, overlapMs: 200 } }, { look: 104, rest: true }]).message).toMatch(/overlapMs/);
    expect(bad([{ look: 12, rest: true, exit: "explode" }]).message).toMatch(/exit must be one of/);
    expect(bad([{ look: 12, rest: true, position: "left" }]).message).toMatch(/position/);
    expect(bad([{ look: 12, rest: true }, { look: 104, rest: true }]).message).toMatch(/more than one rest/);
    expect(bad([{ name: "x", look: 12, words: [0, 4] }, { name: "x", look: 104, rest: true }]).message).toMatch(/unique name/);
    expect(bad([{ look: 12, rest: true }], { look: 12 }).message).toMatch(/either look .* or tracks/);
    expect(bad([{ look: 12, rest: true }], { overrides: { fontSize: 80 } }).message).toMatch(/tracks\[i\]\.overrides/);
    expect(bad([{ look: 12, rest: true }], { stamps: true }).message).toMatch(/stamp track/);
  });
  it("words no base-layer track takes are reported, not silently dropped", () => {
    const p = buildCaptions({ words: WORDS, tracks: [{ look: 12, words: [0, 10] }] });
    expect(p.warnings.join(" ")).toMatch(/are in no base-layer track/);
  });
});

describe("planTracks", () => {
  it("proposes hook / body / stamps under one theme, deterministic and directly buildable", () => {
    const p = planTracks({ transcript: WORDS, platform: "reels" });
    expect(p).toEqual(planTracks({ transcript: WORDS, platform: "reels" }));
    expect(p.tracks.map((t) => t.slot)).toEqual(["hook", "body", "stamp"]);
    expect(p.tracks[0]!.words).toEqual([0, HOOK_END]);
    expect(p.reasons.length).toBeGreaterThanOrEqual(4);
    const props = buildCaptions({ words: WORDS, theme: p.theme, tracks: p.tracks });
    expect(props.tracks!.length).toBe(3);
    // a look made from the video picture would black out the body: never a stamp layer
    expect([87]).not.toContain(p.tracks[2]!.look);
  });
  it("finds a call to action and keeps the caller's theme", () => {
    const hi = "Doston aaj main aapko ek trick bataunga jo aapki life badal degi. Yeh video end tak dekhna kyunki last mein surprise hai. Maine yeh phone pichle mahine liya tha aur battery bahut achhi hai. Agar aapko yeh content pasand aaya to like karo share karo aur channel ko subscribe karna mat bhoolna. Chalo aaj Delhi ki famous chaat try karte hain."
      .split(" ").map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 350 }));
    const p = planTracks({ transcript: hi, theme: "bollywood-masala" });
    expect(p.theme).toBe("bollywood-masala");
    const cta = p.tracks.find((t) => t.slot === "cta")!;
    expect(hi.slice((cta.words as number[])[0], (cta.words as number[])[1]).map((w) => w.text).join(" ")).toMatch(/^Agar .* bhoolna\.$/);
    expect(() => buildCaptions({ words: hi, theme: p.theme, tracks: p.tracks })).not.toThrow();
  });
  it("needs timed words", () => {
    expect(err(() => planTracks({ transcript: [] })).code).toBe("BAD_ARGS");
  });
});

describe("CLI + MCP wiring", () => {
  const dir = mkdtempSync(join(tmpdir(), "ce-tracks-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it("--tracks replaces --look on build and caption; plan writes a plan file", () => {
    expect(parseArgs(["build", "--words", "w.json", "--tracks", "plan.json"])).toMatchObject({ cmd: "build", tracks: "plan.json" });
    expect(parseArgs(["build", "--words", "w.json", "--tracks", "plan.json"])).not.toHaveProperty("look");
    expect(parseArgs(["clip.mp4", "--tracks", "plan.json"])).toMatchObject({ cmd: "caption", video: "clip.mp4", tracks: "plan.json" });
    expect(() => parseArgs(["build", "--words", "w.json"])).toThrow(/--tracks/);
    expect(parseArgs(["plan", "--words", "w.json", "--platform", "Reels", "--out", "p.json"])).toMatchObject({ cmd: "plan", words: "w.json", platform: "reels", out: "p.json" });
  });
  it("MCP plan_tracks -> build_captions({ tracks })", async () => {
    const call = async (name: string, args: object) => {
      const r = (await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as { result: { content: { text: string }[]; isError?: boolean } };
      return { data: JSON.parse(r.result.content[0]!.text), isError: r.result.isError };
    };
    const plan = await call("plan_tracks", { words: WORDS, platform: "reels" });
    expect(plan.isError).toBeUndefined();
    const out = join(dir, "props.json");
    const built = await call("build_captions", { words: WORDS, theme: plan.data.theme, tracks: plan.data.tracks, out });
    expect(built.data.tracks.map((t: { slot: string }) => t.slot)).toEqual(["hook", "body", "stamp"]);
    const clash = await call("build_captions", { words: WORDS, tracks: [{ look: 12, words: [0, 5] }, { look: 13, words: [3, 8] }] });
    expect(clash.isError).toBe(true);
    expect(clash.data.error.code).toBe("BAD_TRACKS");
    writeFileSync(join(dir, "w.json"), JSON.stringify({ words: WORDS }));
    expect((await call("plan_tracks", { words_file: join(dir, "w.json") })).data.tracks.length).toBeGreaterThan(1);
  });
});

describe("transcript language detection (recommendLooks v2)", () => {
  it("plain English is never Hinglish, even full of to/so/me/the/main/do", () => {
    for (const t of [
      TEXT,
      "So I told him to do it and he said no, so we went home to the main street with me",
      "So we welcome people from all over the world to edit, specifically on those topics, but not just that, but to learn how to edit.",
      "Hi there, the main thing is to keep it simple, so do the work and ship it",
    ]) expect(analyzeTranscript(t).hinglish, t).toBe(false);
  });
  it("romanized Hindi and code-mixed Hinglish are", () => {
    for (const t of [
      "Doston aaj main aapko ek aisi trick bataane vaala hoon jo aapki life badal degi",
      "bhai ye video dekho aur subscribe karo kyunki main sab bataunga",
      "so guys today main aapko dikhaunga how to edit videos, bahut easy hai",
      "Agar aapko yeh content pasand aaya to like karo share karo",
    ]) expect(analyzeTranscript(t).hinglish, t).toBe(true);
  });
});

describe("themes keep a look's display weight", () => {
  it("no theme makes a look's text or key-word face draw lighter", () => {
    for (const l of listLooks()) {
      const look = resolveLook(l.number);
      const s = applyLook(look).style;
      for (const t of listThemes()) {
        const o = themeOverrides(look, t).overrides;
        const font = (o.fontId as string | undefined) ?? s.fontId;
        const weight = (o.fontWeight as number | undefined) ?? s.fontWeight;
        if (o.fontId) {
          expect(getFontEntry(font)?.weights, `${l.id} + ${t.id}`).toContain(weight);
          expect(visualWeight(font, weight), `${l.id} + ${t.id}: ${s.fontId} ${s.fontWeight} -> ${font} ${weight}`).toBeGreaterThanOrEqual(visualWeight(s.fontId, s.fontWeight) - 100);
        }
        if (o["hero.fontId"] && s.hero.fontId) {
          const hw = s.hero.fontWeight ?? s.fontWeight;
          expect(visualWeight(o["hero.fontId"] as string, hw), `${l.id} + ${t.id} key word`).toBeGreaterThanOrEqual(visualWeight(s.hero.fontId, hw) - 100);
        }
      }
    }
  });
  it("heavy single-weight display faces (Anton, Bebas Neue ...) keep their character", () => {
    const stamp = resolveLook(26); // Orange Stamp Word: Anton key word
    expect(applyLook(stamp).style.hero.fontId).toBe("Anton");
    for (const t of listThemes()) expect(themeOverrides(stamp, t).overrides["hero.fontId"], t.id).toBeUndefined();
  });
});
