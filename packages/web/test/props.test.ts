import { describe, expect, it } from "vitest";
import { buildCaptions } from "captionseasy";
import { captionsEndMs, durationInFrames, frameAt, toInputProps } from "../src/props";

const words = "one two three four".split(" ").map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 380 }));

describe("props contract", () => {
  it("passes buildCaptions() output through as a transparent overlay, dropping report-only fields", () => {
    const props = buildCaptions({ words, look: 5 });
    const input = toInputProps(props as never, { width: 1080, height: 1920 });
    expect(input.doc).toBe(props.doc);
    expect(input.style).toBe(props.style);
    expect(input.settings).toBe(props.settings);
    expect(input).toMatchObject({ src: null, mode: "overlay", backdrop: null, media: { width: 1080, height: 1920, fps: 30, durationMs: 1580 } });
    expect(input).not.toHaveProperty("look");
    expect(input).not.toHaveProperty("warnings");
  });

  it("forwards fields it does not know (layout, future tracks) untouched", () => {
    const props = { ...buildCaptions({ words, look: 5 }), layout: { safeZone: "tiktok" }, tracks: [{ look: 12, fromMs: 0, toMs: 800 }] };
    const input = toInputProps(props as never, { width: 720, height: 1280, fps: 60 });
    expect(input.layout).toBe(props.layout);
    expect(input.tracks).toBe(props.tracks);
    expect((input.media as { fps: number }).fps).toBe(60);
  });

  it("samples time like a Remotion render (frame = floor(t * fps), clamped)", () => {
    expect(frameAt(0, 30, 100)).toBe(0);
    expect(frameAt(33.3, 30, 100)).toBe(0);
    expect(frameAt(100, 30, 100)).toBe(3); // 1000/30*3 = 100.00000000000001
    expect(frameAt(1300, 30, 100)).toBe(39);
    expect(frameAt(-50, 30, 100)).toBe(0);
    expect(frameAt(1e9, 30, 100)).toBe(99);
    expect(() => frameAt(Number.NaN, 30, 100)).toThrow(/timeMs/);
  });

  it("holds every caption", () => {
    const props = buildCaptions({ words, look: 5 }) as never;
    expect(captionsEndMs(props)).toBe(1580);
    expect(durationInFrames(props, 30)).toBe(Math.ceil(2.58 * 30));
  });
});
