// Real-Chrome test of the fast caption path: spoken clip -> studio -> live captions while the model is still writing ->
// saved document. Prints the timing marks so each optimisation can be judged. Windows only (SAPI makes the speech).
// Needs the frontend on :3000. Run: node apps/frontend/scripts/e2e-fast.mjs   (MINUTES=3 for a longer clip, WARM=0 for a cold profile)
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DIR = join(REPO, "apps", "frontend", ".e2e-upload");
mkdirSync(DIR, { recursive: true });
const requireFE = createRequire(`${REPO}/apps/frontend/package.json`);
const { createClient } = requireFE("@supabase/supabase-js");
const puppeteer = requireFE("puppeteer-core");
const env = Object.fromEntries(readFileSync(`${REPO}/apps/frontend/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, every = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); }
  return null;
}

// ---- the spoken clip
const MIN = Number(process.env.MINUTES ?? 1);
const file = join(DIR, `speech-${MIN}m.mp4`);
if (!existsSync(file)) {
  const { RenderInternals } = createRequire(`${REPO}/packages/companion/package.json`)("@remotion/renderer");
  const ffmpeg = RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });
  const para = "Stop scrolling and watch this incredible trick right now. Captions made easy for everyone, with every word timed perfectly. Your audience will keep watching because the words pop on screen exactly when you say them. Pick a look, tweak the style, and export a video that is ready to post. It takes only a couple of minutes from start to finish.";
  const wav = join(DIR, "speech.wav");
  const times = Math.max(1, Math.round(MIN * 60 / 22));
  const text = Array(times).fill(para).join(" ");
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 0; $s.SetOutputToWaveFile('${wav.replace(/\//g, "\\")}'); $s.Speak('${text}'); $s.Dispose()`], { encoding: "utf8" });
  if (ps.status !== 0) throw new Error("SAPI failed: " + ps.stderr);
  const ff = spawnSync(ffmpeg, ["-y", "-loop", "1", "-framerate", "30", "-i", join(DIR, "hevc.png"), "-i", wav, "-vf", "scale=720:1280,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-shortest", file], { encoding: "utf8" });
  if (ff.status !== 0) throw new Error("ffmpeg failed: " + ff.stderr.slice(-300));
}

const email = `e2e-fast-${Date.now()}@example.com`, password = `Pw-${Math.random().toString(36).slice(2)}A1!`;
const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = cu.user.id;
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.signInWithPassword({ email, password });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const profile = join(DIR, process.env.WARM === "0" ? `profile-cold-${Date.now()}` : "profile-fast");
let browser;
const errors = [];
try {
  browser = await puppeteer.launch({
    executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    headless: "shell",
    userDataDir: profile,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-webgpu"],
  });
  const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title: "Fast captions" }).select("id").single();
  const page = await browser.newPage();
  if (process.env.MOBILE) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36" });
  else await page.setViewport({ width: 1280, height: 800 });
  const hf = [], hfRes = [];
  page.on("workercreated", (w) => log("worker created", w.url().slice(-60)));
  page.on("workerdestroyed", (w) => log("worker destroyed", w.url().slice(-60)));
  page.on("response", (r) => r.url().includes("huggingface.co") && hfRes.push(`${r.status()}${r.fromCache() ? " cached" : ""} ${r.headers()["content-length"] ?? "?"}B ${r.url().replace("https://huggingface.co/", "").slice(-60)}`));
  page.on("request", (r) => r.url().includes("huggingface.co") && hf.push(r.method() + " " + r.url().replace("https://huggingface.co/", "").slice(0, 110)));
  page.on("pageerror", (e) => { errors.push(e.message); log("pageerror", e.message.slice(0, 200)); });
  page.on("console", (m) => log("console:", m.type(), m.text().slice(0, 250)));
  page.on("requestfailed", (r) => log("requestfailed", r.url().slice(-80), r.failure()?.errorText));
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|_vercel\/|monitoring/.test(m.text()) && errors.push(m.text()));
  await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(sess.session));
  await page.goto(`${APP}/projects/${proj.id}`, { waitUntil: "domcontentloaded" });
  const input = await page.waitForSelector("input[type=file]", { timeout: 60000 });
  const t0 = Date.now();
  await input.uploadFile(file);

  // the live banner = the editor is showing captions that are still being written
  let tick = 0;
  const banner = await waitFor(async () => {
    if (++tick % 75 === 0) log("state:", (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200))), `| HF: ${hf.length}`);
    return page.evaluate(() => !!document.querySelector("[title*='edit the words']") && /Writing your captions/.test(document.body.innerText));
  }, 15 * 60000, 400);
  const tLive = Date.now() - t0;
  check("editor shows captions WHILE they are being written", !!banner);
  if (banner) {
    const words = await page.evaluate(() => document.body.innerText.length);
    log(`first captions on screen after ${(tLive / 1000).toFixed(1)} s (page text ${words} chars)`);
    const frozen = await page.evaluate(() => !!document.querySelector("[title*='edit the words']"));
    check("words are read-only while live", frozen);
    const disabledExport = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Export")?.disabled);
    check("Export is held until the captions are done", disabledExport === true);
  }
  const doc = await waitFor(async () => (await admin.from("caption_documents").select("doc").eq("project_id", proj.id).maybeSingle()).data, 15 * 60000, 1000);
  const tAll = Date.now() - t0;
  const words = doc?.doc?.words ?? [];
  check("final captions saved with words", words.length > 20, `${words.length} words`);
  log(`all captions saved after ${(tAll / 1000).toFixed(1)} s, ${words.length} words:`, words.slice(0, 12).map((w) => w.text).join(" "));
  const last = words[words.length - 1];
  check("captions reach the end of the clip", !!last && last.endMs > MIN * 60000 * 0.8, last ? `${last.endMs} ms` : "no words");
  const editorReady = await waitFor(() => page.evaluate(() => ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Export")?.disabled), 25000, 500);
  check("Export unlocks when captions are saved", editorReady);
  const timings = await page.evaluate(() => window.__captionTimings ?? []);
  console.log(JSON.stringify(timings, null, 1));
  log("huggingface requests this run:", hf.length ? [...new Set(hf)].join(" | ") : "none");
  await page.screenshot({ path: join(DIR, "fast-done.png") });
  const keys = await page.evaluate(async () => (await (await caches.open("transformers-cache")).keys()).map((r) => r.url.replace("https://huggingface.co/", "")));
  log("cache keys:", JSON.stringify(keys, null, 1));
  log("hf responses:", JSON.stringify(hfRes, null, 1));
  if (process.env.WARM !== "0") check("no model bytes downloaded (model came from the browser cache)", !hfRes.some((r) => /^200 (?!cached)\d{6,}B/.test(r)), hfRes.filter((r) => /\d{6,}B/.test(r)).join(" | "));
  check("no console errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser?.close();
  await admin.auth.admin.deleteUser(uid).catch(() => {});
  if (process.env.WARM === "0") rmSync(profile, { recursive: true, force: true });
}
log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
