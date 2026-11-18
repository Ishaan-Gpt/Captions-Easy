/** 0.2.0 composition features: themes, word roles, custom looks, look metadata, recommendLooks v2, wiring. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseArgs } from "../src/args";
import { buildCaptions } from "../src/captions";
import { describeAnyLook as describeLook, listAllLooks } from "../src/catalog";
import { deriveLook, listCustomLooks, loadLooksFile, registerLook, saveLooksFile, unregisterLook } from "../src/custom";
import type { CaptionsEasyError } from "../src/errors";
import { listLooks } from "../src/looks";
import { FORMALITIES, MOODS, SCRIPTS, SUITS } from "../src/meta";
import { contrast } from "../src/palette";
import { analyzeTranscript, recommendLooks } from "../src/recommend";
import { assignWordRoles } from "../src/roles";
import { describeTheme, listThemes, validateTheme } from "../src/themes";
import { handle } from "../src/mcp";
import { getLook } from "@capseasy/templates";

const err = (f: () => unknown): CaptionsEasyError => {
  try {
    f();
  } catch (e) {
    return e as CaptionsEasyError;
  }
  throw new Error("expected an error");
};
const WORDS = 'So in 2024 Priya built a REALLY simple app and it made 10,000 dollars in one month. Wow!'.split(" ").map((text, i) => ({ text, startMs: i * 360, endMs: i * 360 + 320 }));
const gallery = listLooks();

describe("themes", () => {
  it("ships 10 distinct, valid named themes", () => {
    const themes = listThemes();
    expect(themes.length).toBe(10);
    expect(new Set(themes.map((t) => t.id)).size).toBe(10);
    expect(new Set(themes.map((t) => t.palette.accent)).size).toBe(10);
    for (const t of themes) expect(validateTheme({ ...t, extends: undefined })).toMatchObject({ id: t.id, palette: t.palette, fonts: t.fonts });
    expect(themes.find((t) => t.id === "bollywood-masala")!.scripts).toContain("devanagari");
    expect(describeTheme("tech-cyan").tokens["palette.accent"]).toMatch(/active.color/);
  });

  it("applies to every look, only through controls the look honours without switching anything on", () => {
    for (const l of gallery) {
      const controls = new Map(describeLook(l.number).controls.map((c) => [c.key, c]));
      for (const t of listThemes()) {
        const d = describeLook(l.number, { theme: t.id });
        for (const a of d.theme!.applied) {
          expect(controls.has(a.key), `${l.id} + ${t.id}: ${a.key}`).toBe(true);
          expect(controls.get(a.key)!.dependsOn, `${l.id} + ${t.id}: ${a.key}`).toBeUndefined();
        }
        const p = buildCaptions({ words: WORDS.slice(0, 4), look: l.number, theme: t.id });
        expect(p.theme).toEqual({ id: t.id, name: t.name, applied: d.theme!.applied.map((a) => a.key) });
      }
    }
  }, 120_000);

  it("keeps text readable on themed plates and keeps polarity", () => {
    for (const t of listThemes()) {
      const p = buildCaptions({ words: WORDS.slice(0, 3), look: 81, theme: t.id }); // karaoke pill: text on a plate
      const s = p.style as unknown as { fill: { color: string }; background: { color: string } };
      expect(contrast(s.fill.color, s.background.color), t.id).toBeGreaterThanOrEqual(3);
    }
    const plate = buildCaptions({ words: WORDS.slice(0, 3), look: 22, theme: "neon-night" }).style as unknown as { fill: { color: string } };
    expect(plate.fill.color).toBe("#07050D"); // cream strip: dark text stays dark
  });

  it("caller overrides win over the theme; custom themes are validated", () => {
    const p = buildCaptions({ words: WORDS.slice(0, 3), look: 12, theme: "creator-yellow", overrides: { "active.boxColor": "#123456" } });
    expect((p.style.active as { boxColor: string }).boxColor).toBe("#123456");
    const custom = { id: "my-brand", extends: "clean-corporate", palette: { accent: "#ff3366" } };
    expect(buildCaptions({ words: WORDS.slice(0, 3), look: 12, theme: custom }).style.active).toMatchObject({ boxColor: "#FF3366" });
    expect(err(() => buildCaptions({ words: WORDS, look: 12, theme: "nope" })).code).toBe("BAD_THEME");
    expect(err(() => validateTheme({ id: "x", palette: { accent: "red" } })).message).toMatch(/hex/);
    expect(err(() => validateTheme({ id: "x", fonts: { display: "Comic Sans" } })).message).toMatch(/bundled font/);
    expect(err(() => validateTheme({ id: "Bad Id" })).code).toBe("BAD_THEME");
  });
});

describe("word roles", () => {
  it("are off unless asked for", () => {
    const p = buildCaptions({ words: WORDS, look: 12 });
    expect(p.roles).toBeUndefined();
    expect(p.doc.words.some((w) => "role" in w || "scale" in w || "entry" in w)).toBe(false);
  });

  it("auto roles compile to the levers the look honours", () => {
    const p = buildCaptions({ words: WORDS, look: 12, roles: "auto" });
    const by = (t: string) => p.doc.words.find((w) => w.text === t) as unknown as Record<string, unknown>;
    expect(p.roles!.levers).toEqual({ emphasis: true, color: true, size: true, entry: true });
    expect(by("in")).toMatchObject({ role: "connector", scale: 0.78 });
    expect(by("2024")).toMatchObject({ role: "number", emphasis: "hero", entry: "pop" });
    expect(by("Priya")).toMatchObject({ role: "name" });
    expect(by("REALLY")).toMatchObject({ role: "emphasis", emphasis: "hero" });
    expect(p.roles!.counts.number).toBe(3);
    // a composed lockup ignores per-word effects: roles are recorded, nothing else, and the caller is told
    const lockup = buildCaptions({ words: WORDS, look: 33, roles: "auto" });
    expect(lockup.doc.words.every((w) => !("scale" in w) && !("color" in w) && !("emphasis" in w))).toBe(true);
    expect(lockup.warnings.join(" ")).toMatch(/stamps/);
  });

  it("keyword-only stamps hide every other word", () => {
    const p = buildCaptions({ words: WORDS, look: 109, stamps: true });
    const shown = p.doc.words.filter((w) => !(w as { hidden?: boolean }).hidden).map((w) => w.text);
    expect(shown).toEqual(expect.arrayContaining(["2024", "10,000", "one"]));
    expect(shown).not.toContain("in");
    expect(buildCaptions({ words: WORDS, look: 109, stamps: ["name"] }).doc.words.filter((w) => !(w as { hidden?: boolean }).hidden).map((w) => w.text)).toEqual(["Priya"]);
  });

  it("explicit roles (array, map, words[].role) and role maps", () => {
    const arr = buildCaptions({ words: WORDS.slice(0, 3), look: 105, roles: ["title", null, "key"] });
    expect(arr.doc.words.map((w) => (w as { role?: string }).role)).toEqual(["title", undefined, "key"]);
    const map = buildCaptions({ words: WORDS.slice(0, 3), look: 105, roles: { "1": "name" } });
    expect(map.doc.words.map((w) => (w as { role?: string }).role)).toEqual([undefined, "name", undefined]);
    const own = buildCaptions({ words: [{ ...WORDS[0]!, role: "emphasis" }, WORDS[1]!], look: 105, roles: "explicit" });
    expect(own.doc.words.map((w) => (w as { role?: string }).role)).toEqual(["emphasis", undefined]);
    const rm = buildCaptions({ words: WORDS, look: 12, roles: "auto", roleMap: { connector: { size: "xs" } } });
    expect(rm.doc.words.find((w) => w.text === "in")).toMatchObject({ scale: 0.6 });
    expect(err(() => buildCaptions({ words: WORDS, look: 12, roles: ["boss"] as never })).code).toBe("BAD_ARGS");
    expect(err(() => buildCaptions({ words: WORDS, look: 12, roles: "auto", roleMap: { key: { size: "huge" } } as never })).code).toBe("BAD_ARGS");
    expect(err(() => buildCaptions({ words: WORDS, look: 12, roleMap: {} })).code).toBe("BAD_ARGS");
  });

  it("assignWordRoles is deterministic", () => {
    expect(assignWordRoles(WORDS)).toEqual(assignWordRoles(WORDS));
    expect(assignWordRoles(WORDS)[2]).toBe("number");
  });
});

describe("custom looks", () => {
  const dir = mkdtempSync(join(tmpdir(), "ce-looks-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("derive -> stable id, validated, changed controls, plain JSON", () => {
    const a = deriveLook(12, { "active.boxColor": "#FF3366", fontSize: "80" }, { name: "Brand Box" });
    const b = deriveLook("hormozi_box", { fontSize: 80, active: { boxColor: "#FF3366" } }, { name: "Brand Box" });
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^custom:brand-box-[0-9a-z]{7}$/);
    expect(a.number).toBeUndefined();
    expect(a).toMatchObject({ kind: "custom", baseNumber: 12, baseId: "hormozi_box", overrides: { "active.boxColor": "#FF3366", fontSize: 80 } });
    expect(a.changed).toEqual(expect.arrayContaining([{ key: "fontSize", from: 58, to: 80 }]));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(deriveLook(12, { fontSize: 81 }, { name: "Brand Box" }).id).not.toBe(a.id);
    expect(deriveLook(12, { "active.boxColor": "#FF3366", fontSize: 80 }, { name: "Brand Box", theme: "luxe-gold" }).id).not.toBe(a.id);
    expect(err(() => deriveLook(118, { wobble: 1 }, { name: "x" })).code).toBe("BAD_OVERRIDE");
    expect(err(() => deriveLook(12, {}, { name: "" })).code).toBe("BAD_OVERRIDE");
  });

  it("registers, lists, describes and builds by id", () => {
    const c = registerLook(deriveLook(12, { "active.boxColor": "#FF3366" }, { name: "Pink Box", theme: "tech-cyan", settings: { maxWordsPerCard: 2 } }));
    expect(listCustomLooks().map((x) => x.id)).toContain(c.id);
    expect(listAllLooks().some((l) => l.id === c.id)).toBe(false);
    expect(listAllLooks({ includeCustom: true }).find((l) => l.id === c.id)).toMatchObject({ kind: "custom", section: "custom", baseNumber: 12 });
    const d = describeLook(c.id) as ReturnType<typeof describeLook> & { kind: string; custom: { changed: { key: string }[] } };
    expect(d.kind).toBe("custom");
    expect(d.custom.changed.map((x) => x.key)).toContain("active.boxColor");
    expect(d.defaults["active.boxColor"]).toBe("#FF3366");
    const p = buildCaptions({ words: WORDS, look: c.id });
    expect(p.look).toEqual({ number: 12, id: c.id, name: "Pink Box", custom: true, baseNumber: 12 });
    expect(p.settings.maxWordsPerCard).toBe(2);
    expect(p.theme?.id).toBe("tech-cyan");
    expect(buildCaptions({ words: WORDS, look: c }).style).toEqual(p.style);
    // deriving from a custom look folds it into the base
    const child = deriveLook(c, { fontSize: 70 }, { name: "Pink Box Small" });
    expect(child).toMatchObject({ baseNumber: 12, overrides: { "active.boxColor": "#FF3366", fontSize: 70 }, theme: "tech-cyan" });
    expect(unregisterLook(c.id)).toBe(true);
    expect(err(() => buildCaptions({ words: WORDS, look: c.id })).code).toBe("UNKNOWN_LOOK");
  });

  it("saves and loads a looks file", () => {
    const file = join(dir, "custom-looks.json");
    const c = deriveLook(105, { "position.y": 0.8 }, { name: "Low Subs" });
    saveLooksFile(file, [c]);
    saveLooksFile(file, [c]); // same id replaces
    unregisterLook(c.id);
    expect(loadLooksFile(file).map((x) => x.id)).toEqual([c.id]);
    expect(buildCaptions({ words: WORDS, look: c.id }).style.position).toMatchObject({ y: 0.8 });
  });
});

describe("look metadata", () => {
  it("every gallery look has mood, formality, suits, scripts and honest pairs", () => {
    const numbers = new Set(gallery.map((l) => l.number));
    for (const l of gallery) {
      const g = describeLook(l.number).guide!;
      expect(MOODS).toContain(g.mood);
      expect(FORMALITIES).toContain(g.formality);
      expect(g.suits.length, l.id).toBeGreaterThanOrEqual(1);
      for (const s of g.suits) expect(SUITS).toContain(s);
      expect(g.scripts[0]).toBe("latin");
      for (const s of g.scripts) expect(SCRIPTS).toContain(s);
      expect(g.pairsWith.length, `${l.id} pairs`).toBeGreaterThanOrEqual(1);
      for (const n of [...g.pairsWith, ...g.avoidWith]) {
        expect(numbers.has(n), `${l.id} -> ${n}`).toBe(true);
        expect(n).not.toBe(l.number);
      }
      expect(g.pairsWith.filter((n) => g.avoidWith.includes(n))).toEqual([]);
      for (const n of g.pairsWith) expect(getLook(gallery.find((x) => x.number === n)!.id)!.templateId, `${l.id} pairs with its own template`).not.toBe(getLook(l.id)!.templateId);
      if (!g.complexScriptSafe) expect(g.scripts).toEqual(["latin"]);
    }
    // the letter-splitting looks never claim Devanagari
    expect(describeLook(1).guide!.complexScriptSafe).toBe(false);
  });
});

describe("recommendLooks v2", () => {
  const talk = "So here is the thing about building a startup. Most founders never talk about money. I made 10,000 dollars in my first month with this simple marketing trick and it is INSANE!".split(" ").map((text, i) => ({ text, startMs: i * 280, endMs: i * 280 + 250 }));

  it("reads the transcript", () => {
    const a = analyzeTranscript(talk);
    expect(a).toMatchObject({ pace: "fast", script: "latin", hinglish: false, content: expect.arrayContaining(["business-advice"]) });
    expect(analyzeTranscript("नमस्ते दोस्तों आज हम सीखेंगे").script).toBe("devanagari");
    expect(analyzeTranscript("bhai ye video dekho aur subscribe karo kyunki main sab bataunga").hinglish).toBe(true);
  });

  it("ranks deterministically with reasons, and carries mood and pairs", () => {
    const r = recommendLooks({ transcript: talk, brand: "clean-corporate", platform: "linkedin" });
    expect(r).toEqual(recommendLooks({ transcript: talk, brand: "clean-corporate", platform: "linkedin" }));
    expect(r.length).toBe(5);
    expect(r[0]!.reasons.join(" ")).toMatch(/transcript: .*words\/s/);
    expect(r[0]!.reasons.join(" ")).toMatch(/brand theme: clean-corporate/);
    expect(r[0]!.mood).toBeDefined();
    expect(Array.isArray(r[0]!.pairsWith)).toBe(true);
  });

  it("never ranks a letter-splitting look first for Devanagari, and says when nothing fits", () => {
    const r = recommendLooks({ transcript: "नमस्ते दोस्तों आज हम सीखेंगे कि पैसे कैसे बचाएं", limit: 10 });
    for (const x of r) expect(describeLook(x.number).guide!.complexScriptSafe, x.id).toBe(true);
    expect(r[0]!.reasons.join(" ")).toMatch(/weak fit overall/);
    const colours = recommendLooks({ brief: "podcast clip", brand: { colors: ["#FF3366"] }, limit: 3 });
    expect(colours[0]!.reasons).toContain("takes your brand colours");
    expect(err(() => recommendLooks({ brand: { colors: ["nope"] } })).code).toBe("BAD_ARGS");
  });
});

describe("languages + layout wiring", () => {
  it("settings.romanize writes Devanagari words in Roman letters (roles still align)", () => {
    const words = [{ text: "पहले", startMs: 0, endMs: 300 }, { text: "app", startMs: 300, endMs: 600 }];
    const p = buildCaptions({ words, look: 105, settings: { romanize: true }, roles: ["key", null] });
    expect(p.doc.words[0]!.text).toBe("pehle");
    expect((p.doc.words[0] as { role?: string }).role).toBe("key");
    expect(buildCaptions({ words, look: 105 }).doc.words[0]!.text).toBe("पहले");
  });

  it("settings.hinglishSpelling respells scholarly romanized Hindi, only when asked", () => {
    const words = "yah video dekho kyonki ham sab bataenge".split(" ").map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 280 }));
    const on = buildCaptions({ words, look: 105, settings: { hinglishSpelling: "creator" } }).doc.words.map((w) => w.text);
    expect(on).toContain("yeh");
    expect(on).toContain("kyunki");
    expect(buildCaptions({ words, look: 105 }).doc.words.map((w) => w.text)).toEqual(words.map((w) => w.text));
    expect(parseArgs(["build", "--words", "w", "--look", "1", "--hinglish-spelling", "creator"])).toMatchObject({ settings: { hinglishSpelling: "creator" } });
  });

  it("layout is validated and carried only when given", () => {
    expect("layout" in buildCaptions({ words: WORDS, look: 12 })).toBe(false);
    const p = buildCaptions({ words: WORDS, look: 12, layout: { safeZone: "tiktok", avoid: [{ x: 0.3, y: 0.1, w: 0.4, h: 0.3, label: "face" }] } });
    expect(p.layout).toMatchObject({ safeZone: "tiktok" });
    expect(err(() => buildCaptions({ words: WORDS, look: 12, layout: { safeZone: "myspace" } as never })).code).toBe("BAD_SETTINGS");
  });
});

describe("CLI + MCP", () => {
  it("parses the composition flags (only those given)", () => {
    expect(parseArgs(["build", "--words", "w.json", "--look", "12"])).toEqual({ cmd: "build", words: "w.json", look: "12", style: {}, settings: {}, out: undefined, json: false });
    expect(parseArgs(["build", "--words", "w.json", "--look", "12", "--theme", "neon-night", "--roles", "auto", "--stamps", "--romanize", "--safe-zone", "tiktok", "--avoid", '{"x":0,"y":0,"w":0.2,"h":0.2}', "--looks-file", "c.json"])).toMatchObject({
      cmd: "build", theme: "neon-night", roles: "auto", stamps: true, settings: { romanize: "true" }, layout: { safeZone: "tiktok", avoid: [{ x: 0, y: 0, w: 0.2, h: 0.2 }] }, looksFile: "c.json",
    });
    expect(parseArgs(["build", "--words", "w", "--look", "1", "--stamps=key,name"])).toMatchObject({ stamps: ["key", "name"] });
    expect(parseArgs(["derive", "12", "--name", "Brand Box", "--set", "fontSize=80", "--save", "c.json"])).toEqual({ cmd: "derive", base: "12", name: "Brand Box", style: { fontSize: "80" }, settings: {}, save: "c.json", json: false });
    expect(parseArgs(["themes"])).toEqual({ cmd: "themes", json: false });
    expect(parseArgs(["look", "12", "--theme", "luxe-gold"])).toEqual({ cmd: "look", ref: "12", theme: "luxe-gold", json: false });
    expect(parseArgs(["recommend", "--transcript", "t.json", "--brand", "tech-cyan", "--script", "auto"])).toMatchObject({ options: { transcript: "t.json", brand: "tech-cyan", script: "auto" } });
    expect(() => parseArgs(["build", "--words", "w", "--look", "1", "--roles", "maybe"])).toThrow(/--roles/);
  });

  it("MCP derive_look -> build_captions by id; themes and safe zones", async () => {
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as { result: { content: { text: string }[]; isError?: boolean } };
      return { isError: !!r.result.isError, data: JSON.parse(r.result.content[0]!.text) };
    };
    const d = await call("derive_look", { base: 12, name: "Agent Box", overrides: { "active.boxColor": "#00AAFF" } });
    expect(d.isError).toBe(false);
    const b = await call("build_captions", { look: d.data.id, words: WORDS.slice(0, 3), theme: "sport-red", roles: "auto" });
    expect(b.isError).toBe(false);
    expect(b.data.look.id).toBe(d.data.id);
    expect(b.data.style.active.boxColor).toBe("#00AAFF");
    expect(b.data.roles.counts).toBeDefined();
    expect((await call("list_themes", {})).data.length).toBe(10);
    expect((await call("describe_theme", { theme: "luxe-gold" })).data.fonts.display).toBe("Cinzel");
    expect((await call("safe_zones", {})).data.length).toBeGreaterThan(20);
    expect((await call("describe_look", { look: 12, theme: "neon-night" })).data.theme.id).toBe("neon-night");
    expect((await call("recommend_looks", { transcript: "we grew revenue five times", limit: 2 })).data.length).toBe(2);
    unregisterLook(d.data.id);
  });
});
