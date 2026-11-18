/**
 * Builds captionseasy-web (packages/web/dist): one browser ESM entry, minified, with React, react-dom, Remotion,
 * @remotion/web-renderer and the caption composition bundled in. Lazy chunks: the in-browser renderer (canvas +
 * export) and one per Google font, so a page that only uses the DOM layer never downloads them.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(pkgDir, "..", "..");
const dist = join(pkgDir, "dist");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

/** @remotion/media (mediabunny decoder) only plays the source video in burn mode; this package always draws an overlay. */
const mediaStub = {
  name: "media-stub",
  setup(b) {
    b.onResolve({ filter: /^@remotion\/media$/ }, () => ({ path: "media-stub", namespace: "media-stub" }));
    b.onLoad({ filter: /.*/, namespace: "media-stub" }, () => ({ contents: "export const Video = () => null; export const Audio = () => null;", loader: "js" }));
    // exports are always muted: the audio encoders (1.6 MB of wasm) are never registered
    b.onResolve({ filter: /^@mediabunny\/(aac|flac|mp3)-encoder$/ }, (a) => ({ path: a.path, namespace: "audio-stub" }));
    b.onLoad({ filter: /.*/, namespace: "audio-stub" }, () => ({
      contents: "const no = () => { throw new Error('captionseasy-web exports are silent (no audio encoder bundled)'); }; export const registerAacEncoder = no; export const registerFlacEncoder = no; export const registerMp3Encoder = no;",
      loader: "js",
    }));
  },
};

const result = await build({
  entryPoints: { index: join(pkgDir, "src", "index.ts") },
  outdir: dist,
  outExtension: { ".js": ".mjs" },
  chunkNames: "chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2022", "chrome110", "safari16", "firefox115"],
  jsx: "automatic",
  minify: true,
  treeShaking: true,
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [mediaStub],
  legalComments: "none",
  logLevel: "warning",
});
writeFileSync(join(pkgDir, ".meta.json"), JSON.stringify(result.metafile));

// public typings: emit with tsc, keep index + props
const tmp = join(pkgDir, ".dts-tmp");
rmSync(tmp, { recursive: true, force: true });
const tsc = [join(repo, "node_modules", "typescript", "bin", "tsc"), join(pkgDir, "node_modules", "typescript", "bin", "tsc")].find(existsSync);
execFileSync(process.execPath, [tsc, "-p", join(pkgDir, "tsconfig.json"), "--noEmit", "false", "--declaration", "--emitDeclarationOnly", "--outDir", tmp], { stdio: "inherit" });
const find = (rel) => [join(tmp, "packages", "web", "src", rel), join(tmp, "web", "src", rel), join(tmp, "src", rel), join(tmp, rel)].find(existsSync);
for (const f of ["index.d.ts", "props.d.ts"]) {
  const src = find(f);
  if (!src) throw new Error(`typings: ${f} not emitted`);
  let text = readFileSync(src, "utf8").replace(/from "\.\/(props)"/g, 'from "./$1.js"');
  // the canvas typings must not drag in private modules
  text = text.replace(/^import .*"\.\/scene".*$/m, "");
  if (/@capseasy|@motion-ai|\.\/scene|\.\.\//.test(text)) throw new Error(`${f} references a private module`);
  writeFileSync(join(dist, f), text);
}
rmSync(tmp, { recursive: true, force: true });

const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : statSync(p).size);
const entry = size(join(dist, "index.mjs"));
const chunks = readdirSync(join(dist, "chunks")).map((f) => ({ f, n: size(join(dist, "chunks", f)) })).sort((a, b) => b.n - a.n);
console.log(`captionseasy-web: dist ${kb(size(dist))} (entry ${kb(entry)}, ${chunks.length} lazy chunks; biggest ${chunks.slice(0, 3).map((c) => `${c.f} ${kb(c.n)}`).join(", ")})`);
