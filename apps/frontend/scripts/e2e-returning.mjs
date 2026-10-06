// Returning-user flows in real Chrome (app on :3000, anonymous sign-ins ON):
// guest -> Export -> "Sign in" to an EXISTING account -> the guest project moves over and reopens;
// signed-in "Start free"/"Sign in" -> dashboard; signed out on a known browser -> sign in, never a guest;
// signed-out project link -> sign in -> back to that project. Throwaway users, self-cleaning.
// Run: node apps/frontend/scripts/e2e-returning.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const requireFE = createRequire(`${REPO}/apps/frontend/package.json`);
const { createClient } = requireFE("@supabase/supabase-js");
const puppeteer = requireFE("puppeteer-core");
const env = Object.fromEntries(readFileSync(`${REPO}/apps/frontend/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const SESSION_KEY = `sb-${ref}-auth-token`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, every = 500) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); } return null; };

const email = `e2e-returning-${Date.now()}@example.com`;
const password = "returning-pass-123";
let browser, guestId, keeperId;
try {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  keeperId = created.user.id;

  browser = await puppeteer.launch({
    executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    headless: "shell",
    userDataDir: join(REPO, "apps", "frontend", ".e2e-upload", "profile-returning"), // keeps the speech model between runs
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem("e2e")) { sessionStorage.setItem("e2e", "1"); localStorage.clear(); } }); // a brand-new visitor
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const path = () => new URL(page.url()).pathname;
  const go = async (p) => { await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" }); };
  const clickText = async (text) => page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a")].find((b) => !b.disabled && (b.textContent?.trim() === t || b.textContent?.trim().startsWith(t)));
    if (!el) return false;
    el.click();
    return true;
  }, text);
  const signInForm = async () => {
    await page.waitForSelector("input[type=email]", { timeout: 20000 });
    await page.evaluate(() => { (document.querySelector("input[type=email]")).value = ""; });
    await page.type("input[type=email]", email);
    await page.type("input[type=password]", password);
    await page.keyboard.press("Enter");
  };

  // 1. new visitor -> guest project
  await go("/start");
  const projectPath = await waitFor(() => (/^\/projects\/[0-9a-f-]{36}$/.test(path()) ? path() : null), 90000);
  check("new visitor: /start opens a guest project", !!projectPath, page.url());
  const projectId = projectPath?.split("/")[2];
  guestId = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.user?.id, SESSION_KEY);
  // a guest uploads and gets captions (Export needs them); the first run also exercises the first-time setup screen
  const input = await page.waitForSelector("input[type=file]", { timeout: 30000 });
  await input.uploadFile(join(REPO, "packages", "companion", ".e2e-out", "input.mp4"));
  const sawSetup = await waitFor(() => page.evaluate(() => /Building your experience|Warming up|Writing your captions|Listening to your video/.test(document.body.innerText)), 60000);
  check("captions screen shows the new wording", !!sawSetup);
  check("no '80 MB' / 'Downloading' wording", !(await page.evaluate(() => /80 MB|Downloading the speech model/.test(document.body.innerText))));
  const doc = await waitFor(async () => (await admin.from("caption_documents").select("doc").eq("project_id", projectId).maybeSingle()).data, 400000, 3000);
  check("guest gets captions in the browser", (doc?.doc.words.length ?? 0) > 5, doc?.doc.words.length);

  // 2. Export -> sign-up box -> "Sign in" to the existing account
  await waitFor(() => clickText("Export"), 30000);
  const gate = await waitFor(() => page.evaluate(() => !!document.querySelector('[aria-label="Create your free account"]')), 15000);
  check("guest Export opens the sign-up box", !!gate);
  check("sign-up box offers 'Already have an account? Sign in'", await page.evaluate(() => document.body.innerText.includes("Already have an account?")));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[aria-label="Create your free account"] button')].find((x) => x.textContent?.trim() === "Sign in");
    b?.click();
  });
  await waitFor(() => path() === "/login", 15000);
  await signInForm();
  const back = await waitFor(() => (path() === projectPath ? page.url() : null), 40000);
  check("after sign-in: back in the SAME project (not a new one)", !!back, page.url());
  const { data: proj } = await admin.from("projects").select("owner_id").eq("id", projectId).single();
  check("the guest project now belongs to the account", proj?.owner_id === keeperId, proj?.owner_id);
  const exportOpen = await waitFor(() => page.evaluate(() => !document.querySelector('[aria-label="Create your free account"]') && /Export/i.test(document.querySelector('[role="dialog"]')?.textContent ?? "")), 20000);
  check("the export dialog reopens (no sign-up box)", !!exportOpen);
  const { count: guestLeft } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", guestId);
  check("nothing left on the guest account", guestLeft === 0, guestLeft);

  // 3. signed in: Start free / Sign in / landing header
  await go("/start");
  check("signed in: Start free -> dashboard", !!(await waitFor(() => path() === "/dashboard", 20000)), page.url());
  await go("/login");
  check("signed in: Sign in -> dashboard", !!(await waitFor(() => path() === "/dashboard", 20000)), page.url());
  const { count: keeperProjects } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", keeperId);
  check("no blank projects were created", keeperProjects === 1, keeperProjects);
  await go("/");
  check("landing header shows Dashboard", !!(await waitFor(() => page.evaluate(() => [...document.querySelectorAll("header a")].some((a) => a.textContent?.trim() === "Dashboard")), 10000)));

  // 4. signed out on this browser (session gone, browser remembers an account): never a guest
  await page.evaluate((k) => localStorage.removeItem(k), SESSION_KEY);
  await go("/start");
  check("signed out, known browser: Start free -> sign in (no guest)", !!(await waitFor(() => path() === "/login", 20000)), page.url());
  const anonNow = await page.evaluate((k) => !!JSON.parse(localStorage.getItem(k) ?? "null")?.user?.is_anonymous, SESSION_KEY);
  check("no guest account was created", !anonNow);

  // 5. signed-out project link -> sign in -> that project
  await go(projectPath);
  await waitFor(() => path() === "/login", 20000);
  await signInForm();
  check("project link -> sign in -> back to that project", !!(await waitFor(() => path() === projectPath, 40000)), page.url());

  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  fail++;
  log("FAIL crashed", e?.stack ?? e);
} finally {
  await browser?.close();
  for (const id of [keeperId, guestId].filter(Boolean)) {
    const { data: ps } = await admin.from("projects").select("id").eq("owner_id", id);
    for (const p of ps ?? []) {
      for (const t of ["exports", "jobs", "caption_document_versions", "caption_documents", "transcripts", "videos"]) await admin.from(t).delete().eq("project_id", p.id).then(() => {}, () => {});
      await admin.from("projects").delete().eq("id", p.id);
    }
    await admin.from("usage_events").delete().eq("owner_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
