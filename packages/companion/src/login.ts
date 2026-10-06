import { spawn } from "node:child_process";
import { hostname } from "node:os";
import { CompanionApi } from "./api";
import { ensureDirs, saveConfig, type Config } from "./config";
import { log } from "./log";
import { VERSION } from "./system";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function openBrowser(url: string) {
  try {
    const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    spawn(cmd, args as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

/**
 * One-click setup: the web app already created AND approved this code for the signed-in user (it is baked into the
 * downloaded setup file), so there is nothing to confirm in a browser. Single use, short-lived.
 */
export async function loginWithPairCode(cfg: Config, opts: { apiBase?: string; name?: string; pairCode: string }): Promise<Config> {
  ensureDirs();
  const apiBase = (opts.apiBase ?? cfg.apiBase).replace(/\/$/, "");
  const name = opts.name ?? cfg.workerName ?? hostname();
  const api = new CompanionApi(apiBase);
  for (let i = 0; i < 5; i++) {
    const r = await api.deviceToken(opts.pairCode, { workerName: name, platform: process.platform });
    if (r?.status === "approved" && r.token && r.workerId) {
      const next: Config = { ...cfg, apiBase, workerId: r.workerId, token: r.token, workerName: name };
      saveConfig(next);
      log.info(`paired as "${name}" (one-click setup)`);
      console.log(`\n  Connected! "${name}" is now linked to your CaptionsEasy account.\n`);
      return next;
    }
    if (r?.status === "expired" || r?.status === "denied") break;
    await sleep(1500);
  }
  throw new Error("This setup link has expired or was already used. Download a fresh one from the CaptionsEasy website.");
}

/** Device-code pairing (RFC 8628 style): no inbound port, no tunnel, works behind any NAT. */
export async function login(cfg: Config, opts: { apiBase?: string; name?: string; open?: boolean } = {}): Promise<Config> {
  ensureDirs();
  const apiBase = (opts.apiBase ?? cfg.apiBase).replace(/\/$/, "");
  const name = opts.name ?? cfg.workerName ?? hostname();
  const api = new CompanionApi(apiBase);

  const start = await api.deviceStart({ workerName: name, platform: process.platform, version: VERSION });
  if (!start) throw new Error("Could not start pairing.");
  console.log(`\n  Pair this computer with your CapsEasy account\n\n  1. Open:  ${start.verificationUrl}\n  2. Check the code matches:  ${start.userCode}\n  3. Click "Approve"\n`);
  if (opts.open !== false) openBrowser(start.verificationUrl);

  const deadline = Date.now() + start.expiresInSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(start.intervalSeconds * 1000);
    const r = await api.deviceToken(start.deviceCode);
    if (r?.status === "approved" && r.token && r.workerId) {
      const next: Config = { ...cfg, apiBase, workerId: r.workerId, token: r.token, workerName: name };
      saveConfig(next);
      log.info(`paired as "${name}"`);
      console.log('\n  Paired! Start the companion with:  capseasy start\n');
      return next;
    }
    if (r?.status === "denied") throw new Error("Pairing was denied in the browser.");
    if (r?.status === "expired") break;
  }
  throw new Error("Pairing code expired. Run `capseasy login` again.");
}
