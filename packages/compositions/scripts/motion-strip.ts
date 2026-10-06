/**
 * Motion QA: renders looks as filmstrips (frames across one spoken line) on a dark backdrop, with the real
 * composition, so entrances / highlights / exits can be judged frame by frame.
 *   tsx scripts/motion-strip.ts --out <dir> --filter <lookId,...> [--text "words to speak"] [--frames 12]
 */
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { CaptionDocSchema } from "@capseasy/shared";
import { LOOKS, applyLook } from "@capseasy/templates";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const outDir = resolve(arg("out", "./out-strips")!);
const ids = (arg("filter") ?? "").split(",").filter(Boolean);
const words = arg("text", "This is the next big thing")!.split(" ");
const FRAMES = Number(arg("frames", "12"));
const GAP = 340;
const W = 1080;
const H = 1920;

const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: words.map((t, i) => ({ id: `w${i}`, text: t, startMs: 200 + i * GAP, endMs: 200 + i * GAP + GAP - 20 })),
});
const endMs = 200 + words.length * GAP + 700;
const looks = LOOKS.filter((l) => !ids.length || ids.includes(l.id));

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: resolve("src/entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome");
try {
  for (const look of looks) {
    const { style, settings } = applyLook(look);
    const inputProps = { src: null, media: { width: W, height: H, fps: 30, durationMs: endMs + 500, rotation: 0 }, doc, style, settings: { ...settings, maxWordsPerCard: Math.max(settings.maxWordsPerCard ?? 3, words.length) }, mode: "overlay" };
    const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps, puppeteerInstance: browser });
    const tiles: Buffer[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const ms = 120 + ((endMs - 120) * f) / (FRAMES - 1);
      const file = join(outDir, `${look.id}_${f}.png`);
      await renderStill({ composition, serveUrl, output: file, frame: Math.round((ms / 1000) * 30), inputProps, puppeteerInstance: browser, imageFormat: "png" });
      // crop the caption band and lay it on a dark, slightly lit backdrop
      const band = await sharp(file).extract({ left: 0, top: Math.round(H * 0.56), width: W, height: Math.round(H * 0.32) }).toBuffer();
      tiles.push(await sharp({ create: { width: W, height: Math.round(H * 0.32), channels: 4, background: "#16161c" } }).composite([{ input: band }]).png().toBuffer());
      rmSync(file);
    }
    const th = Math.round(H * 0.32);
    const cols = 3;
    const rows = Math.ceil(tiles.length / cols);
    // (sharp resizes before compositing, so composite first, then scale down in a second pass)
    const sheet = await sharp({ create: { width: W * cols, height: th * rows, channels: 3, background: "#000" } })
      .composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * th })))
      .png()
      .toBuffer();
    await sharp(sheet).resize(Math.round((W * cols) / 2)).png().toFile(join(outDir, `${look.id}.png`));
    console.log("strip", look.id);
  }
} finally {
  await browser.close({ silent: true });
  rmSync(serveUrl, { recursive: true, force: true });
}
