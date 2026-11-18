/**
 * Opt-in: the full visual regression (every gallery look x 3 moments, captionseasy-web vs Remotion renderStill).
 *   CAPTIONSEASY_WEB_REGRESSION=1 npx vitest run test/regression.test.ts      (engine: CAPTIONSEASY_WEB_ENGINE, default svg)
 * Writes .regression/<engine>/summary.md + results.json; fails when a look exceeds test/regression-thresholds.json.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkgDir = join(__dirname, "..");

describe.runIf(process.env.CAPTIONSEASY_WEB_REGRESSION)("full visual regression vs Remotion", () => {
  it("every look stays within its threshold", () => {
    const engine = process.env.CAPTIONSEASY_WEB_ENGINE ?? "svg";
    const r = spawnSync(process.execPath, [join(pkgDir, "scripts", "regression.mjs"), "--engine", engine], { cwd: pkgDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    console.log(r.stdout.split("\n").filter((l) => !/CanvasFontStretch/.test(l)).slice(-6).join("\n"));
    expect(r.status).toBe(0);
  }, 60 * 60_000);
});
