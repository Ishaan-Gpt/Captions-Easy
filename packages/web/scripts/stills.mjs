/**
 * Contact sheets for caption review: every gallery look drawn by captionseasy-web at 1080x1920 on the sample frame,
 * at two settled moments, with the Shorts safe area (x 70-905, y 230-1480) outlined. Used for the before/after
 * stills in caption PRs:
 *
 *   node packages/web/scripts/stills.mjs --out <dir> [--looks 12,22] [--transcript talk|hook]
 *   -> <dir>/<number>.jpg (two moments side by side) and <dir>/sheet-<k>.jpg (labelled grids of 15 looks)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCaptions, listLooks } from "captionseasy";
import { launch, openHarness, repoDir, startServer } from "./harness.mjs";
import { timed, TRANSCRIPTS } from "./transcripts.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const W = 1080, H = 1920;
const out = resolve(arg("out", "stills"));
const lookFilter = arg("looks")?.split(",");
const WORDS = timed(TRANSCRIPTS[arg("transcript", "talk")] ?? arg("transcript"));
mkdirSync(out, { recursive: true });

const bg = join(out, "frame.jpg");
const video = join(repoDir, "apps", "frontend", "public", "hero", "gereon.raw.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.3", "-i", video, "-frames:v", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, "-q:v", "3", bg]);

const { origin, close } = await startServer({ routes: { "/frame.jpg": { body: readFileSync(bg), type: "image/jpeg" } } });
const browser = await launch();
const page = await openHarness(browser, origin, { width: 800, height: 1000 });
await page.evaluate(async () => {
  const img = new Image();
  img.src = "/frame.jpg";
  await img.decode();
  window.still = async (props, times, label) => {
    const s = 0.25, w = 1080 * s, h = 1920 * s;
    const c = new OffscreenCanvas(w * times.length + 8 * (times.length - 1), h + 30);
    const x = c.getContext("2d");
    x.fillStyle = "#111"; x.fillRect(0, 0, c.width, c.height);
    for (let k = 0; k < times.length; k++) {
      const ox = k * (w + 8);
      x.drawImage(img, ox, 30, w, h);
      const cap = await window.CE.renderCaptionsFrame(props, times[k], { width: 1080, height: 1920 });
      x.drawImage(cap, ox, 30, w, h);
      x.strokeStyle = "rgba(0,255,120,.8)"; x.setLineDash([4, 3]); x.lineWidth = 1;
      x.strokeRect(ox + 70 * s, 30 + 230 * s, (905 - 70) * s, (1480 - 230) * s);
    }
    x.fillStyle = "#fff"; x.font = "bold 16px sans-serif"; x.fillText(label, 6, 20);
    const b = new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg", quality: 0.85 })).arrayBuffer());
    let str = "";
    for (let i = 0; i < b.length; i += 0x8000) str += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(str);
  };
});
const looks = listLooks().filter((l) => !lookFilter || lookFilter.includes(String(l.number)) || lookFilter.includes(l.id));
const files = [];
for (const l of looks) {
  const props = buildCaptions({ words: WORDS, look: l.number });
  const at = (i) => Math.min(WORDS[i].startMs + 260, WORDS[i].endMs + 120);
  const b64 = await page.evaluate((p, t, lab) => window.still(p, t, lab), props, [at(2), at(9)], `#${l.number} ${l.name}`);
  const f = join(out, `${l.number}.jpg`);
  writeFileSync(f, Buffer.from(b64, "base64"));
  files.push(f);
}
// labelled grids of 15 (5 x 3)
const list = join(out, "list.txt");
writeFileSync(list, files.map((f) => `file '${f}'\n`).join(""));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-vf", "tile=5x3:padding=6", "-q:v", "4", join(out, "sheet-%d.jpg")]);
console.log(`${files.length} stills -> ${out}`);
if (page.errors.length) console.log("page errors:", page.errors.slice(0, 5));
await browser.close();
await close();
