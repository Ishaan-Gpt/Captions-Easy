/**
 * Visual QA: renders one still per template and per look (same composition the Player/export use),
 * then stitches a contact sheet. Usage: tsx scripts/stills.ts --out <dir> [--only templates|looks] [--time 1300]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { CaptionDocSchema, type CaptionStyleV2 } from "@capseasy/shared";
import { LOOKS, TEMPLATES, resolveStyle } from "@capseasy/templates";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const outDir = resolve(arg("out", "./out-stills")!);
const only = arg("only");
const timeMs = Number(arg("time", "1300"));
const filter = arg("filter");

const TEXT = "Stop scrolling and watch this incredible money trick right now".split(" ");
const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: TEXT.map((t, i) => ({ id: `w${i}`, text: t, startMs: i * 380, endMs: i * 380 + 360, ...(t === "money" ? { emoji: { char: "💰", position: "above" } } : {}) })),
});

type Job = { label: string; style: CaptionStyleV2; settings: Record<string, unknown> };
const jobs: Job[] = [];
const onlyNew = arg("new") !== undefined || process.argv.includes("--new");
if (only !== "looks") for (const t of TEMPLATES) jobs.push({ label: `tpl_${t.id}`, style: resolveStyle({ templateId: t.id }), settings: t.settingsDefaults });
if (only !== "templates") for (const l of LOOKS.filter((x) => !onlyNew || !x.legacy)) jobs.push({ label: `look_${l.id}`, style: resolveStyle(l.style), settings: l.settings });
const selected = filter ? jobs.filter((j) => j.label.includes(filter)) : jobs;

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve("src/entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome");
const frame = Math.round((timeMs / 1000) * 30);
const files: { label: string; file: string }[] = [];

for (const job of selected) {
  const inputProps = { src: null, media: { width: 1080, height: 1920, fps: 30, durationMs: 6000, rotation: 0 }, doc, style: job.style, settings: job.settings, mode: "overlay" };
  const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps, puppeteerInstance: browser });
  const file = join(outDir, `${job.label}.png`);
  await renderStill({ composition, serveUrl, output: file, frame, inputProps, puppeteerInstance: browser, imageFormat: "png" });
  files.push({ label: job.label, file });
  console.log("rendered", job.label);
}
await browser.close({ silent: true });

// contact sheet: dark backdrop so white text is visible on the transparent stills
const W = 216;
const H = 384;
const COLS = 6;
const rows = Math.ceil(files.length / COLS);
const tiles = await Promise.all(
  files.map(async (f, i) => ({
    input: await sharp(f.file).resize(W, H).flatten({ background: "#2b2b35" }).toBuffer(),
    left: (i % COLS) * W,
    top: Math.floor(i / COLS) * H,
  })),
);
const sheet = join(outDir, "_sheet.png");
await sharp({ create: { width: COLS * W, height: rows * H, channels: 3, background: "#111" } }).composite(tiles).png().toFile(sheet);
writeFileSync(join(outDir, "_index.txt"), files.map((f, i) => `${i}\t${f.label}`).join("\n"));
console.log("sheet:", sheet);
