/**
 * Builds the publishable packages:
 *
 *   captionseasy             packages/cli/dist             (node scripts/build.mjs core)
 *     index.mjs, cli.mjs     library + bin, ZERO runtime dependencies: workspace code and zod are bundled, and
 *                            react/remotion are replaced by inert stubs (Node only reads the look data, it never
 *                            renders a component)
 *     remotion.mjs           `captionseasy/remotion`: the real React components, react/remotion left to the peer deps
 *   captionseasy-render      packages/cli-render/dist      (node scripts/build.mjs render)
 *     index.mjs + site/      renderer + the pre-bundled Remotion site (no webpack at the user's end)
 *   captionseasy-transcribe  packages/cli-transcribe/dist  (node scripts/build.mjs transcribe)
 *   captionseasy-web         packages/web/dist             (node scripts/build.mjs web; runs packages/web/scripts/build.mjs)
 *
 * `node scripts/build.mjs` builds all four (root: `pnpm release:build`). `--no-site` reuses an existing render site.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const cliDir = join(here, "..");
const pkgsDir = join(cliDir, "..");
const repo = join(pkgsDir, "..");
const require = createRequire(join(cliDir, "package.json"));
const which = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = which.length ? which : ["core", "render", "transcribe", "web"];
const skipSite = process.argv.includes("--no-site");

const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : statSync(p).size);
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

// ---------------------------------------------------------------- stubs for the Node bundles

/** Export names of a real module, so the stub can satisfy every named import. */
async function exportNames(spec, fallback = []) {
  try {
    return Object.keys(await import(pathToFileURL(require.resolve(spec)).href)).filter((k) => k !== "default" && /^[A-Za-z_$][\w$]*$/.test(k));
  } catch {
    return fallback;
  }
}
const STUBBED = {
  react: await exportNames("react"),
  "react/jsx-runtime": ["jsx", "jsxs", "Fragment"],
  "react/jsx-dev-runtime": ["jsxDEV", "Fragment"],
  "react-dom": await exportNames("react-dom"),
  remotion: await exportNames("remotion"),
  "@remotion/layout-utils": await exportNames("@remotion/layout-utils", ["measureText", "fillTextBox", "fitText", "fitTextOnNLines"]),
  "@remotion/media": ["Video", "Audio"],
};
/**
 * Inert stand-ins for react/remotion in the Node bundles. Module-level code in the templates (createContext,
 * Easing.bezier, memo ...) runs against a callable proxy; nothing is ever rendered in Node.
 */
const inertPlugin = {
  name: "inert-react-remotion",
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom|remotion)(\/.*)?$|^@remotion\/(layout-utils|media|google-fonts)(\/.*)?$/ }, (a) => ({ path: a.path.startsWith("@remotion/google-fonts") ? "@remotion/google-fonts" : a.path, namespace: "inert" }));
    b.onLoad({ filter: /.*/, namespace: "inert" }, (a) => {
      const key = a.path.startsWith("@remotion/google-fonts") ? "@remotion/google-fonts" : a.path;
      const names = key === "@remotion/google-fonts" ? ["loadFont", "getInfo"] : STUBBED[key] ?? [];
      const contents = [
        "const h = { get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? function* () {} : P), apply: () => P, construct: () => P };",
        "const P = new Proxy(function inert() {}, h);",
        ...names.map((n) => `export const ${n} = P;`),
        "export default P;",
      ].join("\n");
      return { contents, loader: "js" };
    });
  },
};

const BANNER = "import { createRequire as __ceCreateRequire } from 'node:module'; const require = __ceCreateRequire(import.meta.url);";

async function nodeBundle({ entryPoints, outdir, external = [], shebang = [], version }) {
  await build({
    entryPoints,
    outdir,
    outExtension: { ".js": ".mjs" },
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    splitting: true,
    platform: "node",
    format: "esm",
    target: "node20",
    jsx: "automatic",
    minify: true,
    external,
    plugins: [inertPlugin],
    define: { __CAPTIONSEASY_VERSION__: JSON.stringify(version), "process.env.NODE_ENV": '"production"' },
    banner: { js: BANNER },
    legalComments: "none",
    logLevel: "warning",
  });
  // only an executable gets a shebang: a library entry stays a plain module
  for (const name of shebang) {
    const file = join(outdir, `${name}.mjs`);
    writeFileSync(file, `#!/usr/bin/env node\n${readFileSync(file, "utf8")}`);
  }
}

/**
 * The same library for browsers, workers and edge runtimes: no Node banner, file access replaced by a NODE_ONLY
 * error (saveLooksFile / loadLooksFile), add-ons refused with NODE_ONLY (IS_BROWSER_BUILD). One file, no chunks.
 */
