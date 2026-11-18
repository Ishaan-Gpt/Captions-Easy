/**
 * Visual regression: captionseasy-web (canvas, in headless Chrome) vs Remotion's server renderer (renderStill of the
 * same CaptionedVideo composition) for every gallery look at a few moments.
 *
 *   node scripts/regression.mjs [--looks all|1,2,3] [--times 300,1300,2900] [--size 720x1280] [--out dir]
 *                               [--site <remotion bundle dir>] [--no-diff] [--json results.json] [--md summary.md]
 *
 * Needs `node scripts/build.mjs` first (it tests dist/). Server references are cached in <out>/ref by a hash of
 * (props, frame, size), so re-runs only render the web side. Exit code 1 when a look exceeds its threshold
 * (test/regression-thresholds.json).
 *
 * Metrics per moment (see harness.mjs compareImages): `shift` ("off", the pass metric) = share of caption pixels with no
 * pixel within +-1 px in the other image closer than 48/255 (pixel tolerance: sub-pixel text placement is forgiven,
 * wrong colour / missing or extra elements are not); `coarse` = share of caption-covered 4x4 blocks whose average
 * colour differs by > 32/255; `mismatch` ("aa") = share of caption pixels differing by > 48/255 in place. A look's
 * score is its worst moment.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCaptions, listLooks } from "captionseasy";
import { SAMPLE_WORDS, chromePath, launch, openHarness, pkgDir, repoDir, startServer } from "./harness.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const [W, H] = arg("size", "720x1280").split("x").map(Number);
const FPS = 30;
const TIMES = arg("times", "300,1300,2900").split(",").map(Number);
const ENGINE = arg("engine", "svg");
const outDir = resolve(arg("out", join(pkgDir, ".regression")));
const refDir = join(outDir, "ref");
const webDir = join(outDir, ENGINE, "web");
const diffDir = join(outDir, ENGINE, "diff");
for (const d of [refDir, webDir, diffDir]) mkdirSync(d, { recursive: true });

const all = listLooks();
const lookArg = arg("looks", "all");
const looks = lookArg === "all" ? all : all.filter((l) => lookArg.split(",").map(Number).includes(l.number));
const thresholds = JSON.parse(readFileSync(join(pkgDir, "test", "regression-thresholds.json"), "utf8"));

const frameOf = (t) => Math.floor((t / 1000) * FPS + 1e-6);
const inputPropsOf = (props) => {
  const { look, warnings, theme, roles, ...rest } = props;
  const end = props.doc.words.reduce((m, w) => Math.max(m, w.endMs), 0);
  return { ...rest, src: null, mode: "overlay", backdrop: null, media: { width: W, height: H, fps: FPS, durationMs: end, rotation: 0 } };
};
const key = (props, frame) => createHash("sha1").update(JSON.stringify([inputPropsOf(props), frame, W, H])).digest("hex").slice(0, 16);

// props are frozen per output dir (captionseasy is rebuilt often during development; refs are keyed by props), --fresh-props rebuilds them
const propsFile = join(outDir, "props.json");
const frozen = !flag("fresh-props") && existsSync(propsFile) ? JSON.parse(readFileSync(propsFile, "utf8")) : {};
const jobs = looks.map((l) => ({ look: l, props: (frozen[l.number] ??= buildCaptions({ words: SAMPLE_WORDS, look: l.number })) }));
writeFileSync(propsFile, JSON.stringify(frozen));
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- server references (Remotion renderStill)
const missing = [];
for (const j of jobs) for (const t of TIMES) if (!existsSync(join(refDir, `${key(j.props, frameOf(t))}.png`))) missing.push({ j, t });
if (missing.length) {
  const { bundle } = await import("@remotion/bundler");
  const { openBrowser, renderStill, selectComposition } = await import("@remotion/renderer");
  const site = arg("site") ?? (log("bundling the composition (Remotion webpack)..."), await bundle({ entryPoint: join(repoDir, "packages", "compositions", "src", "entry.ts"), onProgress: () => undefined }));
  const browser = await openBrowser("chrome", { browserExecutable: chromePath() });
  let n = 0;
  for (const { j, t } of missing) {
    const inputProps = inputPropsOf(j.props);
    for (let attempt = 1; ; attempt++) {
      try {
        const composition = await selectComposition({ serveUrl: site, id: "CaptionsOverlay", inputProps, puppeteerInstance: browser, logLevel: "error" });
        await renderStill({ composition: { ...composition, props: inputProps }, serveUrl: site, output: join(refDir, `${key(j.props, frameOf(t))}.png`), frame: frameOf(t), inputProps, puppeteerInstance: browser, imageFormat: "png", logLevel: "error", overwrite: true });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        log(`retrying #${j.look.number} @${t} ms: ${String(e).split(String.fromCharCode(10))[0]}`);
      }
    }
    if (++n % 20 === 0) log(`server stills ${n}/${missing.length}`);
  }
  await browser.close({ silent: true });
}

// ---------------------------------------------------------------- captionseasy-web + compare
const srv = await startServer({ refDir });
const browser = await launch();
const page = await openHarness(browser, srv.origin, { width: 800, height: 600 });
const results = [];
const t0 = Date.now();
let webMs = 0;
let frames = 0;
for (const j of jobs) {
  const moments = [];
  for (const t of TIMES) {
    const k = key(j.props, frameOf(t));
    const s = Date.now();
    const web = await page.evaluate((p, tm, size) => window.webFrame(p, tm, size), j.props, t, { width: W, height: H, fps: FPS, engine: ENGINE });
    webMs += Date.now() - s;
    frames++;
    const webFile = `${j.look.number}_${t}.png`;
    writeFileSync(join(webDir, webFile), Buffer.from(web.png, "base64"));
    const m = await page.evaluate((a, b, w, h, d) => window.compareImages(a, b, w, h, d), `data:image/png;base64,${web.png}`, `/ref/${k}.png`, W, H, !flag("no-diff"));
    if (m.diffPng) writeFileSync(join(diffDir, webFile), Buffer.from(m.diffPng, "base64"));
    moments.push({ timeMs: t, frame: frameOf(t), ref: `ref/${k}.png`, web: `web/${webFile}`, coarse: m.coarse, mismatch: m.mismatch, shift: m.shift, meanDiff: m.meanDiff, ink: m.ink, hash: web.hash });
  }
  const worst = moments.reduce((a, b) => (b.shift > a.shift ? b : a));
  const th = thresholds[ENGINE] ?? thresholds.svg;
  const limit = th.looks?.[j.look.number] ?? th.default;
  const r = { number: j.look.number, id: j.look.id, name: j.look.name, template: j.props.style.templateId, shift: worst.shift, coarse: Math.max(...moments.map((m) => m.coarse)), mismatch: Math.max(...moments.map((m) => m.mismatch)), worstAt: worst.timeMs, limit, pass: worst.shift <= limit, moments };
  results.push(r);
  log(`#${String(r.number).padStart(3)} ${r.id.padEnd(28)} off ${(r.shift * 100).toFixed(2).padStart(6)}%  coarse ${(r.coarse * 100).toFixed(2).padStart(6)}%  aa ${(r.mismatch * 100).toFixed(1).padStart(5)}%  ${r.pass ? "ok" : `FAIL (> ${(limit * 100).toFixed(1)}%)`}`);
}
await browser.close();
await srv.close();
if (page.errors.length) log("page errors:", page.errors.slice(0, 5));

const sorted = [...results].sort((a, b) => b.shift - a.shift || b.coarse - a.coarse);
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const summary = {
  generatedAt: new Date().toISOString(),
  engine: ENGINE,
  size: `${W}x${H}`,
  fps: FPS,
  times: TIMES,
  looks: results.length,
  failed: results.filter((r) => !r.pass).map((r) => r.number),
  webMsPerFrame: Math.round(webMs / Math.max(1, frames)),
  worst: sorted.slice(0, 10).map((r) => ({ number: r.number, id: r.id, shift: r.shift, coarse: r.coarse, mismatch: r.mismatch, at: r.worstAt })),
  medianShift: sorted[Math.floor(sorted.length / 2)]?.shift ?? 0,
  results: results.map(({ moments, ...r }) => ({ ...r, moments: moments.map(({ ref, web, hash, ...m }) => m) })),
};
writeFileSync(arg("json", join(outDir, ENGINE, "results.json")), JSON.stringify(summary, null, 2));
const md = [
  `# captionseasy-web (engine "${ENGINE}") vs Remotion renderStill`,
  ``,
  `${results.length} looks x ${TIMES.length} moments (${TIMES.join(", ")} ms) at ${W}x${H}, ${FPS} fps, sample transcript "${SAMPLE_WORDS.map((w) => w.text).join(" ")}".`,
  `off = caption pixels with no pixel within +-1 px in the other image closer than 48/255 (the pass metric); coarse = caption-covered 4x4 blocks whose mean colour differs by > 32/255; aa = caption pixels differing by > 48/255 in place. Worst moment per look.`,
  `Web render: ${summary.webMsPerFrame} ms/frame (headless Chrome, software GPU). Failed: ${summary.failed.length ? summary.failed.join(", ") : "none"}. Median off ${pct(summary.medianShift)}.`,
  ``,
  `| # | look | template | off | coarse | aa | worst at | limit |`,
  `| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |`,
  ...sorted.map((r) => `| ${r.number} | ${r.id} | ${r.template} | ${pct(r.shift)} | ${pct(r.coarse)} | ${pct(r.mismatch)} | ${r.worstAt} ms | ${pct(r.limit)}${r.pass ? "" : " FAIL"} |`),
  ``,
].join("\n");
writeFileSync(arg("md", join(outDir, ENGINE, "summary.md")), md);
log(`\n${results.length} looks in ${((Date.now() - t0) / 1000).toFixed(0)} s; worst (off): ${sorted.slice(0, 5).map((r) => `#${r.number} ${pct(r.shift)}`).join(", ")}; failed: ${summary.failed.length}`);
process.exit(summary.failed.length ? 1 : 0);
