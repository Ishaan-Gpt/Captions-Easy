// Phone-sized real-Chrome test of the upload path: silent video, iPhone-style HEVC, and an oversized clip.
// Needs the frontend on :3000 (TRANSCRIPTION_MODE unset = browser) and the clips in apps/frontend/.e2e-upload/
// (silent.mp4, hevc.mp4, big.mp4 > 50 MB). Run: node apps/frontend/scripts/e2e-upload.mjs
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
const APP = process.env.APP_URL ?? process.env.APP ?? "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms, every = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return null;
}

const email = `e2e-upload-${Date.now()}@example.com`, password = `Pw-${Math.random().toString(36).slice(2)}A1!`;
const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = cu.user.id;
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.signInWithPassword({ email, password });
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
let browser;
const errors = [];
try {
  browser = await puppeteer.launch({
    executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`,
    headless: "shell",
    userDataDir: join(DIR, "profile"), // keeps the downloaded speech model between runs
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-webgpu"],
  });

  for (const c of (process.env.CASES ?? "silent,hevc,big").split(",")) {
    const file = join(DIR, `${c}.mp4`);
    if (!existsSync(file)) { check(`${c}: fixture exists`, false, file); continue; }
    const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title: `Upload ${c}` }).select("id").single();
    const page = await browser.newPage();
    await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36" });
    page.on("pageerror", (e) => errors.push(`${c}: ${e.message}`));
    page.on("console", (m) => (m.type() === "warn" || m.type() === "warning") && log(`${c} console:`, m.text()));
    page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|_vercel\//.test(m.text()) && errors.push(`${c}: ${m.text()}`));
    await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(sess.session));
    await page.goto(`${APP}/projects/${proj.id}`, { waitUntil: "domcontentloaded" });
    const input = await page.waitForSelector("input[type=file]", { timeout: 60000 });
    const t0 = Date.now();
    await input.uploadFile(file);

    const video = await waitFor(async () => (await admin.from("videos").select("*").eq("project_id", proj.id).eq("status", "ready").maybeSingle()).data
      ?? (await admin.from("videos").select("*").eq("project_id", proj.id).eq("status", "uploaded").maybeSingle()).data, 300000);
    const alert = await page.$eval("[role=alert]", (e) => e.textContent).catch(() => null);
    check(`${c}: uploaded without an error message`, !!video && !alert, alert ?? "no video row");
    if (!video) { await page.screenshot({ path: join(DIR, `${c}-fail.png`) }); continue; }
    log(`${c}: uploaded ${(video.file_size / 1048576).toFixed(1)} MB, codec ${video.video_codec}, audio ${video.has_audio} in ${Math.round((Date.now() - t0) / 1000)} s`);

    // big files are no longer shrunk for size: nothing is uploaded, only the browser's own storage matters
    if (c === "big") check("big: kept as it is (no re-encode for size)", video.file_size > 50 * 1048576, video.file_size);
    // HEVC is never refused: played natively, converted to H.264, or (picture unreadable) captioned from the audio alone
    if (c === "hevc") check("hevc: accepted (native, converted, or captions-only)", ["native", "converted", "captions-only"].includes(video.probe_json?.previewMode), JSON.stringify(video.probe_json));
    if (c === "silent") check("silent: recorded as no audio", video.has_audio === false, video.has_audio);

    // every case must end in the editor with a caption document, and no failed job
    const doc = await waitFor(async () => (await admin.from("caption_documents").select("doc").eq("project_id", proj.id).maybeSingle()).data || ((await page.$("text/Couldn")) ? null : null), Number(process.env.WAIT_MS ?? 420000), 3000);
    if (!doc) {
      const { data: js } = await admin.from("jobs").select("kind, status, engine, stage, progress, error_message").eq("project_id", proj.id);
      log(`${c}: jobs`, JSON.stringify(js));
      await page.screenshot({ path: join(DIR, `${c}-stuck.png`) });
    }
    const { data: failed } = await admin.from("jobs").select("id, error_message").eq("project_id", proj.id).eq("status", "failed");
    check(`${c}: captions document created`, !!doc, "timed out");
    check(`${c}: no failed job`, (failed ?? []).length === 0, JSON.stringify(failed));
    if (c === "silent") check("silent: empty document (type captions by hand)", doc?.doc.words.length === 0, doc?.doc.words.length);
    else check(`${c}: speech transcribed in the browser`, (doc?.doc.words.length ?? 0) > 5, doc?.doc.words.map((w) => w.text).join(" "));
    if (doc && c !== "silent") log(`${c}: "${doc.doc.words.map((w) => w.text).join(" ").slice(0, 120)}"`);

    // the editor shows a playable video
    const captionsOnly = video.probe_json?.previewMode === "captions-only";
    const playable = captionsOnly || await waitFor(() => page.evaluate(() => [...document.querySelectorAll("video")].some((v) => v.readyState >= 2 && v.videoWidth > 0)), 20000, 1000);
    check(`${c}: video plays in the editor (or says captions-only)`, playable);
    await page.screenshot({ path: join(DIR, `${c}.png`) });
    await page.close();
  }
  check("no page/console errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser?.close();
  const { data: projs } = await admin.from("projects").select("id").eq("owner_id", uid);
  const pids = (projs ?? []).map((p) => p.id);
  if (pids.length) {
    const { data: vids } = await admin.from("videos").select("storage_path").in("project_id", pids);
    if (vids?.length) await admin.storage.from("media").remove(vids.map((v) => v.storage_path));
    for (const t of ["caption_documents", "jobs", "transcripts", "usage_events", "videos"]) await admin.from(t).delete().in("project_id", pids);
    await admin.from("projects").delete().in("id", pids);
  }
  await admin.from("profiles").delete().eq("id", uid);
  await admin.auth.admin.deleteUser(uid);
  log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
