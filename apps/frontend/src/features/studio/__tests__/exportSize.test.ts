// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_EXPORT_LONG_EDGE, MAX_EXPORT_SHORT_EDGE, browserExportSize } from "../exportSize";

// Sentry SENTRY-COPPER-QUEEN-1C / -1D: an 8K source was encoded at 7680x4320, which browsers' H.264 encoders refuse.
describe("browserExportSize", () => {
  it("scales an 8K source down to 4K", () => {
    const s = browserExportSize(7680, 4320);
    expect(s).toEqual({ width: 3840, height: 2160, scale: 0.5 });
  });

  it("caps portrait 8K the same way", () => {
    const s = browserExportSize(4320, 7680);
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(MAX_EXPORT_LONG_EDGE);
    expect(Math.min(s.width, s.height)).toBeLessThanOrEqual(MAX_EXPORT_SHORT_EDGE);
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
  });

  it("leaves 4K and smaller sources alone", () => {
    expect(browserExportSize(3840, 2160)).toEqual({ width: 3840, height: 2160, scale: 1 });
    expect(browserExportSize(1080, 1920)).toEqual({ width: 1080, height: 1920, scale: 1 });
  });

  it("still honours a chosen short edge", () => {
    expect(browserExportSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720, scale: 1280 / 1920 });
    expect(browserExportSize(1080, 1920, 1080)).toEqual({ width: 1080, height: 1920, scale: 1 });
  });

  it("keeps odd-sized sources even after scaling", () => {
    const s = browserExportSize(8191, 4321);
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
    expect(s.width).toBeLessThanOrEqual(MAX_EXPORT_LONG_EDGE);
  });
});
