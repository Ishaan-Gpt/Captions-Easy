/**
 * captionseasy-web in headless Chrome (Remotion's chrome-headless-shell): determinism, the DOM renderer as a pure
 * function of time, export, and a small visual regression set against committed Remotion server renders
 * (test/fixtures, regenerate with `node scripts/fixtures.mjs`). The full 100-look run is opt-in:
 * CAPTIONSEASY_WEB_REGRESSION=1 (see regression.test.ts / scripts/regression.mjs).
 *
 * Skipped when no headless Chrome is on this machine or CAPTIONSEASY_WEB_NO_BROWSER=1. Needs network for Google Fonts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCaptions } from "captionseasy";
// @ts-expect-error untyped .mjs helper
import { SAMPLE_WORDS, chromePath, launch, openHarness, pkgDir, startServer } from "../scripts/harness.mjs";

const fixturesDir = join(pkgDir, "test", "fixtures");
const enabled = !process.env.CAPTIONSEASY_WEB_NO_BROWSER && !!chromePath();

type Page = { evaluate: <T>(fn: (...a: never[]) => T | Promise<T>, ...args: unknown[]) => Promise<T>; errors: string[] };

describe.skipIf(!enabled)("captionseasy-web in headless Chrome", () => {
  let srv: { origin: string; close: () => Promise<void> };
  let browser: { close: () => Promise<void> };
  let page: Page;
  const manifest = JSON.parse(readFileSync(join(fixturesDir, "manifest.json"), "utf8")) as { size: { width: number; height: number; fps: number }; fixtures: { look: number; timeMs: number; file: string; props: unknown }[] };
  const size = manifest.size;
  const props = (look: number) => buildCaptions({ words: SAMPLE_WORDS, look });

  beforeAll(async () => {
    if (!existsSync(join(pkgDir, "dist", "index.mjs"))) execFileSync(process.execPath, [join(pkgDir, "scripts", "build.mjs")], { stdio: "inherit" });
    srv = await startServer({ refDir: fixturesDir });
    browser = await launch();
    page = await openHarness(browser, srv.origin, { width: 800, height: 900 });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await srv?.close();
  });

  it("is deterministic: same props + time -> same pixels (both engines)", async () => {
    const p = props(5);
    for (const engine of ["svg", "remotion"]) {
      const a = await page.evaluate((pp: never, s: never) => (window as never as { webFrame: (...x: unknown[]) => Promise<{ hash: string }> }).webFrame(pp, 1300, s), p, { ...size, engine });
      const b = await page.evaluate((pp: never, s: never) => (window as never as { webFrame: (...x: unknown[]) => Promise<{ hash: string }> }).webFrame(pp, 1300, s), p, { ...size, engine });
      const c = await page.evaluate((pp: never, s: never) => (window as never as { webFrame: (...x: unknown[]) => Promise<{ hash: string }> }).webFrame(pp, 300, s), p, { ...size, engine });
      expect(a.hash, engine).toBe(b.hash);
      expect(c.hash, engine).not.toBe(a.hash);
    }
  }, 120_000);

  it("matches Remotion's server render of representative looks (svg engine)", async () => {
    const worst: Record<string, number> = {};
    for (const f of manifest.fixtures) {
      const web = await page.evaluate((pp: never, t: never, s: never) => (window as never as { webFrame: (...x: unknown[]) => Promise<{ png: string }> }).webFrame(pp, t, s), f.props, f.timeMs, { ...size, engine: "svg" });
      const m = await page.evaluate(
        (a: never, b: never, w: never, h: never) => (window as never as { compareImages: (...x: unknown[]) => Promise<{ coarse: number; ink: number }> }).compareImages(a, b, w, h, false),
        `data:image/png;base64,${web.png}`,
        `/ref/${f.file}`,
        size.width,
        size.height,
      );
      worst[f.file] = m.coarse;
      expect(m.ink, f.file).toBeGreaterThan(100);
    }
    for (const [file, coarse] of Object.entries(worst)) expect(coarse, file).toBeLessThanOrEqual(0.02);
  }, 180_000);

  it("mountCaptions renders the DOM as a pure function of time", async () => {
    const r = await page.evaluate(
      async (pp: never, s: never) => {
        const CE = (window as never as { CE: typeof import("../src/index") }).CE;
        const host = document.createElement("div");
        host.style.cssText = "width:360px;height:640px";
        document.body.appendChild(host);
        const m = CE.mountCaptions(host, pp, s);
        await m.ready();
        m.render(1300);
        const a = m.element.innerHTML;
        m.render(300);
        const b = m.element.innerHTML;
        m.render(1300);
        const c = m.element.innerHTML;
        m.destroy();
        const left = host.children.length;
        host.remove();
        return { same: a === c, differs: a !== b, nonEmpty: a.length > 200, left };
      },
      props(12),
      size,
    );
    expect(r).toEqual({ same: true, differs: true, nonEmpty: true, left: 0 });
  }, 60_000);

  it("exports a transparent PNG sequence and a VP9-alpha WebM", async () => {
    const r = await page.evaluate(
      async (pp: never, s: never) => {
        const CE = (window as never as { CE: typeof import("../src/index") }).CE;
        const png = await CE.exportFrames(pp, { ...(s as object), width: 180, height: 320, format: "png-sequence", startMs: 0, endMs: 300 } as never);
        const sig = new Uint8Array(await png.frames![0].arrayBuffer()).slice(0, 4).join(",");
        const webm = await CE.exportFrames(pp, { ...(s as object), width: 180, height: 320, format: "webm", startMs: 0, endMs: 300 } as never);
        const magic = [...new Uint8Array(await webm.blob!.arrayBuffer()).slice(0, 4)].map((b) => b.toString(16)).join("");
        return { engine: png.engine, frames: png.frames!.length, count: png.frameCount, sig, webm: webm.blob!.size, magic };
      },
      props(5),
      size,
    );
    expect(r.engine).toBe("svg");
    expect(r.frames).toBe(r.count);
    expect(r.count).toBe(10); // frames 0..9 (300 ms at 30 fps, inclusive)
    expect(r.sig).toBe("137,80,78,71");
    expect(r.magic).toBe("1a45dfa3");
    expect(r.webm).toBeGreaterThan(500);
  }, 120_000);

  it("rejects bad input with clear errors", async () => {
    const msg = await page.evaluate(async () => {
      const CE = (window as never as { CE: typeof import("../src/index") }).CE;
      const out: string[] = [];
      for (const f of [() => CE.mountCaptions(document.body, {} as never, { width: 10, height: 10 }), () => CE.mountCaptions(document.body, { doc: { words: [] }, style: {} }, { width: 0, height: 10 })]) {
        try {
          f();
        } catch (e) {
          out.push(String((e as Error).message));
        }
      }
      return out;
    });
    expect(msg[0]).toMatch(/buildCaptions/);
    expect(msg[1]).toMatch(/width must be a positive number/);
  });

  it("raised no page errors", () => {
    expect(page.errors).toEqual([]);
  });
});
