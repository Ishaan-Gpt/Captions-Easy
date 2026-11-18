import { describe, expect, it } from "vitest";
import { CONTENT_TYPES, GUIDE, PACES, PLATFORMS, QUALITY, TONES } from "../src/guide";
import { describeLook, listLooks } from "../src/looks";
import { handle } from "../src/mcp";
import { parseArgs } from "../src/args";
import { parseWanted, recommendLooks } from "../src/recommend";

const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("look guide", () => {
  it("every gallery look has a complete, valid card from the fixed vocabularies", () => {
    const looks = listLooks();
    expect(looks.length).toBe(105);
    for (const l of looks) {
      const g = describeLook(l.id).guide;
      expect(g, l.id).toBeDefined();
      expect(g!.summary.length, `${l.id} summary`).toBeGreaterThan(20);
      expect(g!.summary.length, `${l.id} summary`).toBeLessThanOrEqual(120);
      expect(g!.usage.length, `${l.id} usage`).toBeGreaterThan(30);
      expect([1, 2, 3, 4, 5]).toContain(g!.energy);
      expect(g!.bestFor.length, `${l.id} bestFor`).toBeGreaterThanOrEqual(2);
      expect(g!.tone.length, `${l.id} tone`).toBeGreaterThanOrEqual(1);
      expect(g!.tone.length, `${l.id} tone`).toBeLessThanOrEqual(3);
      expect(g!.pace.length).toBeGreaterThanOrEqual(1);
      expect(g!.platforms.length).toBeGreaterThanOrEqual(1);
      for (const c of [...g!.bestFor, ...g!.avoidFor]) expect(CONTENT_TYPES, `${l.id}: ${c}`).toContain(c);
      for (const t of g!.tone) expect(TONES, `${l.id}: ${t}`).toContain(t);
      for (const p of g!.pace) expect(PACES).toContain(p);
      for (const p of g!.platforms) expect(PLATFORMS).toContain(p);
      expect(g!.bestFor.filter((c) => g!.avoidFor.includes(c)), `${l.id} best/avoid overlap`).toEqual([]);
      for (const k of ["worksOnBusy", "worksOnBright", "worksOnDark", "needsVideoBehind"] as const) expect(typeof g!.footage[k]).toBe("boolean");
      expect(g!.wordsPerCard).toBe(l.wordsPerCard);
      // listLooks carries the compact form
      expect(l.guide).toEqual({ summary: g!.summary, energy: g!.energy, tone: g!.tone, bestFor: g!.bestFor });
    }
  });

  it("has no cards or ratings for looks that are not in the gallery", () => {
    const gallery = new Set(ids(listLooks()));
    expect(Object.keys(GUIDE).filter((id) => !gallery.has(id))).toEqual([]);
    expect(Object.keys(QUALITY).filter((id) => !gallery.has(id))).toEqual([]);
  });

  it("cards are discriminating, not 'great for everything'", () => {
    const cards = Object.values(GUIDE);
    // every content type is somebody's best fit, and the energy scale is actually used
    for (const c of CONTENT_TYPES) expect(cards.some((g) => g.bestFor.includes(c)), c).toBe(true);
    for (const e of [1, 2, 3, 4, 5]) expect(cards.some((g) => g.energy === e), `energy ${e}`).toBe(true);
    expect(cards.filter((g) => g.footage.worksOnBusy && g.footage.worksOnBright && g.footage.worksOnDark).length).toBeLessThan(cards.length / 2);
    expect(new Set(cards.map((g) => g.summary)).size).toBe(cards.length);
  });

  it("only the video-made looks need video behind them", () => {
    expect(ids(listLooks()).filter((id) => GUIDE[id]!.footage.needsVideoBehind).sort()).toEqual(["difference_invert", "knockout_word", "moovi_caption_3"]);
  });

  it("carries the tier ratings", () => {
    expect(describeLook(12).guide!.quality).toEqual({ tier: "goated", score: 10 });
    expect(describeLook("terminal").guide!.quality!.tier).toBe("low");
    expect(describeLook(118).guide!.quality).toBeUndefined(); // newer than the tier list
  });
});

