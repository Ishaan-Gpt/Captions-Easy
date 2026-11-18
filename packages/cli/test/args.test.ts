import { describe, expect, it } from "vitest";
import { parseArgs, parseSets } from "../src/args";

describe("parseArgs", () => {
  it("parses looks / look / transcribe / mcp / help / version", () => {
    expect(parseArgs(["looks", "bold", "neon", "--json"])).toEqual({ cmd: "looks", query: "bold neon", tags: [], section: undefined, json: true });
    expect(parseArgs(["look", "118"])).toEqual({ cmd: "look", ref: "118", json: false });
    expect(parseArgs(["transcribe", "a.mp4", "--language", "hi", "--out", "w.json"])).toEqual({ cmd: "transcribe", video: "a.mp4", language: "hinglish", out: "w.json", json: false });
    expect(parseArgs(["mcp"])).toEqual({ cmd: "mcp" });
    expect(parseArgs([])).toEqual({ cmd: "help", topic: undefined });
    expect(parseArgs(["--version"])).toEqual({ cmd: "version" });
  });

  it("parses a caption run", () => {
    const c = parseArgs(["talk.mp4", "--look", "12", "--set", "active.color=#FF3366", "--set=maxWordsPerCard=2", "--format", "webm", "-o", "out.webm", "--json"]);
    expect(c).toEqual({
      cmd: "caption",
      video: "talk.mp4",
      look: "12",
      words: undefined,
      language: "en",
      style: { "active.color": "#FF3366" },
      settings: { maxWordsPerCard: "2" },
      overlay: true,
      format: "webm",
      out: "out.webm",
      concurrency: undefined,
      json: true,
    });
    expect(parseArgs(["caption", "v.mov", "-l", "hormozi_box", "--words", "w.json"])).toMatchObject({ cmd: "caption", video: "v.mov", look: "hormozi_box", words: "w.json", overlay: false });
  });

  it("explains mistakes", () => {
    expect(() => parseArgs(["talk.mp4"])).toThrow(/--look/);
    expect(() => parseArgs(["talk.mp4", "--look"])).toThrow(/needs a value/);
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--bogus"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--set", "nokey"])).toThrow(/key=value/);
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--format", "avi"])).toThrow(/mov, webm or png-sequence/);
    const png = parseArgs(["talk.mp4", "--look", "1", "--format", "png-sequence", "-o", "frames"]);
    expect(png).toMatchObject({ cmd: "caption", overlay: true, format: "png-sequence", out: "frames" });
    expect(parseArgs(["talk.mp4", "--look", "1", "--format", "PNG-SEQUENCE"])).toMatchObject({ format: "png-sequence", overlay: true });
    expect(() => parseArgs(["talk.mp4", "--look", "1", "--concurrency", "0"])).toThrow(/concurrency/);
    expect(() => parseArgs(["transcribe", "a.mp4", "--language", "fr"])).toThrow(/language/);
  });

  it("routes --set keys to style or pacing settings", () => {
    expect(parseSets(["fontSize=80", "settings.holdMs=200", "pauseMs=300", "style.glow.enabled=true", "active.color=#F00=x"])).toEqual({
      style: { fontSize: "80", "glow.enabled": "true", "active.color": "#F00=x" },
      settings: { holdMs: "200", pauseMs: "300" },
    });
  });
});

describe("render add-on version guard (0.2.0)", () => {
  it("compares versions and refuses 0.2.0-only options on an old render add-on", async () => {
    const { atLeast, guardRender } = await import("../src/addons");
    expect(atLeast("0.1.1", "0.2.0")).toBe(false);
    expect(atLeast("0.2.0", "0.2.0")).toBe(true);
    expect(atLeast("1.0.0", "0.2.0")).toBe(true);
    expect(atLeast(undefined, "0.2.0")).toBe(false);
    const calls: unknown[] = [];
    const old = guardRender({ render: async (o: unknown) => (calls.push(o), {} as never) });
    await old.render({ video: "v.mp4", look: 12 });
    expect(calls.length).toBe(1); // 0.1.x options pass through untouched
    await expect(old.render({ video: "v.mp4", look: 12, theme: "earthy-film" })).rejects.toMatchObject({ code: "ADDON_MISSING", details: { install: "npm i captionseasy-render@^0.2.0" } });
    await expect(old.render({ video: "v.mp4", look: 12, mode: "overlay", overlayFormat: "png-sequence" })).rejects.toMatchObject({ code: "ADDON_MISSING" });
    const fresh = guardRender({ version: "0.2.0", render: async (o: unknown) => (calls.push(o), {} as never) } as never);
    await fresh.render({ video: "v.mp4", look: 12, theme: "earthy-film" });
    expect(calls.length).toBe(2);
  });
});
