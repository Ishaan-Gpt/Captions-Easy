/**
 * Checks the built captionseasy package the way an app meets it (run after `node scripts/build.mjs core`):
 *   - every export path in package.json points at a real file
 *   - the browser build has no Node imports, no CommonJS shim and no dynamic import a bundler would trip on
 *   - only the CLI carries a shebang; the React / Remotion entries are client components ("use client")
 *   - import() and require() both load the library in Node, and the browser build runs on its own
 * Exits 1 with every failure listed.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const fails = [];
const check = (ok, what) => {
  if (!ok) fails.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const read = (rel) => readFileSync(join(pkgDir, rel), "utf8");

// 1. export map
const targets = [];
const walk = (v, at) => (typeof v === "string" ? targets.push([at, v]) : Object.entries(v).forEach(([k, x]) => walk(x, `${at} ${k}`)));
walk(pkg.exports, "exports");
for (const [at, rel] of targets) check(existsSync(join(pkgDir, rel)), `${at} -> ${rel} exists`);
check(existsSync(join(pkgDir, pkg.bin.captionseasy)), `bin -> ${pkg.bin.captionseasy} exists`);

// 2. browser build
const browser = read("dist/browser.mjs");
check(!/from\s*["']node:|import\(["']node:|createRequire/.test(browser), "browser.mjs has no node: imports or createRequire");
check(!/import\([A-Za-z_$][\w$]*\)/.test(browser), "browser.mjs has no dynamic import of a variable");

// 3. entry headers
check(!read("dist/index.mjs").startsWith("#!"), "index.mjs (library) has no shebang");
check(read("dist/cli.mjs").startsWith("#!/usr/bin/env node"), "cli.mjs starts with a shebang");
for (const f of ["dist/react.mjs", "dist/remotion.mjs"]) check(read(f).startsWith('"use client";'), `${f} starts with "use client"`);

// 4. loading
const words = [{ text: "Hi", startMs: 0, endMs: 300 }];
try {
  const esm = await import(pathToFileURL(join(pkgDir, "dist/index.mjs")).href);
  check(esm.buildCaptions({ words, look: 12 }).look.number === 12, "import() of the Node build builds captions");
} catch (e) {
  check(false, `import() of the Node build: ${e.message}`);
}
try {
  const browserMod = await import(pathToFileURL(join(pkgDir, "dist/browser.mjs")).href);
  check(browserMod.buildCaptions({ words, look: 129 }).look.number === 129, "the browser build builds captions on its own");
  let code = "";
  try {
    browserMod.saveLooksFile("x.json", []);
  } catch (e) {
    code = e.code;
  }
  check(code === "NODE_ONLY", "the browser build refuses file access with NODE_ONLY");
} catch (e) {
  check(false, `import() of the browser build: ${e.message}`);
}
const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19)) {
  try {
    const cjs = createRequire(join(pkgDir, "package.json"))(pkgDir);
    check(cjs.buildCaptions({ words, look: 12 }).look.number === 12, "require() loads the package");
  } catch (e) {
    check(false, `require(): ${e.code ?? ""} ${e.message}`);
  }
} else console.log(`skip require() (Node ${process.versions.node} has no require(esm))`);

if (fails.length) {
  console.error(`\n${fails.length} dist check(s) failed`);
  process.exit(1);
}
console.log("\ndist checks passed");