async function browserBundle({ entry, outfile, version }) {
  const nodeStub = {
    name: "node-only-stub",
    setup(b) {
      b.onResolve({ filter: /^(node:)?(fs|path)$/ }, (a) => ({ path: a.path.replace(/^node:/, ""), namespace: "node-only" }));
      b.onLoad({ filter: /.*/, namespace: "node-only" }, (a) => {
        const names = a.path === "fs" ? ["readFileSync", "writeFileSync", "existsSync", "statSync", "mkdirSync"] : ["resolve", "join", "dirname", "basename", "extname"];
        const fail =
          'function nodeOnly(){const e=new Error("This needs Node (file access). In the browser, keep custom looks as JSON yourself and pass the look objects to buildCaptions / registerLook.");e.name="CaptionsEasyError";e.code="NODE_ONLY";throw e;}';
        const contents = [fail, ...names.map((n) => `export const ${n} = nodeOnly;`), `export default { ${names.map((n) => `${n}: nodeOnly`).join(", ")} };`].join("\n");
        return { contents, loader: "js" };
      });
      // the add-on loader throws NODE_ONLY first in this build; drop its dynamic import so no bundler sees (or warns about) it
      b.onLoad({ filter: /[\\/]addons\.ts$/ }, (a) => {
        const src = readFileSync(a.path, "utf8");
        const out = src.replace(/await import\(\/\* webpackIgnore: true \*\/ pkg\)/, "undefined");
        if (out === src) throw new Error("browser build: the add-on import in addons.ts moved; update the build");
        return { contents: out, loader: "ts" };
      });
    },
  };
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    minify: true,
    plugins: [inertPlugin, nodeStub],
    define: { __CAPTIONSEASY_VERSION__: JSON.stringify(version), __CAPTIONSEASY_BROWSER__: "true", "process.env.NODE_ENV": '"production"' },
    legalComments: "none",
    logLevel: "warning",
  });
}

