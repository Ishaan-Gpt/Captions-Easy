/**
 * Letter-animator QA: renders a look frame by frame with the settings used for the After Effects reference renders
 * (one card "STOP SCROLLING", Arial Bold 120 px on 1080x1920, 30 fps, white on #141414), so the two can be compared
 * frame for frame. Plays at After Effects' own speed (LETTER_AE_MS), not the faster studio default.
 *   tsx scripts/letter-compare.ts --out <dir> --filter letter-spin,letter-burst [--frames 30] [--font Arial] [--track 0.2,0.4]
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { CaptionDocSchema } from "@capseasy/shared";
import { LETTER_AE_MS, LETTER_ANIMATORS, resolveStyle } from "@capseasy/templates";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const outDir = resolve(arg("out", "./out-letters")!);
const ids = (arg("filter") ?? "").split(",").filter(Boolean);
const FRAMES = Number(arg("frames", "30"));
const font = arg("font", "Arial")!;
const tracks = (arg("track") ?? "").split(",").filter(Boolean).map(Number);
const W = 1080;
const H = 1920;

const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w0", text: "STOP", startMs: 0, endMs: 400 },
    { id: "w1", text: "SCROLLING", startMs: 400, endMs: 2400 },
  ],
});

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve("src/entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome");
try {
  for (const type of LETTER_ANIMATORS.filter((t) => !ids.length || ids.includes(t))) for (const track of tracks.length ? tracks : [NaN]) {
    const tag = Number.isNaN(track) ? type : `${type}@${track}`;
    const style = resolveStyle({
      templateId: "sentence_clean", fontId: font, fontWeight: 700, fontSize: 120, casing: "none", shadows: [], letterSpacing: 0,
      fill: { type: "solid", color: "#FFFFFF" }, inactiveOpacity: 1, active: { effect: "none", color: "#FFFFFF", scale: 1, boxRadius: 12 },
      entrance: { type, durationMs: LETTER_AE_MS, stagger: "char", easing: "linear" }, exit: { type: "none", durationMs: 0 },
      templateOptions: { reveal: "all", ...(Number.isNaN(track) ? {} : { letterTrackEm: track }) },
      maxWidth: 1, safeBox: { top: 0, bottom: 0, left: 0, right: 0 }, position: { x: 0.5, y: 0.5 },
    });
    const inputProps = { src: null, media: { width: W, height: H, fps: 30, durationMs: 2500, rotation: 0 }, doc, style, settings: { maxWordsPerCard: 2 }, mode: "overlay" };
    const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps, puppeteerInstance: browser });
    for (let f = 0; f < FRAMES; f++) {
      await renderStill({ composition, serveUrl, output: join(outDir, `${tag}_${String(f).padStart(2, "0")}.png`), frame: f, inputProps, puppeteerInstance: browser, imageFormat: "png" });
    }
    console.log(tag);
  }
} finally {
  await browser.close({ silent: true });
}
