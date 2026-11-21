/**
 * Per-frame cost of every look, as the studio player pays it: captionseasy-web's DOM mount (the same React tree the
 * Remotion Player renders) stepped frame by frame at 30 fps over the sample transcript, with layout forced each frame.
 *
 *   node packages/web/scripts/frame-cost.mjs [--looks 12,22] [--cpu 4]
 *
 * Prints the looks by median and p95 ms per frame (a frame must fit in 33 ms at 30 fps, 16 ms at 60).
 */
import { buildCaptions, listLooks } from "captionseasy";
import { launch, openHarness, startServer } from "./harness.mjs";
import { timed, TRANSCRIPTS } from "./transcripts.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const lookFilter = arg("looks")?.split(",");
const words = timed(TRANSCRIPTS.talk);
const { origin, close } = await startServer();
const browser = await launch();
const page = await openHarness(browser, origin, { width: 540, height: 960 });
const cdp = await page.target().createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(arg("cpu", 1)) });
const rows = [];
for (const l of listLooks().filter((l) => !lookFilter || lookFilter.includes(String(l.number)))) {
  const props = buildCaptions({ words, look: l.number });
  const r = await page.evaluate(async (props) => {
    window.__m?.destroy();
    document.body.style.cssText = "margin:0;width:540px;height:960px;position:relative";
    const m = (window.__m = window.CE.mountCaptions(document.body, props, { width: 1080, height: 1920 }));
    await m.ready();
    const times = [];
    for (let f = 0; f < 150; f++) {
      const t0 = performance.now();
      m.render((f * 1000) / 30);
      document.body.getBoundingClientRect(); // force style + layout, as a paint would
      void m.element.offsetHeight;
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { med: times[75], p95: times[142], max: times[149] };
  }, props);
  rows.push({ n: l.number, name: l.name, ...r });
}
rows.sort((a, b) => b.p95 - a.p95);
for (const r of rows) console.log(`#${r.n} ${r.name}: median ${r.med.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, max ${r.max.toFixed(1)} ms`);
await browser.close();
await close();
