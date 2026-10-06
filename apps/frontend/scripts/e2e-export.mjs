// Signed-in creator, real Chrome: upload a speech clip -> captions made in the browser -> edit a word ->
// export the MP4 in the tab and the SRT -> both files land on disk and are valid (ffprobe for the MP4).
// Run: APP_URL=https://www.captionseasy.com node apps/frontend/scripts/e2e-export.mjs   (throwaway user, self-cleaning)
// LOOK="Prism Forge" picks that gallery look before exporting and saves frames of the MP4 to .e2e-export/ (export parity).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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
const VIDEO = process.env.E2E_VIDEO ?? join(REPO, "packages", "companion", ".e2e-out", "input.mp4");
const OUT = join(REPO, "apps", "frontend", ".e2e-export");
const DL = join(OUT, "downloads");
rmSync(DL, { recursive: true, force: true });
rmSync(join(OUT, "profile"), { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, every = 500) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
const files = () => readdirSync(DL).filter((f) => !f.endsWith(".crdownload") && !f.endsWith(".tmp"));
const ffprobe = () => {
  const dir = join(REPO, "node_modules", ".pnpm");
  const pkg = readdirSync(dir).find((d) => d.startsWith("@remotion+compositor-win32-x64-msvc"));
  return pkg ? join(dir, pkg, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffprobe.exe") : "ffprobe";
};

const email = `e2e-export-${Date.now()}@example.com`;
const password = "export-pass-123";
let browser, userId;
try {
  if (!existsSync(VIDEO)) throw new Error(`sample video missing: ${VIDEO}`);
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = created.user.id;

  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], userDataDir: join(OUT, "profile") });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*(404|401)/i.test(m.text())) errors.push("console: " + m.text()); });
  const path = () => new URL(page.url()).pathname;
  const clickText = (t) => page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a")].find((b) => !b.disabled && (b.textContent?.trim() === t || b.textContent?.trim().startsWith(t)));
    el?.click();
    return !!el;
  }, t);

  // 1. sign in through the real form
  await page.goto(`${APP}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector("input[type=email]", { timeout: 30000 });
  await page.type("input[type=email]", email);
  await page.type("input[type=password]", password);
  await page.keyboard.press("Enter");
  check("sign in -> dashboard", !!(await waitFor(() => path() === "/dashboard", 40000)), page.url());

  // 2. new project from the dashboard
  await waitFor(() => clickText("+ New project"), 20000);
  await page.waitForSelector('input[placeholder^="e.g."]', { timeout: 10000 });
  await page.type('input[placeholder^="e.g."]', "Launch test clip");
  await page.keyboard.press("Enter");
  const projectPath = await waitFor(() => (/^\/projects\/[0-9a-f-]{36}$/.test(path()) ? path() : null), 30000);
  check("New project opens the studio", !!projectPath, page.url());
  const projectId = projectPath?.split("/")[2];

  // 3. upload -> captions in the browser
  const input = await page.waitForSelector("input[type=file]", { timeout: 30000 });
  const t0 = Date.now();
  await input.uploadFile(VIDEO);
  if (await waitFor(() => page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.startsWith("English"))), 15000)) await clickText("English");
  const words = await waitFor(() => page.evaluate(() => /incredible/i.test(document.body.innerText) && !!document.querySelector('[aria-label="Captions"]')), 600000, 2000);
  check(`captions appear in the editor (${Math.round((Date.now() - t0) / 1000)} s)`, !!words);
  await page.screenshot({ path: join(OUT, "1-editor.png") });
  if (process.env.LOOK) {
    await clickText("Looks");
    check(`look "${process.env.LOOK}" chosen`, !!(await waitFor(() => clickText(process.env.LOOK), 15000)));
    await sleep(2500); // autosave
    await clickText("Style");
  }

  // 4. Export -> MP4 in the tab
  check("Export opens the export dialog", !!(await waitFor(async () => (await clickText("Export")) && page.evaluate(() => !!document.querySelector('[role=dialog][aria-label="Export"]')), 30000)));
  const mp4Enabled = await waitFor(() => page.evaluate(() => {
    const b = [...document.querySelectorAll('[aria-label="Export"] button')].find((x) => x.textContent?.includes("Video with captions"));
    return b && !b.disabled ? true : null;
  }), 20000);
  check("MP4 option is available in this browser", !!mp4Enabled, await page.evaluate(() => document.querySelector('[aria-label="Export"]')?.textContent?.slice(0, 300)));
  const e0 = Date.now();
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Export"] button')].find((x) => x.textContent?.includes("Video with captions"))?.click());
  const progress = await waitFor(() => page.evaluate(() => /Rendering your MP4 in this tab/.test(document.body.innerText)), 15000);
  check("shows render progress", !!progress);
  const done = await waitFor(() => page.evaluate(() => document.body.innerText.match(/Your MP4 is downloading \(([^)]+)\)/)?.[1] ?? (document.querySelector('[aria-label="Export"] [role=alert]')?.textContent || null)), 300000, 1000);
  await page.screenshot({ path: join(OUT, "2-export.png") });
  check(`MP4 rendered (${Math.round((Date.now() - e0) / 1000)} s): ${done}`, !!done && !/Couldn't/.test(done), done);
  const mp4 = await waitFor(() => files().find((f) => f.endsWith(".mp4")), 30000);
  check("MP4 file downloaded", !!mp4, files().join(","));
  if (mp4) {
    const f = join(DL, mp4);
    let probe = {};
    try { probe = JSON.parse(execFileSync(ffprobe(), ["-v", "error", "-show_streams", "-show_format", "-of", "json", f]).toString()); } catch (e) { probe = { error: String(e) }; }
    const v = probe.streams?.find((s) => s.codec_type === "video");
    const a = probe.streams?.find((s) => s.codec_type === "audio");
    const dur = Number(probe.format?.duration ?? 0);
    check(`MP4 is valid H.264 video (${v?.codec_name} ${v?.width}x${v?.height}, ${statSync(f).size} bytes)`, v?.codec_name === "h264" && v.width > 0, JSON.stringify(probe).slice(0, 300));
    check(`MP4 keeps the audio (${a?.codec_name})`, !!a, JSON.stringify(probe.streams?.map((s) => s.codec_type)));
    check(`MP4 duration matches the clip (${dur.toFixed(2)} s)`, dur > 5 && dur < 8, dur);
    if (process.env.LOOK) {
      const ffmpeg = ffprobe().replace(/ffprobe(\.exe)?$/, (m, ext) => `ffmpeg${ext ?? ""}`);
      for (const t of [1.2, 2.2, 3.2, 4.2]) execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(t), "-i", f, "-frames:v", "1", join(OUT, `frame-${t}.png`)]);
      log("frames saved to", OUT);
    }
  }

  // 5. SRT
  await clickText("Subtitles file");
  const srt = await waitFor(() => files().find((f) => f.endsWith(".srt")), 30000);
  check("SRT downloaded", !!srt, files().join(","));
  if (srt) {
    const text = readFileSync(join(DL, srt), "utf8");
    check("SRT has timed cues with the spoken words", /00:00:0\d,\d{3} --> /.test(text) && /incredible/i.test(text), text.slice(0, 200));
  }

  // 6. close, reload: work is still there
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  check("after reload the captions are still there", !!(await waitFor(() => page.evaluate(() => /incredible/i.test(document.body.innerText)), 60000)));
  const { data: proj } = await admin.from("projects").select("id").eq("id", projectId).maybeSingle();
  check("project saved to the account", !!proj);
  check("no page/console errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  fail++;
  log("FAIL crashed", e?.stack ?? e);
} finally {
  await browser?.close();
  if (userId) {
    const { data: ps } = await admin.from("projects").select("id").eq("owner_id", userId);
    for (const p of ps ?? []) {
      for (const t of ["exports", "jobs", "caption_document_versions", "caption_documents", "transcripts", "videos"]) await admin.from(t).delete().eq("project_id", p.id).then(() => {}, () => {});
      await admin.from("projects").delete().eq("id", p.id);
    }
    await admin.from("usage_events").delete().eq("owner_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
  log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
