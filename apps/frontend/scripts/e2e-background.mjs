// Leaving the tab while captions are being written must never leave the studio stuck.
// Real Chrome, 1-minute spoken clip (made by e2e-fast.mjs). While the model is writing captions:
//   MODE=kill   (default) the tab is hidden and the speech worker is killed silently, as a phone does to a
//               background tab; then the tab comes back.
//   MODE=freeze the whole page is frozen for 45 s (Chrome's page lifecycle "frozen"), then resumed.
// Pass = the captions continue and are saved, without the user doing anything.
// Run: node apps/frontend/scripts/e2e-background.mjs   (frontend on :3000 or APP_URL)
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DIR = join(REPO, "apps", "frontend", ".e2e-upload");
const requireFE = createRequire(`${REPO}/apps/frontend/package.json`);
const { createClient } = requireFE("@supabase/supabase-js");
const puppeteer = requireFE("puppeteer-core");
const env = Object.fromEntries(readFileSync(`${REPO}/apps/frontend/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const APP = process.env.APP_URL ?? "http://localhost:3000";
const MODE = process.env.MODE ?? "kill";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, every = 500) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); } return null; };

const file = join(DIR, "speech-1m.mp4");
if (!existsSync(file)) throw new Error("run e2e-fast.mjs once first (it makes the spoken clip)");
const email = `e2e-bg-${Date.now()}@example.com`, password = `Pw-${Math.random().toString(36).slice(2)}A1!`;
const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = cu.user.id;
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.signInWithPassword({ email, password });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    headless: "shell",
    userDataDir: join(DIR, "profile-fast"), // speech model already cached by e2e-fast
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-webgpu"],
  });
  const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title: `Background ${MODE}` }).select("id").single();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on("console", (m) => /captions\]/.test(m.text()) && log("console:", m.text().slice(0, 200)));
  await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(sess.session));
  // remember every worker the page starts, so the test can kill the speech worker instantly (no error event, like an OS kill)
  await page.evaluateOnNewDocument(() => {
    const W = window.Worker;
    window.__workers = [];
    window.Worker = class extends W { constructor(...a) { super(...a); window.__workers.push({ url: String(a[0]), w: this }); } };
  });
  await page.goto(`${APP}/projects/${proj.id}`, { waitUntil: "domcontentloaded" });
  const input = await page.waitForSelector("input[type=file]", { timeout: 60000 });
  await input.uploadFile(file);
  if (await waitFor(() => page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.startsWith("English"))), 15000)) {
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("English"))?.click());
  }
  const live = await waitFor(() => page.evaluate(() => /Writing your captions/.test(document.body.innerText) && !!document.querySelector("[title*='edit the words']")), 10 * 60000, 400);
  check("captions are being written", !!live);
  const t0 = Date.now();

  const cdp = await page.createCDPSession();
  const setVisible = (v) => page.evaluate((v) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (v ? "visible" : "hidden") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !v });
    document.dispatchEvent(new Event("visibilitychange"));
  }, v);
  if (MODE === "freeze") {
    await setVisible(false);
    await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
    log("page frozen");
    await sleep(45000);
    await cdp.send("Page.setWebLifecycleState", { state: "active" });
    await setVisible(true);
    log("page resumed");
  } else {
    await setVisible(false);
    const killed = await page.evaluate(() => window.__workers.filter((x) => x.url.includes("whisper")).map((x) => (x.w.terminate(), x.url)).length);
    check("killed the speech worker", killed > 0);
    log("tab hidden, worker killed");
    await sleep(25000);
    await setVisible(true);
    log("tab visible again");
  }

  const doc = await waitFor(async () => (await admin.from("caption_documents").select("doc").eq("project_id", proj.id).maybeSingle()).data, Number(process.env.WAIT_S ?? 360) * 1000, 1000);
  const words = doc?.doc?.words ?? [];
  check(`captions finished and saved after coming back (${Math.round((Date.now() - t0) / 1000)} s, ${words.length} words)`, words.length > 20);
  const last = words[words.length - 1];
  check("captions reach the end of the clip", !!last && last.endMs > 48000, last ? `${last.endMs} ms` : "no words");
  const editor = await waitFor(() => page.evaluate(() => ![...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Export")?.disabled), 30000);
  check("editor unlocked (Export enabled)", !!editor);
  await page.screenshot({ path: join(DIR, `background-${MODE}.png`) });
} finally {
  await browser?.close();
  await admin.from("projects").delete().eq("owner_id", uid);
  await admin.auth.admin.deleteUser(uid).catch(() => {});
}
log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
