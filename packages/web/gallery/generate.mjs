/**
 * Gallery: every gallery look x every theme (plus the look's own design) drawn on one frame of a sample clip with
 * captionseasy-web, in headless Chrome. Writes a static page you open in any browser:
 *
 *   node packages/web/gallery/generate.mjs [--video clip.mp4] [--at 0.3] [--looks 12,22,128] [--themes earthy-film]
 *   -> packages/web/gallery/out/index.html (+ cells/*.jpg, gitignored; ~1100 cells, a few minutes)
 *
 * Needs: packages/web/dist and packages/cli/dist built (`pnpm release:build`), ffmpeg on PATH, and Remotion's
 * chrome-headless-shell (downloaded by any captionseasy-render render) or CHROME_PATH.
 * Every cell is drawn at a moment inside the look's first card when its words are on screen, so the page compares
 * looks and themes like for like. The caption props come from the public API (buildCaptions({ look, theme })).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCaptions, listLooks, listThemes, VERSION } from "captionseasy";
import { SAMPLE_WORDS, launch, openHarness, pkgDir, repoDir, startServer } from "../scripts/harness.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const W = Number(arg("width", 540)), H = Math.round((W * 16) / 9), CELL = 270 / W; // composition 540x960 by default (--width 1080 for full size), cells saved 270 px wide
const out = resolve(arg("out", join(pkgDir, "gallery", "out")));
const video = resolve(arg("video", join(repoDir, "apps", "frontend", "public", "hero", "gereon.raw.mp4")));
const at = arg("at", "0.3");
const lookFilter = arg("looks")?.split(",");
const themeFilter = arg("themes")?.split(",");

if (!existsSync(join(pkgDir, "dist", "index.mjs"))) throw new Error("build captionseasy-web first: pnpm release:build (or node packages/web/scripts/build.mjs)");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "cells"), { recursive: true });

// one frame of the sample clip, cover-cropped to 9:16
const bg = join(out, "frame.jpg");
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", at, "-i", video, "-frames:v", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, "-q:v", "3", bg]);

const looks = listLooks().filter((l) => !lookFilter || lookFilter.includes(String(l.number)) || lookFilter.includes(l.id));
const themes = [{ id: "", name: "Look's own" }, ...listThemes().filter((t) => !themeFilter || themeFilter.includes(t.id))];

/**
 * a moment in the first card where its words are all in, before the card's exit starts (many looks leave over the
 * last ~300 ms: zoom-through, wipes), so every look is compared settled: last word start + 250 ms, but no later than
 * 300 ms before the card ends
 */
function momentFor(props) {
  const n = Math.max(1, Math.min(Number(props.settings.maxWordsPerCard) || 3, SAMPLE_WORDS.length));
  const last = SAMPLE_WORDS[n - 1];
  return Math.max(last.startMs + 40, Math.min(last.startMs + 250, last.endMs - 300));
}

const jobs = [];
for (const l of looks) {
  for (const t of themes) {
    const props = buildCaptions({ words: SAMPLE_WORDS, look: l.number, ...(t.id ? { theme: t.id } : {}) });
    jobs.push({ file: `${l.number}-${t.id || "own"}.jpg`, look: l, theme: t, props, timeMs: momentFor(props) });
  }
}

const { origin, close } = await startServer({ routes: { "/frame.jpg": { body: readFileSync(bg), type: "image/jpeg" } } });
const browser = await launch();
const page = await openHarness(browser, origin, { width: 800, height: 1000 });
await page.evaluate(async () => {
  const img = new Image();
  img.src = "/frame.jpg";
  await img.decode();
  window.__bg = img;
  window.cell = async (props, timeMs, w, h, s) => {
    const cap = await window.CE.renderCaptionsFrame(props, timeMs, { width: w, height: h });
    const c = new OffscreenCanvas(Math.round(w * s), Math.round(h * s));
    const x = c.getContext("2d");
    x.drawImage(window.__bg, 0, 0, c.width, c.height);
    x.drawImage(cap, 0, 0, c.width, c.height);
    const b = new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg", quality: 0.82 })).arrayBuffer());
    let str = "";
    for (let i = 0; i < b.length; i += 0x8000) str += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(str);
  };
});

const t0 = Date.now();
const failed = [];
for (const [i, j] of jobs.entries()) {
  try {
    const b64 = await page.evaluate((p, t, w, h, s) => window.cell(p, t, w, h, s), j.props, j.timeMs, W, H, CELL);
    writeFileSync(join(out, "cells", j.file), Buffer.from(b64, "base64"));
  } catch (e) {
    failed.push(`${j.file}: ${String(e).slice(0, 200)}`);
  }
  if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${jobs.length} cells (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
}
await browser.close();
await close();
if (page.errors?.length) console.warn(`page errors:\n  ${page.errors.slice(0, 10).join("\n  ")}`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const head = themes.map((t) => `<th>${esc(t.name)}${t.id ? `<small>${esc(t.id)}</small>` : ""}</th>`).join("");
const rows = looks
  .map((l) => `<tr id="look-${l.number}"><th class="look"><b>#${l.number}</b> ${esc(l.name)}<small>${esc(l.id)}</small></th>${themes
    .map((t) => {
      const f = `${l.number}-${t.id || "own"}.jpg`;
      return `<td>${failed.some((x) => x.startsWith(f)) ? `<div class="fail">failed</div>` : `<img loading="lazy" width="${W * CELL}" height="${H * CELL}" src="cells/${f}" alt="#${l.number} ${esc(l.name)}, ${esc(t.name)}">`}</td>`;
    })
    .join("")}</tr>`)
  .join("\n");
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CaptionsEasy Gallery</title>
<style>
:root{--bg:#f6f4ef;--ink:#1b1a17;--mute:#6d685e;--line:#e2ddd2}
@media (prefers-color-scheme:dark){:root{--bg:#141412;--ink:#ecebe6;--mute:#9a968c;--line:#2c2b27}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
header{padding:20px 16px 8px}h1{margin:0 0 4px;font-size:20px}p{margin:0;color:var(--mute)}
.wrap{overflow:auto;max-height:calc(100vh - 90px)}
table{border-collapse:separate;border-spacing:8px}
th{font-weight:600;text-align:left;vertical-align:bottom;position:sticky;top:0;background:var(--bg);z-index:1;padding:4px}
th small{display:block;font-weight:400;color:var(--mute)}
th.look{position:sticky;left:0;z-index:2;width:150px;vertical-align:middle}
td img{display:block;border-radius:6px;background:#000}
.fail{width:${W * CELL}px;height:${H * CELL}px;display:grid;place-items:center;border:1px dashed var(--line);color:var(--mute)}
</style></head><body>
<header><h1>CaptionsEasy gallery</h1><p>captionseasy ${esc(VERSION)} · ${looks.length} looks x ${themes.length} (own design + ${themes.length - 1} themes) · drawn with captionseasy-web on one frame of ${esc(video.split(/[\\/]/).pop())}${failed.length ? ` · ${failed.length} failed` : ""}</p></header>
<div class="wrap"><table><thead><tr><th class="look">Look</th>${head}</tr></thead><tbody>
${rows}
</tbody></table></div></body></html>`,
);
console.log(`gallery: ${jobs.length - failed.length}/${jobs.length} cells in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${join(out, "index.html")}`);
if (failed.length) {
  console.log(`failed:\n  ${failed.join("\n  ")}`);
  process.exitCode = 1;
}
