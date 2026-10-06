// Drives the REAL studio UI in headless Chrome against the live API (captions made in the browser).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { join } from "node:path";

/* Real-browser test of the studio. Needs: frontend dev server on :3000, and a sample speech video at
   packages/companion/.e2e-out/input.mp4 (created by packages/companion/scripts/e2e.mjs) or $E2E_VIDEO.
   Run: node apps/frontend/scripts/e2e-ui.mjs   (screenshots land in apps/frontend/.e2e-ui/shots) */
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = process.env.E2E_OUT ?? join(REPO, "apps", "frontend", ".e2e-ui");
const SHOTS = join(OUT, "shots");
mkdirSync(SHOTS, { recursive: true });
const requireFE = createRequire(`${REPO}/apps/frontend/package.json`);
const { createClient } = requireFE("@supabase/supabase-js");
const puppeteer = requireFE("puppeteer-core");

const env = Object.fromEntries(readFileSync(`${REPO}/apps/frontend/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + String(x).slice(0, 300)); };
const api = async (method, path, token, body) => {
  const r = await fetch(`${APP}/api/v1${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cenv = { ...process.env, CAPSEASY_CONFIG: join(OUT, "cfg"), CAPSEASY_CACHE: join(OUT, "cache"), CAPSEASY_DATA: process.env.E2E_DATA ?? join(OUT, "whisper") };
const CLI = `${REPO}/packages/companion/bin/capseasy.mjs`;
const runCli = (args, onLine) => new Promise((resolve) => {
  const p = spawn(process.execPath, [CLI, ...args], { env: cenv });
  let all = "";
  const feed = (d) => { const s = d.toString(); all += s; s.split(/\r?\n/).forEach((l) => l && onLine?.(l)); };
  p.stdout.on("data", feed); p.stderr.on("data", feed);
  p.on("close", (code) => resolve({ code, all }));
});

let uid, browser;
try {
  // ---------- setup: user, project, uploaded video, paired companion (all through the real API)
  const email = `e2e-ui-${Date.now()}@capseasy.test`, password = `Pw-${Date.now()}-x!`;
  const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  uid = cu.user.id;
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email, password });
  const token = sess.session.access_token;
  await admin.from("profiles").update({ preferences: { whisper_model: "tiny.en" } }).eq("id", uid);
  const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title: "UI E2E", status: "DRAFT" }).select("id").single();
  const pid = proj.id;
  const mp4 = process.env.E2E_VIDEO ?? join(REPO, "packages", "companion", ".e2e-out", "input.mp4");
  check("sample video exists", existsSync(mp4));

  // ---------- 1. UI: empty project shows the upload panel
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  browser = await puppeteer.launch({ executablePath: `${REPO}/packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`, headless: "shell", userDataDir: join(REPO, "apps", "frontend", ".e2e-upload", "profile"), args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/_vercel\/|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(sess.session));
  await page.goto(`${APP}/projects/${pid}`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(() => document.body.innerText.includes("Drop your video here"), { timeout: 60000 });
  check("empty project shows upload panel", true);
  await page.screenshot({ path: join(SHOTS, "1-upload.png") });

  // ---------- 2. UI upload: feed the real file through the actual <input type=file>
  const input = await page.$('input[type="file"]');
  await input.uploadFile(mp4);
  // browser-first: captions are made in this tab, no computer needed
  const t0 = Date.now();
  await page.waitForFunction(() => /Listening|speech model|Getting the audio/i.test(document.body.innerText) || document.querySelector('[aria-label="Timeline"]'), { timeout: 90000 });
  check("after UI upload: captions start in the browser (no 'waiting for computer')", !/Waiting for your computer/.test(await page.evaluate(() => document.body.innerText)));
  await page.screenshot({ path: join(SHOTS, "2-browser-captions.png") });
  await page.waitForFunction(() => document.querySelector('[aria-label="Timeline"]') !== null, { timeout: 300000 });
  log("editor appeared", ((Date.now() - t0) / 1000).toFixed(0), "s after upload");
  check("studio turned into the editor by itself when captions were ready", true);

  // ---------- 3. the optional desktop helper can still be paired from the pair page
  const pair = await browser.newPage();
  await pair.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(sess.session));
  const start = await api("POST", "/device/start", null, { workerName: "Pair Page PC", platform: "win32" });
  await pair.goto(`${APP}/pair?code=${start.data.userCode}`, { waitUntil: "networkidle2", timeout: 60000 });
  await pair.waitForFunction(() => document.body.innerText.includes("Pair Page PC"), { timeout: 30000 });
  await pair.evaluate(() => [...document.querySelectorAll("button")].find((b) => /confirm/i.test(b.textContent))?.click());
  await pair.waitForFunction(() => /now connected/i.test(document.body.innerText), { timeout: 30000 });
  check("pair page (device-code) approves a computer", true);
  await pair.screenshot({ path: join(SHOTS, "3-pair.png") });
  await pair.close();
  await sleep(2500); // fonts + player
  await page.screenshot({ path: join(SHOTS, "4-editor.png") });

  const text = await page.evaluate(() => document.body.innerText);
  check("caption words are listed", /scrolling/i.test(text) && /incredible/i.test(text), text.slice(0, 300));
  check("default look applied and saved", (await admin.from("projects").select("look_id, style_json").eq("id", pid).single()).data.look_id === "hormozi_box");
  const hasVideo = await page.evaluate(() => { const v = document.querySelector("video"); return v ? { rs: v.readyState, w: v.videoWidth, src: !!v.currentSrc } : null; });
  check("Player has a video element with a signed source", !!hasVideo?.src, JSON.stringify(hasVideo));

  // ---------- 4. play: captions should render into the DOM at a spoken moment
  await page.evaluate(() => document.querySelector("video")?.play?.());
  await sleep(2500);
  await page.screenshot({ path: join(SHOTS, "5-playing.png") });

  // ---------- 5. Looks tab
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /Looks/.test(b.textContent))?.click());
  await sleep(800);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Bouncy Single Word/.test(b.textContent))?.click());
  await sleep(1500);
  const { data: afterLook } = await admin.from("projects").select("look_id, template_id, style_json").eq("id", pid).single();
  check("choosing a look persists (look, template, style)", afterLook.look_id === "beast_bounce" && afterLook.template_id === "word_by_word" && afterLook.style_json.fontId === "Luckiest Guy", JSON.stringify(afterLook).slice(0, 200));
  await page.screenshot({ path: join(SHOTS, "6-looks.png") });

  // ---------- 6. Style tab: change size, position
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /Style/.test(b.textContent))?.click());
  await sleep(600);
  await page.screenshot({ path: join(SHOTS, "7-style.png") });

  // ---------- 7. edit a word -> autosave -> server
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /Captions/.test(b.textContent))?.click());
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "incredible")?.click());
  await sleep(500);
  const edit = await page.$('input[aria-label="Edit word"]');
  check("word editor opens on click", !!edit);
  if (edit) {
    await edit.click();
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
    await page.keyboard.type("amazing");
    await page.waitForFunction(() => /Saved/.test(document.body.innerText), { timeout: 20000 });
    await sleep(1200);
    const doc = await api("GET", `/projects/${pid}/document`, token);
    check("edit autosaved to the server (rev bumped, text changed)", doc.data.revision >= 2 && doc.data.doc.words.some((w) => w.text === "amazing") && !doc.data.doc.words.some((w) => w.text === "incredible"), JSON.stringify(doc.data.doc?.words?.map((w) => w.text)));
  }
  await page.screenshot({ path: join(SHOTS, "8-edited.png") });

  // ---------- 8. undo
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await sleep(1800);
  const doc2 = await api("GET", `/projects/${pid}/document`, token);
  check("Ctrl+Z undoes and re-saves", doc2.data.doc.words.some((w) => w.text === "incredible"), JSON.stringify(doc2.data.doc?.words?.map((w) => w.text)));

  // ---------- 8b. new editor features
  page.on("dialog", (d) => void d.accept(d.type() === "prompt" ? "E2E look" : undefined));
  // multi-track timeline: waveform decoded, word blocks rendered
  await page.waitForFunction(() => !/Loading audio/.test(document.body.innerText), { timeout: 30000 });
  const wf = await page.evaluate(() => { const c = [...document.querySelectorAll("canvas")].find((x) => x.getAttribute("aria-hidden") === "true"); return c ? c.width : 0; });
  check("audio waveform decoded and drawn on the timeline", wf > 100, String(wf));
  const before = (await api("GET", `/projects/${pid}/document`, token)).data;
  const target = before.doc.words.find((w) => /scrolling/i.test(w.text));
  const handle = await page.$(`[aria-label="Move end of ${target.text}"]`);
  check("word blocks have drag handles on the timeline", !!handle);
  if (handle) {
    const b = await handle.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 25, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => /Saved/.test(document.body.innerText), { timeout: 20000 });
    await sleep(1500);
    const after = (await api("GET", `/projects/${pid}/document`, token)).data;
    const moved = after.doc.words.find((w) => w.id === target.id);
    check("dragging a word's end handle retimes it (saved)", moved.endMs < target.endMs && moved.endMs > target.startMs, `${target.endMs} -> ${moved.endMs}`);
  }
  await page.screenshot({ path: join(SHOTS, "8b-timeline.png") });

  // saved looks + brand kit
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /Looks/.test(b.textContent))?.click());
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Save look/.test(b.textContent))?.click());
  await page.waitForFunction(() => /E2E look/.test(document.body.innerText), { timeout: 15000 });
  check("'Save current style as a look' saves and lists it under My looks", (await api("GET", "/looks", token)).data?.length === 1);
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /Style/.test(b.textContent))?.click());
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Save current colours/.test(b.textContent))?.click());
  await sleep(2000);
  const brand = await api("GET", "/brand", token);
  check("brand kit saves colours + font", brand.data?.colors?.length >= 2 && !!brand.data.fontId, JSON.stringify(brand.data));
  await page.screenshot({ path: join(SHOTS, "8c-style-brand.png") });

  // SRT import (then undo back so the rest of the test sees the transcript)
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => /Captions/.test(b.textContent))?.click());
  await sleep(500);
  const srtInput = await page.$('input[accept*=".srt"]');
  const srtPath = join(OUT, "import.srt");
  (await import("node:fs")).writeFileSync(srtPath, "1\n00:00:00,500 --> 00:00:02,000\nImported first line\n\n2\n00:00:02,200 --> 00:00:04,000\nand a second one\n");
  await srtInput.uploadFile(srtPath);
  await page.waitForFunction(() => /Imported/.test(document.body.innerText), { timeout: 15000 });
  await page.waitForFunction(() => /Saved/.test(document.body.innerText), { timeout: 20000 });
  await sleep(1500);
  const imp = (await api("GET", `/projects/${pid}/document`, token)).data;
  check("Import SRT replaces the captions (saved)", imp.doc.words.map((w) => w.text).join(" ") === "Imported first line and a second one", JSON.stringify(imp.doc.words.map((w) => w.text)));
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control");
  await sleep(1800);
  const back = (await api("GET", `/projects/${pid}/document`, token)).data;
  check("undo restores the transcript after an import", back.doc.words.some((w) => /incredible/i.test(w.text)), JSON.stringify(back.doc.words.map((w) => w.text)).slice(0, 120));

  // ---------- 9. export modal -> SRT
  await page.evaluate(() => [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Export")?.click());
  await page.waitForFunction(() => !!document.querySelector('[role="dialog"]'), { timeout: 10000 });
  await page.screenshot({ path: join(SHOTS, "9-export.png") });
  check("export modal offers resolution + trim", await page.evaluate(() => /Resolution/.test(document.body.innerText) && /Only export part of the video/.test(document.body.innerText)));
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /\.srt/.test(b.textContent))?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"] button')].some((b) => b.disabled && /Subtitles|Video with captions|overlay|transcript/i.test(b.textContent)), { timeout: 20000 });
  await sleep(500);
  const exps = await api("GET", `/projects/${pid}/exports`, token);
  check("clicking 'Subtitles (.srt)' created a ready export", exps.data.some((e) => e.kind === "srt" && e.status_v2 === "ready"), JSON.stringify(exps.data));
  // browser-first: exactly two choices, MP4 marked as the popular one, and MP4 is made in this tab (never queued)
  const choices = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent).filter((t) => /Video with captions|Subtitles|overlay|transcript|.vtt|.ass/i.test(t)));
  check("export offers only MP4 + SRT", choices.length === 2 && /MP4/.test(choices[0]) && /\.srt/.test(choices[1]), JSON.stringify(choices));
  check("MP4 is marked 'Most popular'", /Most popular/i.test(choices[0] ?? ""), choices[0]);
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => /Video with captions/.test(b.textContent))?.click());
  const started = await page.waitForFunction(() => /Rendering your MP4 in this tab|Your MP4 is downloading|can't make MP4s|WebCodecs/i.test(document.body.innerText), { timeout: 20000 }).then(() => true, () => false);
  const exps2 = await api("GET", `/projects/${pid}/exports`, token);
  check("MP4 renders in the browser (no server render job)", started && !exps2.data.some((e) => e.kind === "mp4"), JSON.stringify(exps2.data.map((e) => e.kind + ":" + e.status_v2)));
  await page.screenshot({ path: join(SHOTS, "10-export-mp4.png") });

  const realErrors = errors.filter((e) => !/favicon|Download the React DevTools|hydrat/i.test(e));
  check("no unexpected browser console errors", realErrors.length === 0, realErrors.slice(0, 4).join(" | "));
} catch (e) {
  fail++; log("FATAL", e?.stack ?? e);
} finally {
  await browser?.close().catch(() => undefined);
  if (uid) {
    const { data: projs } = await admin.from("projects").select("id").eq("owner_id", uid);
    const pids = (projs ?? []).map((p) => p.id);
    if (pids.length) { for (const t of ["exports", "jobs", "transcripts", "videos"]) await admin.from(t).delete().in("project_id", pids); await admin.from("projects").delete().in("id", pids); }
    for (const t of ["workers", "device_codes", "usage_events"]) await admin.from(t).delete().eq("owner_id", uid);
    const walk = async (p) => { const { data } = await admin.storage.from("media").list(p, { limit: 100 }); for (const o of data ?? []) { if (o.id) await admin.storage.from("media").remove([`${p}/${o.name}`]); else await walk(`${p}/${o.name}`); } };
    await walk(uid);
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
  // also remove the pair-page device code created without an owner
  await admin.from("device_codes").delete().eq("worker_name", "Pair Page PC");
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
