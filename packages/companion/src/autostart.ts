import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** The command that starts the companion: this node binary + the CLI entry (release cli.mjs, or the dev launcher). */
export function launchCommand(): [string, string] {
  const entry = resolve(process.argv[1] ?? "");
  // dev: tsx runs src/cli.ts; start through the bin launcher instead so it works without tsx on PATH
  const cli = entry.endsWith(".ts") ? join(dirname(entry), "..", "bin", "capseasy.mjs") : entry;
  return [process.execPath, cli];
}

const LABEL = "app.capseasy.companion";

export function autostartPath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "CapsEasy Companion.vbs");
  }
  if (process.platform === "darwin") return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "systemd", "user", "capseasy-companion.service");
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** File contents per OS. Pure, so it can be unit-tested on any machine. */
export function autostartFile(platform: NodeJS.Platform, node: string, cli: string, logDir: string): string {
  if (platform === "win32") {
    // .vbs in the Startup folder: runs at login with NO console window (a .cmd would flash a terminal)
    const q = (s: string) => s.replace(/"/g, '""');
    return `' CapsEasy Companion: starts at login, hidden. Remove with: capseasy autostart disable\r\nCreateObject("WScript.Shell").Run """${q(node)}"" ""${q(cli)}"" start", 0, False\r\n`;
  }
  if (platform === "darwin") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(cli)}</string><string>start</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${xml(join(logDir, "autostart.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(join(logDir, "autostart.log"))}</string>
</dict></plist>
`;
  }
  return `[Unit]
Description=CapsEasy Companion (local caption transcription and rendering)
After=network-online.target

[Service]
ExecStart="${node}" "${cli}" start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
}

function tryRun(cmd: string, args: string[]) {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function enableAutostart(logDir: string): { path: string; note: string } {
  const [node, cli] = launchCommand();
  const path = autostartPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, autostartFile(process.platform, node, cli, logDir));
  let note = "It will start automatically the next time you log in.";
  if (process.platform === "darwin") {
    tryRun("launchctl", ["unload", path]);
    if (tryRun("launchctl", ["load", "-w", path])) note = "Started now and at every login.";
  } else if (process.platform === "linux") {
    if (tryRun("systemctl", ["--user", "daemon-reload"]) && tryRun("systemctl", ["--user", "enable", "--now", "capseasy-companion.service"])) note = "Started now and at every login.";
    else note = "Run: systemctl --user enable --now capseasy-companion.service";
  }
  return { path, note };
}

export function disableAutostart(): boolean {
  const path = autostartPath();
  if (!existsSync(path)) return false;
  if (process.platform === "darwin") tryRun("launchctl", ["unload", "-w", path]);
  if (process.platform === "linux") tryRun("systemctl", ["--user", "disable", "--now", "capseasy-companion.service"]);
  rmSync(path, { force: true });
  return true;
}

export const autostartEnabled = () => existsSync(autostartPath());
