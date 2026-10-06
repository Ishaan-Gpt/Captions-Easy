import { rmSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { ensureBrowser } from "@remotion/renderer";
import { WHISPER_MODELS } from "@capseasy/shared";
import { CompanionApi } from "./api";
import { dirs, ensureDirs, loadConfig, saveConfig } from "./config";
import { login, loginWithPairCode } from "./login";
import { autostartEnabled, autostartPath, disableAutostart, enableAutostart } from "./autostart";
import { runCompanion } from "./loop";
import { buildCapabilities, diskFreeGb, VERSION } from "./system";
import { ensureModel, ensureWhisperBinary, installedModels } from "./whisper";
import type { WhisperModel } from "@remotion/install-whisper-cpp";

const program = new Command().name("capseasy").description("CapsEasy Companion: transcribes and renders on your own computer").version(VERSION);

program
  .command("login")
  .description("Pair this computer with your CapsEasy account")
  .option("--api <url>", "CapsEasy web app URL")
  .option("--name <name>", "Name shown in the web app")
  .option("--no-open", "Do not open the browser automatically")
  .option("--pair-code <code>", "Pre-approved code from a one-click setup file (no browser step)")
  .action(async (o: { api?: string; name?: string; open: boolean; pairCode?: string }) => {
    ensureDirs();
    if (o.pairCode) await loginWithPairCode(loadConfig(), { apiBase: o.api, name: o.name, pairCode: o.pairCode });
    else await login(loadConfig(), { apiBase: o.api, name: o.name, open: o.open });
  });

program
  .command("start")
  .description("Start processing jobs from your CapsEasy projects")
  .option("--once", "Exit after finishing one job")
  .action(async (o: { once?: boolean }) => {
    ensureDirs();
    const ac = new AbortController();
    process.on("SIGINT", () => ac.abort());
    process.on("SIGTERM", () => ac.abort());
    await runCompanion(loadConfig(), { once: o.once, signal: ac.signal });
    // Chrome/ffmpeg/whisper children can keep the event loop alive after an aborted job; the work is done, so leave.
    process.exit(0);
  });

program
  .command("check-pairing")
  .description("Exit 0 (and print the computer name) if this computer is still paired with --api; used by the installers")
  .option("--api <url>", "CapsEasy URL")
  .action(async (o: { api?: string }) => {
    const cfg = loadConfig();
    const same = !o.api || o.api.replace(/\/$/, "") === cfg.apiBase.replace(/\/$/, "");
    if (!cfg.token || !same) return void (process.exitCode = 1);
    try {
      const hb = await new CompanionApi(cfg.apiBase, cfg.token).heartbeat({ version: VERSION, platform: process.platform, capabilities: await buildCapabilities(), currentJobId: null });
      if (!hb) return void (process.exitCode = 1);
      console.log(cfg.workerName ?? "this computer");
    } catch {
      process.exitCode = 1; // revoked token (401) or unreachable: the installer re-pairs
    }
  });

program
  .command("status")
  .description("Show pairing and machine status")
  .action(async () => {
    const cfg = loadConfig();
    console.log(`API:      ${cfg.apiBase}\nPaired:   ${cfg.token ? `yes (${cfg.workerName ?? "unnamed"}, ${cfg.workerId})` : "no. Run: capseasy login"}\nModel:    ${cfg.whisperModel}`);
    console.log(JSON.stringify(await buildCapabilities(), null, 2));
  });

program
  .command("doctor")
  .description("Check that everything needed is in place")
  .action(async () => {
    ensureDirs();
    const cfg = loadConfig();
    const rows: [string, boolean, string][] = [];
    const add = (name: string, ok: boolean, note: string) => rows.push([name, ok, note]);
    add("Node.js >= 20", Number(process.versions.node.split(".")[0]) >= 20, process.versions.node);
    const caps = await buildCapabilities();
    add("ffmpeg (bundled)", Boolean(caps.ffmpeg), caps.ffmpeg ? "ok" : "missing: reinstall the companion");
    const free = diskFreeGb();
    add("Disk space >= 5 GB free", (free ?? 0) >= 5, `${free ?? "?"} GB free`);
    add("RAM >= 8 GB", (caps.ramGb ?? 0) >= 8, `${caps.ramGb} GB`);
    try {
      await ensureBrowser();
      add("Chrome (renderer)", true, "ready");
    } catch (e) {
      add("Chrome (renderer)", false, e instanceof Error ? e.message : String(e));
    }
    add("Speech model installed", installedModels().length > 0, installedModels().join(", ") || "none yet (downloaded on first job, or run: capseasy models install small)");
    try {
      const r = await fetch(`${cfg.apiBase}/health`);
      add("CapsEasy reachable", r.ok, `${cfg.apiBase} (${r.status})`);
    } catch (e) {
      add("CapsEasy reachable", false, `${cfg.apiBase}: ${e instanceof Error ? e.message : e}`);
    }
    if (cfg.token) {
      try {
        const hb = await new CompanionApi(cfg.apiBase, cfg.token).heartbeat({ version: VERSION, platform: process.platform, capabilities: caps, currentJobId: null });
        add("Paired & authorised", Boolean(hb), hb ? `worker ${hb.workerId}` : "no response");
      } catch (e) {
        add("Paired & authorised", false, e instanceof Error ? e.message : String(e));
      }
    } else add("Paired & authorised", false, "run: capseasy login");
    for (const [name, ok, note] of rows) console.log(`${ok ? "✔" : "✘"} ${name.padEnd(26)} ${note}`);
    process.exitCode = rows.every((r) => r[1]) ? 0 : 1;
  });

program
  .command("autostart <action>")
  .description("enable | disable | status: start the Companion automatically when you log in")
  .action((action: string) => {
    ensureDirs();
    if (action === "enable") {
      const r = enableAutostart(dirs.logs);
      console.log(`Autostart enabled (${r.path}). ${r.note}`);
    } else if (action === "disable") {
      console.log(disableAutostart() ? "Autostart disabled." : "Autostart was not enabled.");
    } else if (action === "status") {
      console.log(autostartEnabled() ? `Enabled (${autostartPath()})` : "Disabled");
    } else {
      throw new Error("Use: capseasy autostart enable | disable | status");
    }
  });

const models = program.command("models").description("Manage local speech models");
models.command("list").action(() => {
  const have = new Set(installedModels());
  for (const m of WHISPER_MODELS) console.log(`${have.has(m) ? "●" : "○"} ${m}`);
});
models
  .command("install <model>")
  .action(async (model: string) => {
    if (!(WHISPER_MODELS as readonly string[]).includes(model)) throw new Error(`Unknown model "${model}". Try: ${WHISPER_MODELS.join(", ")}`);
    ensureDirs();
    await ensureWhisperBinary();
    let last = -1;
    await ensureModel(model as WhisperModel, (f) => {
      const pct = Math.floor(f * 10) * 10;
      if (pct !== last) console.log(`  ${pct}%`), (last = pct);
    });
    console.log(`Installed ${model}`);
    const cfg = loadConfig();
    saveConfig({ ...cfg, whisperModel: model });
  });

program
  .command("logout")
  .description("Forget the pairing on this computer (also revoke it in the web app)")
  .action(() => {
    const cfg = loadConfig();
    saveConfig({ ...cfg, token: undefined, workerId: undefined });
    rmSync(join(dirs.cache, "jobs"), { recursive: true, force: true });
    console.log("Signed out.");
  });

program.parseAsync().catch((e) => {
  console.error(`\nError: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
