import { describe, expect, it } from "vitest";
import { devanagariFontFor, lookScripts, romanize, romanizeTranscript } from "../src/lang";
import { safeZoneTable, solvePlacement, validateLayout } from "../src/safety";
import { buildCaptions } from "../src/captions";

describe("lang (standalone module)", () => {
  it("romanizes text and transcripts, keeping timings and Latin words", () => {
    expect(romanize("पहले हम ऐसे चलते थे")).toBe("pehle hum aise chalte the");
    const words = [
      { text: "Hello", startMs: 0, endMs: 200 },
      { text: "दोस्तों", startMs: 200, endMs: 600 },
      { text: "क्या", startMs: 600, endMs: 800 },
    ];
    const out = romanizeTranscript(words);
    expect(out.map((w) => w.text)).toEqual(["Hello", "doston", "kya"]);
    expect(out[0]).toBe(words[0]);
    expect(out[1]).toMatchObject({ startMs: 200, endMs: 600 });
    const latin = [{ text: "hi", startMs: 0, endMs: 1 }];
    expect(romanizeTranscript(latin)).toBe(latin);
  });

  it("async hook on a transcript", async () => {
    const out = await romanizeTranscript([{ text: "यार", startMs: 0, endMs: 1 }], { callback: async () => "yaaar" });
    expect(out[0]!.text).toBe("yaaar");
  });

  it("reports script support per look and the partner fonts", () => {
    const s = lookScripts(1);
    expect(s.look.number).toBe(1);
    expect(s.native).toContain("latin");
    expect(devanagariFontFor("Poppins")).toBe("Poppins");
    expect(devanagariFontFor("Anton")).toBe("Mukta");
  });
});

describe("safety (standalone module)", () => {
  it("validates layout options with clear errors", () => {
    expect(validateLayout({ safeZone: "tiktok", avoid: [{ x: 0.2, y: 0.3, w: 0.4, h: 0.3, label: "face" }] }).avoid).toHaveLength(1);
    expect(() => validateLayout({ safeZone: "myspace" })).toThrow(/layout/);
    expect(() => validateLayout({ avoid: [{ x: 0.8, y: 0, w: 0.5, h: 0.1 }] })).toThrow(/past the frame/);
    expect(() => validateLayout({ avoid: [{ x: 0, y: 0, w: 0.1, h: 0.1, fromMs: 500, toMs: 100 }] })).toThrow(/toMs/);
    expect(() => validateLayout({ band: { top: 0.8, bottom: 0.2 } })).toThrow(/band/);
  });

  it("table covers 2 profiles x 5 platforms x 4 aspects", () => {
    const rows = safeZoneTable();
    expect(rows).toHaveLength(40);
    expect(rows.filter((r) => r.native && r.profile === "organic")).toHaveLength(5);
  });

  it("solver is exposed", () => {
    expect(solvePlacement({ size: { w: 0.5, h: 0.1 }, center: { x: 0.5, y: 0.7 } }).moved).toBe(false);
  });

  it("buildCaptions output is unchanged by these modules (no new keys)", () => {
    const props = buildCaptions({ words: [{ text: "hello", startMs: 0, endMs: 400 }], look: 1 });
    expect(Object.keys(props).sort()).not.toContain("layout");
  });
});

describe("Devanagari-unsafe looks: one source of truth (0.2.0 release)", () => {
  it("lookScripts and describeLook agree for every gallery look", async () => {
    const { listLooks, describeLook } = await import("../src/looks");
    const unsafe: string[] = [];
    for (const l of listLooks()) {
      const g = describeLook(l.number).guide!;
      const s = lookScripts(l.number);
      expect(s.unsupported.includes("devanagari"), l.id).toBe(!g.complexScriptSafe);
      if (!g.complexScriptSafe) unsafe.push(l.id);
    }
    for (const id of ["difference_invert", "cinematic_track_in", "letter_cascade", "editorial_3d_stack", "ransom_cutouts", "terminal"]) {
      if (listLooks().some((l) => l.id === id)) expect(unsafe, id).toContain(id);
    }
  });
});
