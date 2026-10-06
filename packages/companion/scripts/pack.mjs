/**
 * Builds the installable companion:
 *   dist-release/cli.mjs      one-file ESM bundle of the CLI + all workspace code
 *   dist-release/site/        pre-bundled Remotion site (the same CaptionedVideo composition the web Player runs)
 *   dist-release/package.json only the native-binary deps npm must install (@remotion/renderer, whisper installer)
 * then `npm pack`s it into apps/frontend/public/companion/ (served by Vercel) with a latest.json manifest.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { bundle } from "@remotion/bundler";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const repo = join(pkgDir, "..", "..");
const out = join(pkgDir, "dist-release");
const publicDir = join(repo, "apps", "frontend", "public", "companion");
const REMOTION = "4.0.484";

const src = readFileSync(join(pkgDir, "src", "system.ts"), "utf8");
const version = /VERSION = "([^"]+)"/.exec(src)?.[1];
if (!version) throw new Error("VERSION not found in src/system.ts");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log("1/4 bundling Remotion site…");
await bundle({ entryPoint: join(repo, "packages", "compositions", "src", "entry.ts"), outDir: join(out, "site"), onProgress: () => undefined });

console.log("2/4 bundling CLI…");
await build({
  entryPoints: [join(pkgDir, "src", "cli.ts")],
  outfile: join(out, "cli.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // native binaries / downloaders must stay real npm deps
  external: ["@remotion/renderer", "@remotion/install-whisper-cpp", "@remotion/bundler"],
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});

writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: "capseasy-companion",
      version,
      description: "CapsEasy Companion: private, local caption transcription and rendering",
      type: "module",
      bin: { capseasy: "cli.mjs" },
      engines: { node: ">=20" },
      dependencies: { "@remotion/renderer": REMOTION, "@remotion/install-whisper-cpp": REMOTION },
    },
    null,
    2,
  ),
);

console.log("3/4 npm pack…");
const tgzName = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--silent"], { cwd: out, shell: process.platform === "win32" }).toString().trim().split(/\r?\n/).pop();

console.log("4/4 publishing to apps/frontend/public/companion …");
mkdirSync(publicDir, { recursive: true });
const tgz = readFileSync(join(out, tgzName));
copyFileSync(join(out, tgzName), join(publicDir, tgzName));
copyFileSync(join(out, tgzName), join(publicDir, "capseasy-companion-latest.tgz"));
writeFileSync(
  join(publicDir, "latest.json"),
  JSON.stringify({ version, file: tgzName, sha256: createHash("sha256").update(tgz).digest("hex"), size: tgz.length }, null, 2),
);
console.log(`done: ${tgzName} (${(tgz.length / 1048576).toFixed(1)} MB)`);