/** Public typings: emit declarations, keep only the listed files, point them at their sibling files. */
function typings(pkgDir, outDir, files, extra = {}) {
  const tmp = join(pkgDir, ".dts-tmp");
  rmSync(tmp, { recursive: true, force: true });
  const tsc = [join(repo, "node_modules", "typescript", "bin", "tsc"), join(cliDir, "node_modules", "typescript", "bin", "tsc")].find(existsSync);
  execFileSync(process.execPath, [tsc, "-p", join(pkgDir, "tsconfig.json"), "--noEmit", "false", "--declaration", "--emitDeclarationOnly", "--outDir", tmp], { stdio: "inherit" });
  // tsc mirrors the common root of every source it saw
  const find = (rel) => [join(tmp, "packages", rel), join(tmp, rel), join(tmp, rel.split("/").slice(1).join("/"))].find(existsSync);
  for (const [out, from] of Object.entries({ ...files, ...extra })) {
    const src = from.startsWith("!") ? from.slice(1) : find(from);
    if (!src) throw new Error(`typings: ${from} not emitted`);
    let text = readFileSync(src, "utf8")
      .replace(/from "\.\.\/\.\.\/cli\/src\/types"/g, 'from "./types.js"')
      .replace(/from "(\.\/[\w-]+)"/g, 'from "$1.js"');
    if (/@capseasy|@motion-ai|\.\.\//.test(text)) throw new Error(`${out} references a private workspace path`);
    writeFileSync(join(outDir, out), text);
  }
  rmSync(tmp, { recursive: true, force: true });
}

const version = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;

// ---------------------------------------------------------------- captionseasy (core)

async function buildCore() {
  const dist = join(cliDir, "dist");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  await nodeBundle({
    entryPoints: { index: join(cliDir, "src", "index.ts"), cli: join(cliDir, "src", "bin.ts") },
    outdir: dist,
    shebang: ["cli"],
    version: version(cliDir),
  });
  await browserBundle({ entry: join(cliDir, "src", "index.ts"), outfile: join(dist, "browser.mjs"), version: version(cliDir) });

  // the React components for Remotion projects: real react/remotion (peer deps), fonts as lazy chunks
  const mediaShim = {
    name: "media-shim",
    setup(b) {
      // @remotion/media (mediabunny, zod 4) only serves the in-browser exporter: OffthreadVideo covers Player + renderer
      b.onResolve({ filter: /^@remotion\/media$/ }, () => ({ path: "media-shim", namespace: "media-shim" }));
      b.onLoad({ filter: /.*/, namespace: "media-shim" }, () => ({
        contents: "import React from 'react'; import { OffthreadVideo } from 'remotion'; export const Video = ({ src, style }) => React.createElement(OffthreadVideo, { src, style: { width: '100%', height: '100%', objectFit: 'contain', ...style } }); export const Audio = () => null;",
        loader: "js",
      }));
    },
  };
  await build({
    entryPoints: { remotion: join(cliDir, "src", "remotion.ts"), react: join(cliDir, "src", "react.tsx") },
    outdir: dist,
    outExtension: { ".js": ".mjs" },
    chunkNames: "remotion-chunks/[name]-[hash]",
    bundle: true,
    splitting: true,
    platform: "neutral",
    mainFields: ["module", "main"],
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    minify: true,
    external: ["react", "react/*", "react-dom", "react-dom/*", "remotion", "remotion/*", "@remotion/player"],
    plugins: [mediaShim],
    // client components (Next.js App Router): every file of these entries runs in the browser
    banner: { js: '"use client";' },
    legalComments: "none",
    logLevel: "warning",
  });

  typings(cliDir, dist, { "index.d.ts": "cli/src/index.d.ts", "types.d.ts": "cli/src/types.d.ts", "errors.d.ts": "cli/src/errors.d.ts", "version.d.ts": "cli/src/version.d.ts" }, { "remotion.d.ts": `!${join(cliDir, "src", "remotion.public.d.ts")}`, "react.d.ts": `!${join(cliDir, "src", "react.public.d.ts")}` });
  console.log(`captionseasy: dist ${mb(size(dist))} (node ${mb(size(join(dist, "index.mjs")) + size(join(dist, "cli.mjs")) + size(join(dist, "chunks")))}, browser ${mb(size(join(dist, "browser.mjs")))}, react + remotion components ${mb(size(join(dist, "remotion.mjs")) + size(join(dist, "react.mjs")) + size(join(dist, "remotion-chunks")))})`);
}

// ---------------------------------------------------------------- captionseasy-render

async function buildRender() {
  const pkgDir = join(pkgsDir, "cli-render");
  const dist = join(pkgDir, "dist");
  const site = join(dist, "site");
  const keepSite = skipSite && existsSync(join(site, "index.html"));
  if (keepSite) {
    for (const f of readdirSync(dist)) if (f !== "site") rmSync(join(dist, f), { recursive: true, force: true });
  } else {
    rmSync(dist, { recursive: true, force: true });
    mkdirSync(dist, { recursive: true });
    console.log("captionseasy-render: bundling the Remotion composition...");
    const { bundle } = await import(pathToFileURL(require.resolve("@remotion/bundler")).href);
    await bundle({ entryPoint: join(pkgsDir, "compositions", "src", "entry.ts"), outDir: site, onProgress: () => undefined });
    // source maps are a third of the site; drop them and their references (Remotion's error symbolication reads them)
    const strip = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) strip(p);
        else if (f.endsWith(".map")) rmSync(p);
        else if (f.endsWith(".js")) writeFileSync(p, readFileSync(p, "utf8").replace(/\n\/\/# sourceMappingURL=[^\n]*\s*$/, "\n"));
      }
    };
    strip(site);
  }
  // the bundler writes the build machine's project folder into the page (window.remotion_cwd, studio-only): blank it
  const html = join(site, "index.html");
  writeFileSync(html, readFileSync(html, "utf8").replace(/window\.remotion_cwd = "[^"]*";/, 'window.remotion_cwd = "";'));
  await nodeBundle({
    entryPoints: { index: join(pkgDir, "src", "index.ts") },
    outdir: dist,
    external: ["@remotion/renderer", "@remotion/bundler", "captionseasy-transcribe"],
    version: version(pkgDir),
  });
  typings(pkgDir, dist, { "index.d.ts": "cli-render/src/index.d.ts", "types.d.ts": "cli/src/types.d.ts" });
  console.log(`captionseasy-render: dist ${mb(size(dist))} (site ${mb(size(site))})`);
}

// ---------------------------------------------------------------- captionseasy-transcribe

async function buildTranscribe() {
  const pkgDir = join(pkgsDir, "cli-transcribe");
  const dist = join(pkgDir, "dist");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  await nodeBundle({
    entryPoints: { index: join(pkgDir, "src", "index.ts") },
    outdir: dist,
    external: ["@huggingface/transformers", "@remotion/renderer"],
    version: version(pkgDir),
  });
  typings(pkgDir, dist, { "index.d.ts": "cli-transcribe/src/index.d.ts", "types.d.ts": "cli/src/types.d.ts" });
  console.log(`captionseasy-transcribe: dist ${mb(size(dist))}`);
}

const t0 = Date.now();
for (const t of targets) {
  if (t === "core") await buildCore();
  else if (t === "render") await buildRender();
  else if (t === "transcribe") await buildTranscribe();
  else if (t === "web") execFileSync(process.execPath, [join(pkgsDir, "web", "scripts", "build.mjs")], { stdio: "inherit", cwd: join(pkgsDir, "web") });
  else throw new Error(`unknown target ${t} (core | render | transcribe | web)`);
}
console.log(`built ${targets.join(", ")} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
