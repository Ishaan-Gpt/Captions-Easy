/* Visual QA: screenshots of public pages at desktop + phone widths (and optionally authed pages).
   Usage: node apps/frontend/scripts/shots.mjs <outDir> [path ...]   (dev server on :3000) */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(root, "..", "..");
const puppeteer = createRequire(join(root, "package.json"))("puppeteer-core");
const out = process.argv[2] ?? join(root, ".shots");
const paths = process.argv.slice(3).length ? process.argv.slice(3) : ["/"];
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: join(REPO, "packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"),
  headless: "shell",
  args: ["--no-sandbox"],
});
const session = process.env.SHOT_SESSION ? JSON.parse(process.env.SHOT_SESSION) : null;
for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  for (const path of paths) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (session) await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), session.key, session.value);
    await page.goto(`http://localhost:3000${path}`, { waitUntil: "load", timeout: 120000 });
    await new Promise((r) => setTimeout(r, Number(process.env.SHOT_WAIT ?? 2500)));
    if (process.env.SHOT_SCROLL === "1") {
      // walk down the page so scroll-triggered reveals fire, then return to the top
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 400) { await page.evaluate((v) => window.scrollTo(0, v), y); await new Promise((r) => setTimeout(r, 120)); }
      await new Promise((r) => setTimeout(r, 1500));
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 1200));
    }
    const name = `${label}${path.replace(/[^a-z0-9]+/gi, "_")}`;
    const full = process.env.SHOT_FULL !== "0";
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${name}: horizontal overflow ${overflow}px${errors.length ? `, errors: ${errors.slice(0, 2).join(" | ")}` : ""}`);
    await page.close();
  }
}
await browser.close();