describe("recommendLooks", () => {
  it("calm luxury brand ad on clean footage: elegant/premium looks above hype boxes", () => {
    const all = recommendLooks({ query: "calm luxury brand ad, clean footage", limit: 105 });
    const top = all.slice(0, 5);
    for (const r of top) {
      const g = GUIDE[r.id]!;
      expect(g.tone.some((t) => t === "elegant" || t === "premium"), r.id).toBe(true);
      expect(g.energy).toBeLessThanOrEqual(3);
    }
    const rank = (id: string) => ids(all).indexOf(id);
    for (const hype of ["hormozi_box", "solid_label_card", "red_plate_ticker", "beast_bounce"]) expect(rank(hype)).toBeGreaterThan(rank("luxe_serif"));
    expect(ids(top)).toContain("light_slit_reveal");
  });

  it("gaming hype ranks energetic looks", () => {
    const top = recommendLooks({ query: "gaming hype" });
    expect(top.length).toBe(5);
    for (const r of top) expect(GUIDE[r.id]!.energy, r.id).toBeGreaterThanOrEqual(4);
    for (const r of top) expect(GUIDE[r.id]!.bestFor).toContain("gaming");
  });

  it("podcast on busy footage returns readable looks with reasons", () => {
    const top = recommendLooks({ content: "podcast-clip", footage: "busy" });
    for (const r of top) {
      expect(GUIDE[r.id]!.footage.worksOnBusy, r.id).toBe(true);
      expect(r.reasons).toContain("best for podcast-clip");
      expect(r.summary && r.usage && r.number && r.name).toBeTruthy();
    }
  });

  it("overlay mode never returns looks made from the video", () => {
    for (const content of CONTENT_TYPES) {
      const r = recommendLooks({ content, mode: "overlay", limit: 105 });
      expect(ids(r)).not.toContain("difference_invert");
      expect(ids(r)).not.toContain("knockout_word");
    }
    expect(ids(recommendLooks({ content: "music-lyrics", tone: "edgy", limit: 10 }))).toContain("knockout_word");
  });

  it("linkedin + business prefers clean, professional looks", () => {
    const top = recommendLooks({ content: "business-advice", platform: "linkedin", tone: "clean" });
    for (const r of top) expect(GUIDE[r.id]!.platforms, r.id).toContain("linkedin");
  });

  it("is deterministic and honours limit", () => {
    const a = recommendLooks({ query: "fitness gym edit", limit: 7 });
    expect(a).toEqual(recommendLooks({ query: "fitness gym edit", limit: 7 }));
    expect(a.length).toBe(7);
    expect(recommendLooks().length).toBe(5);
  });

  it("understands synonyms and rejects unknown vocabulary", () => {
    expect(parseWanted({ content: "podcast" }).content).toEqual(["podcast-clip"]);
    expect(parseWanted({ query: "real estate tour on bright footage for linkedin" })).toMatchObject({ content: ["real-estate"], footage: "bright", platform: "linkedin" });
    expect(parseWanted({ mood: "hype" })).toMatchObject({ tones: ["bold"], energy: 5 });
    expect(parseWanted({ query: "high-energy gym edit over busy footage" })).toMatchObject({ content: ["fitness"], energy: 5, footage: "busy" });
    expect(() => recommendLooks({ content: "knitting" })).toThrow(/Unknown content/);
    expect(() => recommendLooks({ tone: "wobbly" })).toThrow(/Unknown tone/);
    expect(() => recommendLooks({ energy: 9 })).toThrow(/energy/);
  });
});

describe("recommend surfaces", () => {
  it("CLI args parse into options", () => {
    expect(parseArgs(["recommend", "--content", "podcast-clip", "--tone", "bold,clean", "--footage", "busy", "--json"])).toEqual({
      cmd: "recommend",
      options: { content: ["podcast-clip"], tone: ["bold", "clean"], footage: "busy" },
      json: true,
    });
    expect(parseArgs(["recommend", "calm", "perfume", "ad", "--overlay", "--limit", "3"])).toMatchObject({ options: { query: "calm perfume ad", mode: "overlay", limit: 3 } });
  });

  it("MCP lists and runs recommend_looks", async () => {
    const list = (await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string; description: string }[] } };
    const tool = list.result.tools.find((t) => t.name === "recommend_looks");
    expect(tool).toBeDefined();
    expect(tool!.description).toMatch(/describe_look/);
    const r = (await handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "recommend_looks", arguments: { content: "gaming", energy: 5, mode: "overlay", limit: 3 } } })) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    expect(r.result.isError).toBeFalsy();
    const data = JSON.parse(r.result.content[0]!.text) as { id: string; reasons: string[] }[];
    expect(data.length).toBe(3);
    expect(data[0]!.reasons.length).toBeGreaterThan(0);
    const bad = (await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "recommend_looks", arguments: { content: "knitting" } } })) as { result: { isError?: boolean } };
    expect(bad.result.isError).toBe(true);
  });
});

describe("docs", () => {
  it("the README look table is generated from the guide (run scripts/guide-table.ts)", async () => {
    const { readFileSync } = await import("node:fs");
    const { README, withTable } = await import("../scripts/guide-table");
    const now = readFileSync(README, "utf8");
    expect(withTable(now)).toBe(now);
  });
});
