/**
 * Live caption measurement, shared by audit.mjs (report) and calibrate.mjs (rules fixes): mounts captionseasy-web in
 * headless Chrome at 1080x1920 (fit none, 1 px = 1 composition px) and reads, from the real layout of each frame:
 *  - every visible text run's effective font size (computed font-size x the scale of the transforms above it);
 *    canvas-drawn looks are measured by recording fillText/strokeText on on-screen canvases
 *  - the box all visible text covers
 * Rules (limits) live in packages/templates/src/rules.ts; this file only measures.
 */
import { buildCaptions } from "captionseasy";
import { launch, openHarness, startServer } from "./harness.mjs";
import { timed, TRANSCRIPTS } from "./transcripts.mjs";

export const W = 1080, H = 1920;

/** sample moments: each card settled (word start + 260 ms), every other word */
export function momentsFor(words) {
  const t = [];
  for (let i = 0; i < words.length; i += 2) t.push(Math.min(words[i].startMs + 260, words[i].endMs + 120));
  return t;
}

/**
 * transcripts: the first is the main one (its words build the props you pass); with more, measure() also lays the
 * same style out on each of them and reports the worst case (long words, a number, short punchy cards).
 */
export async function openMeasurer({ transcript = "talk", transcripts = [transcript] } = {}) {
  const sets = transcripts.map((t) => timed(TRANSCRIPTS[t] ?? t));
  const words = sets[0];
  const { origin, close } = await startServer();
  const browser = await launch();
  const page = await openHarness(browser, origin, { width: W, height: H });
  await page.evaluate(() => {
    window.__drawn = [];
    for (const C of [CanvasRenderingContext2D]) {
      for (const fn of ["fillText", "strokeText"]) {
        const orig = C.prototype[fn];
        C.prototype[fn] = function (t, x, y, ...rest) {
          const el = this.canvas;
          if (window.__record && String(t).trim() && el.isConnected && this.globalAlpha > 0.15) {
            const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
            const tr = this.getTransform();
            const css = el.getBoundingClientRect();
            const k = css.width / el.width;
            const p = tr.transformPoint(new DOMPoint(x, y));
            const size = (m ? +m[1] : 0) * Math.hypot(tr.a, tr.b) * k;
            const wpx = this.measureText(String(t)).width * Math.hypot(tr.a, tr.b) * k;
            const align = this.textAlign;
            const left = css.left + p.x * k - (align === "center" ? wpx / 2 : align === "right" || align === "end" ? wpx : 0);
            const top = css.top + p.y * k;
            window.__drawn.push({ text: String(t), size, x0: left, x1: left + wpx, y0: top - size * 0.8, y1: top + size * 0.2 });
          }
          return orig.call(this, t, x, y, ...rest);
        };
      }
    }
    window.measureFrame = () => {
      const root = window.__mount.element;
      const items = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim();
        if (!t) continue;
        const el = n.parentElement;
        let op = 1, hidden = false;
        for (let e = el; e && e !== root.parentElement; e = e.parentElement) {
          const cs = getComputedStyle(e);
          op *= Number(cs.opacity);
          if (cs.visibility === "hidden" || cs.display === "none") hidden = true;
        }
        if (hidden || op < 0.15) continue;
        const cs = getComputedStyle(el);
        const clear = (c) => /rgba\(.*,\s*0\)$/.test(c) || c === "transparent";
        if (clear(cs.webkitTextFillColor || cs.color) && parseFloat(cs.webkitTextStrokeWidth || "0") === 0 && cs.backgroundClip !== "text" && cs.webkitBackgroundClip !== "text") continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const rects = [...r.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5);
        if (!rects.length) continue;
        // the scale of every transform above the text (rotation-free: sqrt of the 2D determinant)
        let scale = 1;
        for (let e = el; e && e !== root.parentElement; e = e.parentElement) {
          const tf = getComputedStyle(e).transform;
          if (tf && tf !== "none") {
            const mx = new DOMMatrix(tf);
            scale *= Math.sqrt(Math.abs(mx.a * mx.d - mx.b * mx.c));
          }
        }
        for (const q of rects) items.push({ text: t, size: parseFloat(cs.fontSize) * scale, x0: q.left, y0: q.top, x1: q.right, y1: q.bottom });
      }
      for (const d of window.__drawn) items.push(d);
      return items;
    };
    window.measureProps = async (props, times, W, H) => {
      window.__mount?.destroy();
      const host = document.body;
      host.style.cssText = `margin:0;width:${W}px;height:${H}px;position:relative;overflow:hidden`;
      window.__mount = window.CE.mountCaptions(host, props, { width: W, height: H, fit: "none" });
      await window.__mount.ready();
      const res = [];
      for (const t of times) {
        window.__drawn = [];
        window.__record = true;
        window.__mount.render(t);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.__record = false;
        res.push({ t, items: window.measureFrame() });
      }
      return res;
    };
  });

  /** measure props on every transcript (same style and settings) -> the worst case, or null if nothing measurable */
  async function measure(props, look = props.look?.number) {
    const all = [await measureOne(props, momentsFor(words))];
    for (const set of sets.slice(1)) {
      if (look === undefined) break;
      const p = { ...buildCaptions({ words: set, look }), style: props.style, settings: props.settings };
      all.push(await measureOne(p, momentsFor(set)));
    }
    const ok = all.filter(Boolean);
    if (!ok.length) return null;
    return {
      frames: ok.reduce((n, r) => n + r.frames, 0),
      minSize: Math.min(...ok.map((r) => r.minSize)), maxSize: Math.max(...ok.map((r) => r.maxSize)), peakSize: Math.max(...ok.map((r) => r.peakSize)),
      ratio: Math.max(...ok.map((r) => r.ratio)),
      box: { x0: Math.min(...ok.map((r) => r.box.x0)), y0: Math.min(...ok.map((r) => r.box.y0)), x1: Math.max(...ok.map((r) => r.box.x1)), y1: Math.max(...ok.map((r) => r.box.y1)) },
      outer: { x0: Math.min(...ok.map((r) => r.outer.x0)), y0: Math.min(...ok.map((r) => r.outer.y0)), x1: Math.max(...ok.map((r) => r.outer.x1)), y1: Math.max(...ok.map((r) => r.outer.y1)) },
    };
  }
  /** one props object -> summary (sizes in px at 1080 wide, box in composition px) */
  async function measureOne(props, times) {
    const frames = await page.evaluate((p, t, w, h) => window.measureProps(p, t, w, h), props, times, W, H);
    if (process.env.MEASURE_DEBUG) for (const f of frames) console.log(f.t, f.items.map((i) => `${i.text}:${Math.round(i.size)}`).join(" "));
    const per = frames.filter((f) => f.items.some((i) => i.size > 0)).map((f) => {
      const sizes = f.items.map((i) => i.size).filter((s) => s > 0);
      return {
        t: f.t, min: Math.min(...sizes), max: Math.max(...sizes),
        box: { x0: Math.min(...f.items.map((i) => i.x0)), y0: Math.min(...f.items.map((i) => i.y0)), x1: Math.max(...f.items.map((i) => i.x1)), y1: Math.max(...f.items.map((i) => i.y1)) },
      };
    });
    if (!per.length) return null;
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    // the caption block: median edges over the frames (one wild frame mid-animation does not move it)
    return {
      frames: per.length,
      minSize: med(per.map((p) => p.min)), maxSize: med(per.map((p) => p.max)), peakSize: Math.max(...per.map((p) => p.max)),
      ratio: med(per.map((p) => p.max / Math.max(1, p.min))),
      box: { x0: med(per.map((p) => p.box.x0)), y0: med(per.map((p) => p.box.y0)), x1: med(per.map((p) => p.box.x1)), y1: med(per.map((p) => p.box.y1)) },
      outer: { x0: Math.min(...per.map((p) => p.box.x0)), y0: Math.min(...per.map((p) => p.box.y0)), x1: Math.max(...per.map((p) => p.box.x1)), y1: Math.max(...per.map((p) => p.box.y1)) },
    };
  }
  return {
    words, measure, errors: page.errors,
    async close() {
      await browser.close();
      await close();
    },
  };
}
