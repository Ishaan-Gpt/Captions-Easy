/**
 * Test harness shared by the visual regression script and the vitest suite: a tiny static server for dist/ + a test
 * page, headless Chrome (Remotion's chrome-headless-shell, already downloaded by @remotion/renderer), and in-page
 * helpers to rasterise captions with captionseasy-web and compare two images.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
export const repoDir = join(pkgDir, "..", "..");

const TYPES = { ".mjs": "text/javascript", ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm" };

export const TEST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>captionseasy-web harness</title>
<style>html,body{margin:0;background:transparent}</style></head><body>
<script type="module">
import * as CE from "/dist/index.mjs";
window.CE = CE;
const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("cannot load " + src.slice(0, 80))); i.src = src; });
const pixels = (img, w, h) => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
const toB64 = async (blob) => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
window.hashCanvas = async (canvas) => { const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data; const h = await crypto.subtle.digest("SHA-256", d); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); };
/** captionseasy-web canvas -> { png (base64), hash } */
window.webFrame = async (props, timeMs, size) => { const c = await CE.renderCaptionsFrame(props, timeMs, size); return { png: await toB64(await c.convertToBlob({ type: "image/png" })), hash: await window.hashCanvas(c) }; };
/**
 * Compare two images (premultiplied RGBA). ink = pixels opaque in either; mismatch = ink pixels differing by > 48 (of
 * 255) in any channel; shift = the same but tolerating a +-1 px misregistration (sub-pixel text placement);
 * coarse = 4x4 block averages differing by > 32 (ignores anti-aliasing, catches layout/colour/missing).
 */
window.compareImages = async (a, b, w, h, wantDiff) => {
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const pa = pixels(ia, w, h), pb = pixels(ib, w, h);
  const pm = (p, i) => { const al = p[i + 3] / 255; return [p[i] * al, p[i + 1] * al, p[i + 2] * al, p[i + 3]]; };
  let ink = 0, bad = 0, sum = 0;
  const diff = wantDiff ? new OffscreenCanvas(w, h) : null; const dctx = diff?.getContext("2d"); const dimg = dctx?.createImageData(w, h);
  for (let i = 0; i < pa.length; i += 4) {
    const x = pm(pa, i), y = pm(pb, i);
    const d = Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2]), Math.abs(x[3] - y[3]));
    if (pa[i + 3] > 16 || pb[i + 3] > 16) { ink++; sum += d; if (d > 48) bad++; }
    if (dimg) { dimg.data[i] = d > 48 ? 255 : d * 2; dimg.data[i + 1] = Math.min(255, (x[3] + y[3]) / 6); dimg.data[i + 2] = 0; dimg.data[i + 3] = 255; }
  }
  // shift-tolerant: an ink pixel is "off" when no pixel within +-1 px in the other image is within 48/255 (both ways)
  const near = (p, q, x, y) => {
    const i = (y * w + x) * 4, a = pm(p, i);
    let best = 255;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const b = pm(q, (yy * w + xx) * 4);
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
      if (d < best) best = d;
    }
    return best;
  };
  let off = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (pa[i + 3] <= 16 && pb[i + 3] <= 16) continue;
    if (near(pa, pb, x, y) > 48 || near(pb, pa, x, y) > 48) off++;
  }
  const B = 4, cw = Math.floor(w / B), ch = Math.floor(h / B);
  let cInk = 0, cBad = 0;
  for (let by = 0; by < ch; by++) for (let bx = 0; bx < cw; bx++) {
    const sa = [0, 0, 0, 0], sb = [0, 0, 0, 0];
    for (let yy = 0; yy < B; yy++) for (let xx = 0; xx < B; xx++) {
      const i = ((by * B + yy) * w + (bx * B + xx)) * 4; const x = pm(pa, i), y = pm(pb, i);
      for (let k = 0; k < 4; k++) { sa[k] += x[k]; sb[k] += y[k]; }
    }
    const n = B * B;
    if (sa[3] / n > 16 || sb[3] / n > 16) { cInk++; if (Math.max(...[0, 1, 2, 3].map((k) => Math.abs(sa[k] - sb[k]) / n)) > 32) cBad++; }
  }
  let diffPng = null;
  if (dctx) {
    // triptych at half size on a dark backdrop: reference | captionseasy-web | difference (red = > 48/255)
    dctx.putImageData(dimg, 0, 0);
    const s = 0.5, tw = Math.round(w * s), th = Math.round(h * s);
    const t = new OffscreenCanvas(tw * 3, th); const tx = t.getContext("2d");
    tx.fillStyle = "#2b2b35"; tx.fillRect(0, 0, tw * 3, th);
    tx.drawImage(ib, 0, 0, tw, th); tx.drawImage(ia, tw, 0, tw, th); tx.drawImage(diff, tw * 2, 0, tw, th);
    diffPng = await toB64(await t.convertToBlob({ type: "image/png" }));
  }
  return { ink, mismatch: ink ? bad / ink : 0, shift: ink ? off / ink : 0, meanDiff: ink ? sum / ink : 0, coarseInk: cInk, coarse: cInk ? cBad / cInk : 0, diffPng };
};
window.__harnessReady = true;
</script></body></html>`;

/** Static server: /dist/* (packages/web/dist), /ref/* (refDir), / (the test page), plus extra routes. */
export function startServer({ refDir, routes = {} } = {}) {
  const roots = { "/dist/": join(pkgDir, "dist"), ...(refDir ? { "/ref/": resolve(refDir) } : {}) };
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(TEST_PAGE);
    }
    if (routes[url]) {
      const r = routes[url];
      res.writeHead(200, { "content-type": r.type ?? TYPES[extname(url)] ?? "application/octet-stream" });
      return res.end(typeof r.body === "function" ? r.body() : r.body);
    }
    for (const [prefix, dir] of Object.entries(roots)) {
      if (!url.startsWith(prefix)) continue;
      const file = normalize(join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) break;
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" });
      return res.end(readFileSync(file));
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

/** chrome-headless-shell downloaded by @remotion/renderer (ensureBrowser), or CHROME_PATH. */
export function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = join(repoDir, "node_modules", ".remotion", "chrome-headless-shell");
  const walk = (dir, depth) => {
    if (!existsSync(dir) || depth > 4) return null;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (/^chrome-headless-shell(\.exe)?$/.test(f) && statSync(p).isFile()) return p;
      if (statSync(p).isDirectory()) {
        const hit = walk(p, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(base, 0);
}

export async function launch() {
  const exe = chromePath();
  if (!exe) throw new Error("No headless Chrome: run a captionseasy-render render once (it downloads chrome-headless-shell) or set CHROME_PATH.");
  const puppeteer = (await import("puppeteer-core")).default;
  return puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--force-color-profile=srgb", "--font-render-hinting=none", "--disable-gpu", "--hide-scrollbars"] });
}

export async function openHarness(browser, origin, { width = 1280, height = 800 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction("window.__harnessReady === true", { timeout: 30_000 });
  page.errors = errors;
  return page;
}

/** The transcript every regression moment uses (same as packages/compositions/scripts/stills.ts). */
export const SAMPLE_WORDS = "Stop scrolling and watch this incredible money trick right now".split(" ").map((t, i) => ({ text: t, startMs: i * 380, endMs: i * 380 + 360 }));
