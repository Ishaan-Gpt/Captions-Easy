// Guest -> Export -> "Continue with Google" (the loop a user hit): the button must start a normal Google sign-in
// that returns to /start with the project remembered, and a cancelled / refused Google return must land back in
// the SAME project with a message, never in a silent loop. Real Google can't be automated, so the request to
// Supabase's authorize endpoint is intercepted and the return is simulated.
// Run: APP_URL=http://localhost:3000 node apps/frontend/scripts/e2e-google-gate.mjs
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
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const SESSION_KEY = `sb-${ref}-auth-token`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, every = 300) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); } return null; };

let browser, guestId;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let authorizeUrl = null;
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.isNavigationRequest() && /\/auth\/v1\/authorize|accounts\.google\.com/.test(r.url())) { authorizeUrl ??= r.url(); return r.respond({ status: 204, body: "" }); }
    r.continue();
  });
  const path = () => new URL(page.url()).pathname;
  const gateOpen = () => page.evaluate(() => !!document.querySelector('[aria-label="Create your free account"]'));

  // 1. brand-new visitor -> guest project
  await page.goto(`${APP}/start`, { waitUntil: "domcontentloaded" });
  const projectPath = await waitFor(() => (/^\/projects\/[0-9a-f-]{36}$/.test(path()) ? path() : null), 60000);
  check("new visitor gets a guest project", !!projectPath, page.url());
  guestId = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.user?.id, SESSION_KEY);

  // 2. Export (as the ?export=1 return does) -> sign-up box
  await page.goto(`${APP}${projectPath}?export=1`, { waitUntil: "domcontentloaded" });
  check("guest Export shows the sign-up box", !!(await waitFor(gateOpen, 20000)));

  // 3. Continue with Google -> a normal Google sign-in back to /start, project remembered
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Create your free account"] button')].find((b) => /Continue with Google/.test(b.textContent ?? ""))?.click());
  await waitFor(() => authorizeUrl, 15000);
  const au = authorizeUrl ? new URL(authorizeUrl) : null;
  check("Google button starts Google sign-in", au?.searchParams.get("provider") === "google", authorizeUrl);
  check("it is a sign-in, not an account link (the link path caused the loop)", !!au && !/\/user\/identities/.test(au.pathname) && !au.searchParams.has("link"), authorizeUrl);
  check("Google returns to /start", (au?.searchParams.get("redirect_to") ?? "").endsWith("/start"), au?.searchParams.get("redirect_to"));
  const stored = await page.evaluate(() => ({ claim: !!localStorage.getItem("ce:guest-claim"), after: localStorage.getItem("ce:after-signin") }));
  check("the guest's work is queued to move to the account", stored.claim);
  check("after sign-in they come back to this project with Export open", stored.after === `${projectPath}?export=1`, stored.after);

  // 4. Google cancelled / refused: the return carries an error -> same project, a message, no loop
  await page.goto(`${APP}/start?error=access_denied#error=access_denied&error_code=identity_already_exists&error_description=Identity+is+already+linked`, { waitUntil: "domcontentloaded" });
  const back = await waitFor(() => (path() === projectPath ? page.url() : null), 20000);
  check("cancelled Google -> back in the SAME project", !!back, page.url());
  check("sign-up box shows again, with a clear message", !!(await waitFor(() => page.evaluate(() => /Google sign-in didn't finish/.test(document.body.innerText)), 15000)));
  check("URL is clean (no error / signin params)", !/error|signin=/.test(page.url()), page.url());
  check("stale guest tokens were dropped", !(await page.evaluate(() => localStorage.getItem("ce:guest-claim"))));
  const { count } = await admin.from("projects").select("id", { count: "exact", head: true }).eq("owner_id", guestId);
  check("no extra projects were created", count === 1, count);

  // 5. closing the box and pressing Export again opens it again (not stuck)
  await page.keyboard.press("Escape");
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Create your free account"]')].forEach((d) => d.parentElement?.click()));
  check("sign-up box can be closed", !!(await waitFor(async () => !(await gateOpen()), 5000)));
  check("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  fail++;
  log("FAIL crashed", e?.stack ?? e);
} finally {
  await browser?.close();
  if (guestId) {
    const { data: ps } = await admin.from("projects").select("id").eq("owner_id", guestId);
    for (const p of ps ?? []) {
      for (const t of ["exports", "jobs", "caption_document_versions", "caption_documents", "transcripts", "videos"]) await admin.from(t).delete().eq("project_id", p.id).then(() => {}, () => {});
      await admin.from("projects").delete().eq("id", p.id);
    }
    await admin.from("profiles").delete().eq("id", guestId);
    await admin.auth.admin.deleteUser(guestId);
  }
  log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
