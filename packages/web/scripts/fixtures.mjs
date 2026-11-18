/**
 * (Re)generates the small reference set the default test suite compares against: Remotion server renders
 * (renderStill of the CaptionsOverlay composition) of a few representative looks, at 360x640.
 *
 *   node scripts/fixtures.mjs        -> test/fixtures/<look>_<ms>.png + manifest.json
 *
 * Re-run only when a look's rendering is meant to change (it must not, for published looks).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCaptions } from "captionseasy";
import { SAMPLE_WORDS, chromePath, pkgDir, repoDir } from "./harness.mjs";

export const FIXTURE_LOOKS = [1, 5, 12, 87, 89, 123];
export const FIXTURE_TIMES = [1300];
export const FIXTURE_SIZE = { width: 360, height: 640, fps: 30 };

const dir = join(pkgDir, "test", "fixtures");
mkdirSync(dir, { recursive: true });
const { bundle } = await import("@remotion/bundler");
const { openBrowser, renderStill, selectComposition } = await import("@remotion/renderer");
const site = await bundle({ entryPoint: join(repoDir, "packages", "compositions", "src", "entry.ts"), onProgress: () => undefined });
const browser = await openBrowser("chrome", { browserExecutable: chromePath() });
const manifest = [];
for (const look of FIXTURE_LOOKS) {
  // props are stored in the manifest: buildCaptions gives words random ids, and seeded looks (ransom ...) lay out by id
  const props = buildCaptions({ words: SAMPLE_WORDS, look });
  const { look: _l, warnings, ...rest } = props;
  const end = rest.doc.words.reduce((m, w) => Math.max(m, w.endMs), 0);
  const inputProps = { ...rest, src: null, mode: "overlay", backdrop: null, media: { ...FIXTURE_SIZE, durationMs: end, rotation: 0 } };
  const composition = await selectComposition({ serveUrl: site, id: "CaptionsOverlay", inputProps, puppeteerInstance: browser, logLevel: "error" });
  for (const t of FIXTURE_TIMES) {
    const file = `${look}_${t}.png`;
    const frame = Math.floor((t / 1000) * FIXTURE_SIZE.fps + 1e-6);
    await renderStill({ composition: { ...composition, props: inputProps }, serveUrl: site, output: join(dir, file), frame, inputProps, puppeteerInstance: browser, imageFormat: "png", logLevel: "error", overwrite: true });
    manifest.push({ look, timeMs: t, frame, file, props });
    console.log("fixture", file);
  }
}
await browser.close({ silent: true });
writeFileSync(join(dir, "manifest.json"), JSON.stringify({ size: FIXTURE_SIZE, words: SAMPLE_WORDS, fixtures: manifest }, null, 2) + "\n");
