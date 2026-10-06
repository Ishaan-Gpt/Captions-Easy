// Windows-only (uses SAPI text-to-speech to make a spoken test clip). Needs the frontend dev server running.
// Usage: node packages/companion/scripts/e2e.mjs   (env: API_PORT, E2E_MODEL=tiny.en, E2E_DATA=<whisper cache dir>)
// Full-stack test: real speech video -> upload -> pair a REAL companion process -> local whisper.cpp
// transcription -> edit -> burned-in MP4 + transparent overlay renders -> inspect output.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = process.env.E2E_OUT ?? join(REPO, "packages", "companion", ".e2e-out");
mkdirSync(OUT, { recursive: true });
const requireFE = createRequire(`${REPO}/apps/frontend/package.json`);
const requireCP = createRequire(`${REPO}/packages/companion/package.json`);
const { createClient } = requireFE("@supabase/supabase-js");
const { RenderInternals } = requireCP("@remotion/renderer");
const ffmpeg = RenderInternals.getExecutablePath({ type: "ffmpeg", indent: false, logLevel: "error", binariesDirectory: null });

const env = Object.fromEntries(readFileSync(`${REPO}/apps/frontend/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const PORT = process.env.API_PORT ?? "3000";
const API = `http://localhost:${PORT}`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); log(c ? "PASS" : "FAIL", n, c ? "" : "-> " + x); };
const call = async (method, path, token, body) => {
  const r = await fetch(`${API}/api/v1${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

const companionEnv = { ...process.env, CAPSEASY_CONFIG: join(OUT, "cfg"), CAPSEASY_CACHE: join(OUT, "cache"), CAPSEASY_DATA: process.env.E2E_DATA ?? join(OUT, "data") };
const CLI = process.env.CAPSEASY_CLI ?? `${REPO}/packages/companion/bin/capseasy.mjs`;
const runCli = (args, onLine) => new Promise((resolve) => {
  const p = spawn(process.execPath, [CLI, ...args], { env: companionEnv });
  let all = "";
  const feed = (d) => { const s = d.toString(); all += s; s.split(/\r?\n/).forEach((l) => l && (console.log("   [companion]", l), onLine?.(l))); };
  p.stdout.on("data", feed); p.stderr.on("data", feed);
  p.on("close", (code) => resolve({ code, all }));
});

let uid;
try {
  // ---------- 1. make a real speech video
  const wav = join(OUT, "speech.wav"), mp4 = join(OUT, "input.mp4");
  const text = "Stop scrolling and watch this incredible trick right now. Captions made easy for everyone!";
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 0; $s.SetOutputToWaveFile('${wav.replace(/\//g, "\\")}'); $s.Speak('${text}'); $s.Dispose()`], { encoding: "utf8" });
  check("TTS wav generated", existsSync(wav) && statSync(wav).size > 10000, ps.stderr);
  const bg = join(OUT, "bg.png");
  const sharp = createRequire(`${REPO}/packages/compositions/package.json`)("sharp");
  await sharp({ create: { width: 720, height: 1280, channels: 3, background: "#1f3a5f" } }).png().toFile(bg);
  const ff = spawnSync(ffmpeg, ["-y", "-loop", "1", "-framerate", "30", "-i", bg, "-i", wav, "-vf", "format=yuv420p", "-c:v", "libx264", "-c:a", "aac", "-shortest", mp4], { encoding: "utf8" });
  check("test mp4 encoded with bundled ffmpeg", ff.status === 0 && existsSync(mp4), (ff.stderr ?? "").slice(-300));
  const size = statSync(mp4).size;
  const probeOut = spawnSync(RenderInternals.getExecutablePath({ type: "ffprobe", indent: false, logLevel: "error", binariesDirectory: null }), ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp4], { encoding: "utf8" });
  const durationMs = Math.round(parseFloat(probeOut.stdout) * 1000);
  log("video", size, "bytes", durationMs, "ms");

  // ---------- 2. user + project + upload
  const email = `e2e-comp-${Date.now()}@capseasy.test`, password = `Pw-${Date.now()}-x!`;
  const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (ce) throw ce;
  uid = cu.user.id;
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email, password });
  const token = sess.session.access_token;
  await admin.from("profiles").update({ preferences: { whisper_model: process.env.E2E_MODEL ?? "tiny.en" } }).eq("id", uid);
  const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title: "Companion E2E", status: "DRAFT" }).select("id").single();
  const pid = proj.id;

  const reg = await call("POST", `/projects/${pid}/videos`, token, { filename: "input.mp4", size, mime: "video/mp4", probe: { durationMs, width: 720, height: 1280, fps: 30, hasAudio: true } });
  check("register video", reg.status === 201, JSON.stringify(reg));
  const up = await anon.storage.from("media").uploadToSignedUrl(reg.data.path, reg.data.token, new Blob([readFileSync(mp4)], { type: "video/mp4" }));
  check("upload real video", !up.error, JSON.stringify(up.error));
  const done = await call("POST", `/videos/${reg.data.videoId}/complete`, token, {});
  check("complete -> transcribe queued", done.status === 200, JSON.stringify(done));

  // ---------- 3. pair a real companion
  let userCode = null;
  const loginRun = runCli(["login", "--api", API, "--no-open", "--name", "E2E Companion"], (l) => {
    const m = /Check the code matches:\s+([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(l);
    if (m && !userCode) { userCode = m[1]; call("POST", "/device/approve", token, { userCode }).then((r) => log("approve ->", r.status)); }
  });
  const lr = await loginRun;
  check("companion paired via device code", lr.code === 0 && /Paired!/.test(lr.all), lr.all.slice(-300));
  const cfg = JSON.parse(readFileSync(join(OUT, "cfg", "config.json"), "utf8"));
  check("config holds a cpe_ token", cfg.token?.startsWith("cpe_"));

  // ---------- 4. transcribe locally
  const t0 = Date.now();
  const tr = await runCli(["start", "--once"]);
  log("transcribe run took", ((Date.now() - t0) / 1000).toFixed(1), "s");
  check("companion exited cleanly after job", tr.code === 0, tr.all.slice(-400));
  check("log says job completed", /transcribe started/.test(tr.all) && /completed/.test(tr.all), tr.all.slice(-500));
  const doc = await call("GET", `/projects/${pid}/document`, token);
  const words = doc.data?.doc?.words ?? [];
  const spoken = words.map((w) => w.text.toLowerCase().replace(/[^a-z]/g, "")).join(" ");
  log("transcript:", spoken);
  check("transcript has words with timing", words.length >= 8 && words.every((w) => w.endMs > w.startMs), JSON.stringify(words.slice(0, 3)));
  check("transcript is accurate (scrolling/incredible/trick)", ["scrolling", "incredible", "trick"].filter((k) => spoken.includes(k)).length >= 2, spoken);
  const { data: pstat } = await admin.from("projects").select("status").eq("id", pid).single();
  check("project status READY", pstat.status === "READY", pstat.status);

  // ---------- 5. style + exports
  const style = { templateId: "sentence_highlight", fontId: "Anton", fontWeight: 900, fontSize: 64, casing: "upper", stroke: { enabled: true, width: 4, color: "#000000" }, active: { effect: "pop", color: "#FFE600", scale: 1.12, boxRadius: 12 }, position: { x: 0.5, y: 0.7 } };
  await admin.from("projects").update({ style_json: style, look_id: "hormozi_viral", settings_json: { maxWordsPerCard: 3 } }).eq("id", pid);
  const exp = await call("POST", `/projects/${pid}/exports`, token, { kind: "mp4", crf: 23 });
  check("mp4 export queued", exp.status === 202, JSON.stringify(exp));
  const exp2 = await call("POST", `/projects/${pid}/exports`, token, { kind: "mov_alpha" });
  check("overlay export queued", exp2.status === 202, JSON.stringify(exp2));

  const t1 = Date.now();
  const r1 = await runCli(["start", "--once"]);
  log("render 1 took", ((Date.now() - t1) / 1000).toFixed(1), "s");
  const r2 = await runCli(["start", "--once"]);
  check("both renders completed", r1.code === 0 && r2.code === 0 && (r1.all + r2.all).match(/completed/g)?.length >= 2, (r1.all + r2.all).slice(-600));

  for (const [label, e] of [["mp4", exp.data], ["mov_alpha", exp2.data]]) {
    const { data: row } = await admin.from("exports").select("status_v2, storage_path, file_size").eq("id", e.exportId).single();
    check(`${label} export ready in DB`, row.status_v2 === "ready" && row.file_size > 1000, JSON.stringify(row));
    const dl = await call("GET", `/exports/${e.exportId}/download`, token);
    const bin = Buffer.from(await (await fetch(dl.data.url)).arrayBuffer());
    const f = join(OUT, `export_${label}.${label === "mp4" ? "mp4" : "mov"}`);
    writeFileSync(f, bin);
    const pr = spawnSync(RenderInternals.getExecutablePath({ type: "ffprobe", indent: false, logLevel: "error", binariesDirectory: null }), ["-v", "error", "-show_entries", "stream=codec_name,pix_fmt,width,height:format=duration", "-of", "default=nw=1", f], { encoding: "utf8" });
    log(label, "->", pr.stdout.replace(/\r?\n/g, " | "));
    check(`${label} file is valid media (${bin.length} B)`, pr.status === 0 && /duration=/.test(pr.stdout), pr.stderr);
    if (label === "mp4") check("mp4 duration matches source (±0.3s)", Math.abs(parseFloat(/duration=([\d.]+)/.exec(pr.stdout)?.[1]) * 1000 - durationMs) < 300, pr.stdout);
    if (label === "mov_alpha") check("overlay is ProRes 4444 with alpha", /prores/.test(pr.stdout) && /yuva444p/.test(pr.stdout), pr.stdout);
    // grab a frame for visual inspection (2s in)
    spawnSync(ffmpeg, ["-y", "-ss", "1.5", "-i", f, "-frames:v", "1", join(OUT, `frame_${label}.png`)], { encoding: "utf8" });
  }
} catch (e) {
  fail++; console.log("FATAL", e);
} finally {
  if (uid) {
    const { data: projs } = await admin.from("projects").select("id").eq("owner_id", uid);
    const pids = (projs ?? []).map((p) => p.id);
    if (pids.length) for (const t of ["exports", "jobs", "transcripts", "videos"]) await admin.from(t).delete().in("project_id", pids);
    if (pids.length) await admin.from("projects").delete().in("id", pids);
    for (const t of ["workers", "device_codes", "usage_events"]) await admin.from(t).delete().eq("owner_id", uid);
    const walk = async (p) => { const { data } = await admin.storage.from("media").list(p, { limit: 100 }); for (const o of data ?? []) { if (o.id) await admin.storage.from("media").remove([`${p}/${o.name}`]); else await walk(`${p}/${o.name}`); } };
    await walk(uid);
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
