/* Visual QA of the signed-in app (studio, dashboard, settings) at desktop + phone widths.
   Creates a throwaway user + project with a real video and captions, screenshots, then deletes everything.
   Usage: node apps/frontend/scripts/shots-app.mjs <outDir>   (dev server on :3000; needs packages/companion/.e2e-out/input.mp4) */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(root, "..", "..");
const req = createRequire(join(root, "package.json"));
const { createClient } = req("@supabase/supabase-js");
const puppeteer = req("puppeteer-core");
const out = process.argv[2] ?? join(root, ".shots");
mkdirSync(out, { recursive: true });
const env = Object.fromEntries(readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let uid;
const browser = await puppeteer.launch({
  executablePath: join(REPO, "packages/compositions/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"),
  headless: "shell",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
try {
  const email = `e2e-shots-${Date.now()}@capseasy.test`, password = `Pw-${Date.now()}-x!`;
  const { data: cu } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Demo Creator" } });
  uid = cu.user.id;
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const session = (await anon.auth.signInWithPassword({ email, password })).data.session;
  const token = session.access_token;
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

  // project with a real uploaded video + captions
  const { data: proj } = await admin.from("projects").insert({ owner_id: uid, title: "Morning routine hook", status: "READY" }).select("id").single();
  for (const t of ["Podcast ep. 12", "Product launch teaser", "Hinglish vlog"]) await admin.from("projects").insert({ owner_id: uid, title: t, status: t.startsWith("Pod") ? "COMPLETED" : "CREATED" });
  const file = readFileSync(process.env.E2E_VIDEO ?? join(REPO, "packages/companion/.e2e-out/input.mp4"));
  const reg = await (await fetch(`${APP}/api/v1/projects/${proj.id}/videos`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ filename: "clip.mp4", size: file.length, mime: "video/mp4", probe: { durationMs: 6500, width: 720, height: 1280 } }) })).json();
  await anon.storage.from("media").uploadToSignedUrl(reg.data.path, reg.data.token, new Blob([file], { type: "video/mp4" }));
  await admin.from("videos").update({ status: "ready", fps: 30 }).eq("id", reg.data.videoId);
  const words = "Stop scrolling and watch this incredible trick right now captions made easy for everyone".split(" ").map((t, i) => ({ id: `w${i}`, text: t, startMs: 150 + i * 420, endMs: 150 + i * 420 + 390, ...(t === "incredible" ? { emphasis: "hero" } : {}) }));
  await admin.from("caption_documents").insert({ project_id: proj.id, owner_id: uid, doc: { version: 2, language: "en", words } });

  const shots = [
    ["studio", `/projects/${proj.id}`, 6000],
    ["dashboard", "/dashboard", 2500],
    ["settings", "/settings", 2500],
  ];
  for (const [vpName, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    for (const [name, path, wait] of shots) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${ref}-auth-token`, JSON.stringify(session));
      await page.goto(APP + path, { waitUntil: "load", timeout: 120000 });
      await sleep(wait);
      if (name === "studio") {
        // seek to a spoken moment so captions are on screen, and select a word so the toolbar is active
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "incredible")?.click());
        await sleep(1500);
      }
      await page.screenshot({ path: join(out, `${vpName}-${name}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${vpName}-${name}: overflow ${overflow}px${errs.length ? " errors: " + errs.slice(0, 2).join(" | ") : ""}`);
      if (name === "studio" && vpName === "phone") {
        for (const tab of ["Style", "Looks", "Timeline"]) {
          await page.evaluate((t) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes(t))?.click(), tab);
          await sleep(1200);
          await page.screenshot({ path: join(out, `phone-studio-${tab.toLowerCase()}.png`) });
        }
      }
      if (name === "studio" && vpName === "desktop") {
        await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes("Looks"))?.click());
        await sleep(1500);
        await page.screenshot({ path: join(out, "desktop-studio-looks.png") });
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
