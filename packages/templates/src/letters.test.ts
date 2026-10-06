import { describe, expect, it } from "vitest";
import { LETTER_ANIMATORS, letterAmount } from "./motion";

// values below are the After Effects expressions evaluated by hand (see the presets in motion.ts)
describe("letter animators (AE preset transcriptions)", () => {
  it("every letter is fully out before it starts and lands at rest", () => {
    for (const t of LETTER_ANIMATORS) {
      const [ax, ay] = letterAmount(t, 0, 5, 14);
      expect(Math.max(ax, ay), t).toBe(100);
      const [rx, ry] = letterAmount(t, 3, 5, 14);
      expect(Math.abs(rx) + Math.abs(ry), t).toBeLessThan(0.5);
    }
  });

  it("spin: linear for 0.15 s after its frame, then overshoots below zero", () => {
    // letter 3 starts at 3/30 s; half way through the linear part the amount is 50
    expect(letterAmount("letter-spin", 3 / 30 + 0.075, 3, 14)[0]).toBeCloseTo(50, 5);
    expect(letterAmount("letter-spin", 3 / 30 + 0.15 + 0.1, 3, 14)[0]).toBeLessThan(-20);
  });

  it("elastic: 100·cos(4 Hz)·e^(-10t), two frames per letter", () => {
    const t = 0.125;
    expect(letterAmount("letter-elastic", 2 * 2 / 30 + t, 2, 14)[0]).toBeCloseTo(-100 * Math.exp(-1.25), 5);
  });

  it("snap: quartic ease-out over 0.25 s, 1.5 frames per letter counted from the first", () => {
    expect(letterAmount("letter-snap", 0.125, 1, 14)[0]).toBeCloseTo(100 * Math.pow(0.5, 4), 5);
  });

  it("burst: the middle letter starts first, the ends last", () => {
    const at = (i: number) => letterAmount("letter-burst", 0.2, i, 13)[0];
    expect(at(7)).toBeLessThan(at(4));
    expect(at(4)).toBeLessThan(at(1));
    expect(at(1)).toBe(at(13));
  });

  it("stretch: only the vertical axis moves", () => {
    const [ax, ay] = letterAmount("letter-stretch", 0.05, 1, 14);
    expect(ax).toBe(0);
    expect(ay).toBeGreaterThan(0);
  });
});
