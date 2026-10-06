/**
 * One-click "Connect this computer" e2e (Windows): signed-in user -> /device/setup -> the exact setup .cmd the
 * website downloads -> run it (sandboxed LOCALAPPDATA/APPDATA) -> the computer must appear ONLINE under this
 * machine's name with no browser step, and the setup file must delete itself. Cleans up after itself.
 *   node apps/frontend/scripts/e2e-oneclick.mjs      (dev server on :3000, Windows)
 */
import { createClient } from "@supabase/supabase-js";
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const APP = `http://localhost:${process.env.API_PORT ?? "3000"}`;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const box = join(tmpdir(), `ce-oneclick-${Date.now()}`);
const local = join(box, "Local"), roaming = join(box, "Roaming");
mkdirSync(local, { recursive: true }); mkdirSync(roaming, { recursive: true });

const email = `oneclick-${Date.now()}@example.test`;
const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password: "Passw0rd!x" + Date.now(), email_confirm: true });
if (ue) throw ue;
const uid = u.user.id;
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const { data: sess } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
const token = sess.session.access_token;

try {
  // 1. the website asks for a pre-approved setup code
  const r = await fetch(`${APP}/api/v1/device/setup`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const body = await r.json();
  check("setup code issued to the signed-in user", r.status === 201 && body?.data?.pairCode?.length === 64, `HTTP ${r.status}`);
  const anonTry = await fetch(`${APP}/api/v1/device/setup`, { method: "POST" });
  check("setup refuses signed-out requests", anonTry.status === 401);

  // 2. the exact file the website downloads (same generator as ConnectComputer.tsx)
  const cmd = [
    "@echo off", "title CaptionsEasy setup", "echo.", "echo   Setting up CaptionsEasy on this computer. This takes a minute or two...", "echo.",
    `set "CAPSEASY_PAIR=${body.data.pairCode}"`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '${APP}/install.ps1' | iex"`,
    "if errorlevel 1 (", "  echo.", "  echo   Something went wrong.", "  exit /b 1", ")",
    '(goto) 2>nul & del "%~f0"', "",
  ].join("\r\n");
  const file = join(box, "CaptionsEasy-Setup.cmd");
  writeFileSync(file, cmd);

  // 3. "double-click": run it under the default Restricted script policy with sandboxed folders
  const t0 = Date.now();
  const code = await new Promise((resolve) => {
    const p = spawn("cmd.exe", ["/c", file], { env: { ...process.env, LOCALAPPDATA: local, APPDATA: roaming, BROWSER: "none" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    const kill = setTimeout(() => { p.kill(); resolve(-1); }, 8 * 60_000);
    p.on("exit", (c) => { clearTimeout(kill); if (c !== 0) console.log(out.slice(-2500)); resolve(c); });
  });
  check("setup file ran to completion", code === 0, `exit ${code}, ${Math.round((Date.now() - t0) / 1000)}s`);
  check("setup file deleted itself", !existsSync(file));

  // 4. the computer shows up by itself: named after this machine, online, no browser step
  let worker = null;
  for (let i = 0; i < 20 && !worker; i++) {
    const { data } = await admin.from("workers").select("id,name,status,platform,last_seen_at").eq("owner_id", uid);
    worker = data?.find((w) => w.status === "online") ?? null;
    if (!worker) await sleep(2000);
  }
  check("computer is connected and online", !!worker);
  check("computer is named after this machine", worker?.name === hostname(), worker?.name);
  const { data: again } = await admin.from("device_codes").select("status").eq("owner_id", uid);
  check("setup code was consumed (single use)", again?.every((d) => d.status === "consumed"), JSON.stringify(again));
  const reuse = await fetch(`${APP}/api/v1/device/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceCode: body.data.pairCode }) });
  check("reusing the code is refused", (await reuse.json())?.data?.status === "expired");
} finally {
  // stop the sandboxed Companion, undo PATH changes, delete the test account
  try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -like '*${box.replace(/\\/g, "\\\\")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: "ignore" }); } catch {}
  try { execSync(`powershell -NoProfile -Command "$u=[Environment]::GetEnvironmentVariable('Path','User'); $c=($u -split ';' | Where-Object { $_ -and $_ -notlike '*ce-oneclick-*' }) -join ';'; [Environment]::SetEnvironmentVariable('Path',$c,'User')"`, { stdio: "ignore" }); } catch {}
  await admin.from("workers").delete().eq("owner_id", uid);
  await admin.from("device_codes").delete().eq("owner_id", uid);
  await admin.auth.admin.deleteUser(uid);
  await sleep(500);
  rmSync(box, { recursive: true, force: true, maxRetries: 5 });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
