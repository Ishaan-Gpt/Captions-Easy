import { describe, expect, it } from "vitest";
import { autostartFile } from "../autostart";

describe("autostart files", () => {
  it("windows: hidden .vbs launcher with quoted paths", () => {
    const f = autostartFile("win32", "C:\Program Files\nodejs\node.exe", "C:\Users\me\npm\cli.mjs", "C:\logs");
    expect(f).toContain('Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\me\npm\cli.mjs"" start", 0, False');
  });
  it("macOS: LaunchAgent that runs at load, restarts on crash, escapes XML", () => {
    const f = autostartFile("darwin", "/usr/local/bin/node", "/Users/a&b/cli.mjs", "/tmp/logs");
    expect(f).toContain("<key>RunAtLoad</key><true/>");
    expect(f).toContain("<string>/Users/a&amp;b/cli.mjs</string>");
    expect(f).toContain("<key>SuccessfulExit</key><false/>");
  });
  it("linux: systemd user unit", () => {
    const f = autostartFile("linux", "/usr/bin/node", "/home/u/cli.mjs", "/tmp");
    expect(f).toContain('ExecStart="/usr/bin/node" "/home/u/cli.mjs" start');
    expect(f).toContain("WantedBy=default.target");
  });
});
