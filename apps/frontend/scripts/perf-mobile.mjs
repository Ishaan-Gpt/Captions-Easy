import { createRequire } from "node:module";
// Landing load on a phone and a throttled budget phone. Needs the app on :3000. Run from the repo root.
const req = createRequire(process.cwd() + "/apps/frontend/package.json");
const puppeteer = req("puppeteer-core");
const exe = process.cwd() + "/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe";
const b = await puppeteer.launch({ executablePath: exe, headless: "shell", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
for (const [name, lowEnd] of [["mid phone", false], ["budget phone", true]]) {
  const p = await b.newPage();
  await p.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile Chrome/140" });
  if (lowEnd) { await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 }); Object.defineProperty(navigator, "deviceMemory", { get: () => 2 }); }); const c = await p.createCDPSession(); await c.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
  let bytes = 0, vids = 0;
  p.on("response", async (r) => { const l = Number(r.headers()["content-length"] ?? 0); bytes += l; if (/\.mp4/.test(r.url())) vids++; });
  const t = Date.now();
  await p.goto("http://localhost:3000/", { waitUntil: "load", timeout: 90000 });
  const loadMs = Date.now() - t;
  await new Promise((r) => setTimeout(r, 4000));
  const lcp = await p.evaluate(() => new Promise((res) => new PerformanceObserver((l) => { const e = l.getEntries().at(-1); res(Math.round(e.startTime) + " " + (e.element?.tagName ?? "") + " " + (e.url || e.element?.textContent?.slice(0, 40) || "")); }).observe({ type: "largest-contentful-paint", buffered: true })));
  const live = await p.evaluate(() => document.querySelectorAll("video").length);
  console.log(`${name}: load ${loadMs} ms, LCP ${lcp} ms, ${(bytes / 1048576).toFixed(2)} MB first view, ${vids} mp4 requests, ${live} <video> on page`);
  await p.close();
}
await b.close();
