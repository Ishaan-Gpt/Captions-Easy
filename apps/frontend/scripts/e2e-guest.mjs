// Guest journey in real Chrome: no account -> studio -> upload -> captions -> Export asks to sign up -> the
// account keeps the project -> stale guests are cleaned up. Needs the app on :3000 started with
// CRON_SECRET=<x> GUEST_STALE_DAYS=0, anonymous sign-ins ON in Supabase, and
// packages/companion/.e2e-out/input.mp4. Run: CRON_SECRET=<x> node apps/frontend/scripts/e2e-guest.mjs
// WARNING: with GUEST_STALE_DAYS=0 the cleanup removes EVERY guest; only run against a project without real guests.
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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, every = 1500) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const api = async (method, path, token, body) => {
  const r = await fetch(`${APP}/api/v1${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
let browser, guestId, keeperId;
try {
  browser = await puppeteer.launch({
    executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    headless: "shell",
    userDataDir: join(REPO, "apps", "frontend", ".e2e-upload", "profile"), // cached speech model
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile Chrome/140" });
  await page.evaluateOnNewDocument(() => localStorage.clear()); // a brand-new visitor
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. "Start free" with no account goes straight into a project
  await page.goto(`${APP}/start`, { waitUntil: "domcontentloaded" });
  const projectUrl = await waitFor(() => (/\/projects\/[0-9a-f-]{36}/.test(page.url()) ? page.url() : null), 30000, 500);
  check("no account: /start opens a studio project", !!projectUrl, page.url());
  const session = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), `sb-${ref}-auth-token`);
  guestId = session?.user?.id;
  check("visitor is an anonymous guest", !!session?.user?.is_anonymous, JSON.stringify(session?.user ?? null).slice(0, 120));

  // 2. guests can upload and get captions
  const input = await page.waitForSelector("input[type=file]", { timeout: 30000 });
  await input.uploadFile(join(REPO, "packages", "companion", ".e2e-out", "input.mp4"));
  const projectId = projectUrl.match(/projects\/([0-9a-f-]{36})/)[1];
  const doc = await waitFor(async () => (await admin.from("caption_documents").select("doc").eq("project_id", projectId).maybeSingle()).data, 300000, 3000);
  check("guest: upload + in-browser captions", (doc?.doc.words.length ?? 0) > 5, doc?.doc.words.length);

  // 2b. the video stays on the device: nothing in our storage for this user
  const { data: vrow } = await admin.from("videos").select("storage_path").eq("project_id", projectId).single();
  const { data: stored } = await admin.rpc("user_storage_paths", { p_user: guestId });
  check("video kept on the device (not uploaded)", vrow.storage_path.startsWith("local:") && (stored ?? []).length === 0, JSON.stringify({ path: vrow.storage_path, stored }));

  // 3. Export asks for an account; the API refuses guest exports
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export" && !b.disabled), { timeout: 30000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Export")?.click());
  const gate = await page.waitForSelector('[aria-label="Create your free account"]', { timeout: 10000 }).catch(() => null);
  check("guest: Export opens the sign-up step (not the export dialog)", !!gate && !(await page.$('[aria-label="Export"]')));
  const blocked = await api("POST", `/projects/${projectId}/exports`, session.access_token, { kind: "srt" });
  check("guest: API refuses exports (403)", blocked.status === 403, JSON.stringify(blocked));
  await page.screenshot({ path: join(REPO, "apps", "frontend", ".e2e-upload", "guest-gate.png") });

  // 4. becoming a real account keeps the same user id and project, and unlocks export
  // (email set by admin here: the real flow sends a confirmation email we can't open in a test)
  const email = `e2e-guest-${Date.now()}@example.com`;
  const password = `Pw-${Date.now()}aA1!`;
  await admin.auth.admin.updateUserById(guestId, { email, email_confirm: true, password });
  keeperId = guestId;
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, anonKey, { auth: { persistSession: false } });
  const { data: signed } = await anon.auth.signInWithPassword({ email, password });
  const token = signed.session?.access_token;
  check("signed up: same user id", signed.session?.user.id === guestId, signed.session?.user.id);
  const owned = await admin.from("projects").select("id").eq("id", projectId).eq("owner_id", guestId).maybeSingle();
  check("signed up: project still theirs", !!owned.data);
  const allowed = token ? await api("POST", `/projects/${projectId}/exports`, token, { kind: "srt" }) : { status: 0 };
  check("signed up: export works", allowed.status === 201 || allowed.status === 200, JSON.stringify(allowed).slice(0, 200));

  // 4b. "another device": same account, no saved video -> pick the file again -> editor
  const other = await browser.createBrowserContext();
  const p2page = await other.newPage();
  await p2page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile Chrome/140" });
  await p2page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(signed.session));
  await p2page.goto(projectUrl, { waitUntil: "domcontentloaded" });
  const asked = await p2page.waitForFunction(() => /Select your video to continue/.test(document.body.innerText), { timeout: 30000 }).then(() => true, () => false);
  check("other device: asks for the same video (captions kept)", asked);
  const reInput = await p2page.$("input[type=file]");
  await reInput?.uploadFile(join(REPO, "packages", "companion", ".e2e-out", "input.mp4"));
  const editor = await p2page.waitForFunction(() => document.querySelector('[aria-label="Timeline"]') || /Captions|Style/.test(document.body.innerText) && !/Select your video/.test(document.body.innerText), { timeout: 30000 }).then(() => true, () => false);
  check("other device: editor opens after picking the video", editor);

  // 4c. delete from the studio removes the project for good
  p2page.on("dialog", (d) => void d.accept());
  await p2page.evaluate(() => document.querySelector('[aria-label="Delete project"]')?.click());
  const left = await waitFor(async () => !(await admin.from("projects").select("id").eq("id", projectId).maybeSingle()).data, 20000, 1000);
  const { data: leftDoc } = await admin.from("caption_documents").select("project_id").eq("project_id", projectId).maybeSingle();
  check("delete: project and captions removed", !!left && !leftDoc, JSON.stringify({ left, leftDoc }));
  await other.close();

  // 5. cleanup: a stale guest with a project + file is removed; the signed-up user is untouched
  const { data: g2 } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, anonKey, { auth: { persistSession: false } }).auth.signInAnonymously();
  const staleId = g2.user.id;
  const { data: p2 } = await admin.from("projects").insert({ owner_id: staleId, title: "Stale guest" }).select("id").single();
  await admin.storage.from("media").upload(`${staleId}/${p2.id}/source/x.txt`, new Blob(["x"]), { contentType: "text/plain" });
  const cron = await fetch(`${APP}/api/cron/cleanup`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  log("cleanup:", JSON.stringify(cron));
  const gone = (await admin.auth.admin.getUserById(staleId)).data.user === null;
  const { data: leftFiles } = await admin.storage.from("media").list(`${staleId}/${p2.id}/source`);
  const { data: leftProj } = await admin.from("projects").select("id").eq("id", p2.id).maybeSingle();
  check("cleanup: stale guest, project and files removed", gone && !leftProj && (leftFiles ?? []).length === 0, JSON.stringify({ gone, leftProj, files: leftFiles?.length }));
  check("cleanup: signed-up user kept", !!(await admin.auth.admin.getUserById(keeperId)).data.user);
  const unauth = await fetch(`${APP}/api/cron/cleanup`);
  check("cleanup: refuses calls without the secret", unauth.status === 401, unauth.status);
  check("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser?.close();
  for (const id of [keeperId ?? guestId].filter(Boolean)) {
    const { data: ps } = await admin.from("projects").select("id").eq("owner_id", id);
    const ids = (ps ?? []).map((p) => p.id);
    if (ids.length) {
      const { data: objs } = await admin.rpc("user_storage_paths", { p_user: id });
      const media = (objs ?? []).filter((o) => o.bucket === "media").map((o) => o.name);
      if (media.length) await admin.storage.from("media").remove(media);
      for (const t of ["exports", "caption_documents", "jobs", "transcripts", "usage_events", "videos"]) await admin.from(t).delete().in("project_id", ids);
      await admin.from("projects").delete().in("id", ids);
    }
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
