/* Mobile QA: screenshots every page at phone/tablet widths and reports elements that overflow the viewport.
   Usage: node apps/frontend/scripts/shots-mobile.mjs <outDir> [widths=360,390,768]   (dev server on :3000)
   ONLY=studio,landing limits the pages. Creates a throwaway user + projects and deletes them afterwards. */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(root, "..", "..");
const req = createRequire(join(root, "package.json"));
const { createClient } = req("@supabase/supabase-js");
const puppeteer = req("puppeteer-core");
const out = process.argv[2] ?? join(root, ".shots-mobile");
const widths = (process.argv[3] ?? "360,390,768").split(",").map(Number);
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
mkdirSync(out, { recursive: true });
const env = Object.fromEntries(readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = process.env.APP_URL ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let uid;
const browser = await puppeteer.launch({
  executablePath: join(REPO, "packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"),
  headless: "shell",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

const overflowReport = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(cs.overflowX)) {
        const r = p.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && cs.visibility === "hidden") continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
      bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 4).join(".")} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent || "").trim().slice(0, 30)}"`);
    }
  }
  // tap targets smaller than 32px (buttons/links with text or aria-label)
  const small = [...document.querySelectorAll("button, a, [role=tab], select, input[type=checkbox]")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < window.innerHeight && (r.height < 28 || r.width < 28);
  }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
  return { scroll: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 8), badCount: bad.length, small: small.slice(0, 12), smallCount: small.length };
});

try {
  const email = `e2e-mqa-${Date.now()}@capseasy.test`, password = `Pw-${Date.now()}-x!`;
  const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Demo Creator" } });
  uid = cu.user.id;
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const session = (await anon.auth.signInWithPassword({ email, password })).data.session;
  const token = session.access_token;
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const file = readFileSync(join(REPO, "packages/companion/.e2e-out/input.mp4"));
  const words = "Stop scrolling and watch this incredible trick right now captions made easy for everyone".split(" ").map((t, i) => ({ id: `w${i}`, text: t, startMs: 150 + i * 420, endMs: 150 + i * 420 + 390, ...(t === "incredible" ? { emphasis: "hero" } : {}) }));
  const mk = async (title, w, h, withVideo = true) => {
    const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title, status: withVideo ? "READY" : "CREATED" }).select("id").single();
    if (!withVideo) return proj.id;
    const reg = await (await fetch(`${APP}/api/v1/projects/${proj.id}/videos`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ filename: "clip.mp4", size: file.length, mime: "video/mp4", probe: { durationMs: 6500, width: w, height: h } }) })).json();
    await anon.storage.from("media").uploadToSignedUrl(reg.data.path, reg.data.token, new Blob([file], { type: "video/mp4" }));
    await admin.from("videos").update({ status: "ready", fps: 30, width: w, height: h }).eq("id", reg.data.videoId);
    await admin.from("caption_documents").insert({ project_id: proj.id, owner_id: uid, doc: { version: 2, language: "en", words } });
    return proj.id;
  };
  const portrait = await mk("Morning routine hook with a fairly long title", 720, 1280);
  const landscape = await mk("Podcast ep. 12", 1280, 720);
  const empty = await mk("Empty project", 0, 0, false);

  const pages = [
    ["landing", "/"], ["login", "/login"], ["forgot", "/forgot-password"], ["pair", "/pair?code=ABCD-1234"],
    ["dashboard", "/dashboard"], ["settings", "/settings"],
    ["studio-portrait", `/projects/${portrait}`], ["studio-landscape", `/projects/${landscape}`], ["studio-empty", `/projects/${empty}`],
  ];
  for (const w of widths) {
    const vp = { width: w, height: w >= 768 ? 1024 : 800, isMobile: w < 1024, hasTouch: true, deviceScaleFactor: 2 };
    for (const [name, path] of pages) {
      if (only && !only.some((o) => name.startsWith(o))) continue;
      const page = await browser.newPage();
      await page.setViewport(vp);
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.evaluateOnNewDocument((k, v) => { try { sessionStorage.setItem("ce_loader_seen", "1"); } catch {} localStorage.setItem(k, v); }, `sb-${ref}-auth-token`, JSON.stringify(session));
      await page.goto(APP + path, { waitUntil: "load", timeout: 120000 });
      await sleep(name.startsWith("studio") ? 6000 : name === "landing" ? 4000 : 2500);
      const shots = [[name, null]];
      if (name === "studio-portrait" || name === "studio-landscape") shots.push([`${name}-style`, "Style"], [`${name}-looks`, "Looks"], [`${name}-timeline`, "Timeline"], [`${name}-timing`, "Timing"], [`${name}-export`, "EXPORT"]);
      for (const [shot, tab] of shots) {
        if (tab === "EXPORT") {
          await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Export")?.click());
        } else if (tab) {
          await page.evaluate((t) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes(t))?.click(), tab);
        }
        await sleep(tab ? 1200 : 0);
        const rep = await overflowReport(page);
        if (name === "landing") {
          const h = await page.evaluate(() => document.documentElement.scrollHeight);
          let i = 0;
          for (let y = 0; y < h; y += vp.height) {
            for (let k = 0; k < vp.height; k += 200) { await page.evaluate((v) => window.scrollTo(0, v), y + k); await sleep(90); }
            await page.evaluate((v) => window.scrollTo(0, v), y);
            await sleep(900);
            await page.screenshot({ path: join(out, `${w}-landing-${String(i++).padStart(2, "0")}.png`) });
          }
        } else await page.screenshot({ path: join(out, `${w}-${shot}.png`) });
        console.log(`${w} ${shot}: pageScroll ${rep.scroll}px, overflow ${rep.badCount}${rep.badCount ? "\n    " + rep.bad.join("\n    ") : ""}${rep.smallCount ? `\n    small taps (${rep.smallCount}): ${rep.small.join(" | ")}` : ""}${errs.length ? "\n    errors: " + errs.slice(0, 2).join(" | ") : ""}`);
      }
      await page.close();
    }
  }
} catch (e) {
  console.log("FATAL", e);
} finally {
  await browser.close();
  if (uid) {
    const { data: projs } = await admin.from("projects").select("id").eq("owner_id", uid);
    const pids = (projs ?? []).map((p) => p.id);
    if (pids.length) { for (const t of ["caption_documents", "exports", "jobs", "transcripts", "videos"]) await admin.from(t).delete().in("project_id", pids); await admin.from("projects").delete().in("id", pids); }
    const walk = async (p) => { const { data } = await admin.storage.from("media").list(p, { limit: 100 }); for (const o of data ?? []) { if (o.id) await admin.storage.from("media").remove([`${p}/${o.name}`]); else await walk(`${p}/${o.name}`); } };
    await walk(uid);
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    console.log("cleaned up");
  }
}
