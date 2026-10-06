// Loads the dashboard (phone-sized) as a signed-in user, reports every console error / failed request, and checks the
// delete button is visible and works. Needs the frontend on :3000.  node apps/frontend/scripts/check-dashboard.mjs
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
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const email = `chk-${Date.now()}@example.com`, password = `Pw-${Math.random().toString(36).slice(2)}A1!`;
const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = cu.user.id;
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.signInWithPassword({ email, password });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const problems = [];
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    headless: "shell",
    args: ["--no-sandbox"],
  });
  for (const t of ["One", "Two"]) await admin.from("projects").insert({ owner_id: uid, title: `Project ${t}` });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36" });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message.slice(0, 200)));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(`console ${m.type()}: ${m.text().slice(0, 200)}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url().slice(0, 120)}`));
  await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(sess.session));
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2500));
  const btn = await page.$("button[aria-label='Delete project']");
  const visible = btn ? await btn.evaluate((e) => getComputedStyle(e).opacity === "1" && e.getBoundingClientRect().width > 28) : false;
  log("delete button visible on a phone without hovering:", visible);
  if (btn) {
    await btn.tap();
    await page.waitForSelector("text/Delete project", { timeout: 5000 }).catch(() => {});
    const t0 = Date.now();
    const confirm = await page.$$("button");
    for (const b of confirm) if ((await b.evaluate((e) => e.textContent?.trim())) === "Delete project") { await b.tap(); break; }
    await page.waitForFunction(() => !document.body.innerText.includes("Delete this project?"), { timeout: 20000 }).catch(() => {});
    log(`delete finished in ${Date.now() - t0} ms`);
  }
  const { data: left } = await admin.from("projects").select("id").eq("owner_id", uid);
  log("projects left:", left?.length, "(expected 1)");
  log("problems:", problems.length ? "\n  " + [...new Set(problems)].join("\n  ") : "none");
} finally {
  await browser?.close();
  await admin.from("projects").delete().eq("owner_id", uid);
  await admin.auth.admin.deleteUser(uid).catch(() => {});
}
