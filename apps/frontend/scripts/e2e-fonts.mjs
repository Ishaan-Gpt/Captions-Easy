// Real-Chrome check of the font picker: silent clip -> editor -> Style -> font list drawn in each font ->
// pick Open Sauce One (downloaded only then) -> saved on the project. Screenshots go to OUT (default .e2e-upload).
// Run: APP_URL=http://localhost:3000 node apps/frontend/scripts/e2e-fonts.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DIR = join(REPO, "apps/frontend/.e2e-upload");
const requireFE = createRequire(`${REPO}/apps/frontend/package.json`);
const { createClient } = requireFE("@supabase/supabase-js");
const puppeteer = requireFE("puppeteer-core");
const env = Object.fromEntries(readFileSync(`${REPO}/apps/frontend/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? DIR;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const email = `e2e-font-${Date.now()}@example.com`, password = `Pw-${Math.random().toString(36).slice(2)}A1!`;
const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = cu.user.id;
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.signInWithPassword({ email, password });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const browser = await puppeteer.launch({ executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`, headless: "shell", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
try {
  const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title: "Font check" }).select("id").single();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(sess.session));
  await page.goto(`${APP}/projects/${proj.id}`, { waitUntil: "domcontentloaded" });
  const input = await page.waitForSelector("input[type=file]", { timeout: 90000 });
  await input.uploadFile(join(DIR, "silent.mp4"));
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.startsWith("English")), { timeout: 30000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("English")).click());
  try { await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Style"), { timeout: 90000 }); }
  catch (e) { await page.screenshot({ path: `${OUT}/font-0-stuck.png` }); throw e; }
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Style").click());
  await sleep(800);
  await page.evaluate(() => [...document.querySelectorAll("button[aria-expanded]")].find((b) => b.previousElementSibling?.textContent === "Font").click());
  await sleep(3500);
  await page.screenshot({ path: `${OUT}/font-1-open.png` });
  // google category + filter
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Handwriting").click());
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/font-2-handwriting.png` });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "All").click());
  await page.type("input[placeholder='Search fonts']", "open sauce");
  await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll("[role=option]")].find((b) => b.textContent.startsWith("Open Sauce One")).click());
  await sleep(2500);
  const fam = await page.evaluate(() => [...document.fonts].filter((f) => f.family.includes("Open Sauce")).map((f) => `${f.family} ${f.weight} ${f.status}`));
  console.log("loaded faces:", fam);
  await page.screenshot({ path: `${OUT}/font-3-picked.png` });
  await sleep(2500);
  const { data: p2 } = await admin.from("projects").select("style_json").eq("id", proj.id).single();
  console.log("saved fontId:", p2.style_json?.fontId);
  if (p2.style_json?.fontId !== "Open Sauce One" || !fam.length) process.exitCode = 1;
  // check which google font files were fetched
} finally {
  console.log("errors:", errors);
  await browser.close();
  await admin.from("projects").delete().eq("owner_id", uid);
  await admin.auth.admin.deleteUser(uid);
}
