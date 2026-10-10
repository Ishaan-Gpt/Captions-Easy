import { describe, expect, it } from "vitest";
import {
  calculateSMPTESafeZones,
  cubicBezier,
  Easing,
  evaluateKineticTypography,
  generateSDFAtlas,
  interpolate,
  spring,
} from "./motionGraphicsEngine";

describe("Motion Graphics Engine (Phase 5)", () => {
  describe("interpolate()", () => {
    it("linearly interpolates within range", () => {
      const res = interpolate(15, [0, 30], [0, 100]);
      expect(res).toBe(50);
    });

    it("handles clamping on left and right bounds by default", () => {
      expect(interpolate(-10, [0, 30], [0, 100])).toBe(0);
      expect(interpolate(40, [0, 30], [0, 100])).toBe(100);
    });

    it("respects custom easing curves like cubic bezier", () => {
      const customEase = cubicBezier(0.42, 0, 0.58, 1);
      const res = interpolate(15, [0, 30], [0, 100], { easing: customEase });
      expect(res).toBeGreaterThan(0);
      expect(res).toBeLessThan(100);
    });

    it("supports extend extrapolation mode", () => {
      const res = interpolate(40, [0, 30], [0, 100], { extrapolateRight: "extend" });
      expect(res).toBeGreaterThan(100);
    });
  });

  describe("spring()", () => {
    it("evaluates frame 0 to initial 'from' value", () => {
      const val = spring({ frame: 0, fps: 60, config: { from: 10, to: 100 } });
      expect(val).toBe(10);
    });

    it("converges towards target 'to' value over time", () => {
      const valFrame30 = spring({ frame: 30, fps: 60, config: { from: 0, to: 1 } });
      const valFrame120 = spring({ frame: 120, fps: 60, config: { from: 0, to: 1 } });
      expect(valFrame30).toBeGreaterThan(0.5);
      expect(Math.abs(valFrame120 - 1)).toBeLessThan(0.05);
    });

    it("evaluates underdamped spring oscillation correctly", () => {
      const valUnderdamped = spring({
        frame: 15,
        fps: 60,
        config: { mass: 1, stiffness: 200, damping: 5, from: 0, to: 1 },
      });
      expect(valUnderdamped).toBeGreaterThan(0);
    });
  });

  describe("evaluateKineticTypography()", () => {
    it("staggers per-word animation delays derived from current frame", () => {
      const transforms = evaluateKineticTypography(10, {
        text: "KINETIC MOTION ENGINE",
        staggerMode: "word",
        staggerDelayFrames: 5,
        yOffset: 50,
      });

      expect(transforms.length).toBe(3);
      expect(transforms[0].text).toBe("KINETIC");
      expect(transforms[1].text).toBe("MOTION");
      expect(transforms[2].text).toBe("ENGINE");

      // Word 0 has higher progress than Word 2 due to stagger delay
      expect(transforms[0].opacity).toBeGreaterThan(transforms[2].opacity);
      expect(transforms[0].translateY).toBeLessThan(transforms[2].translateY);
    });
  });

  describe("calculateSMPTESafeZones()", () => {
    it("computes accurate 80% Title Safe and 90% Action Safe bounds", () => {
      const zones = calculateSMPTESafeZones(1920, 1080);

      expect(zones.actionSafe.width).toBe(1920 * 0.9);
      expect(zones.actionSafe.height).toBe(1080 * 0.9);
      expect(zones.actionSafe.x).toBe(1920 * 0.05);
      expect(zones.actionSafe.y).toBe(1080 * 0.05);

      expect(zones.titleSafe.width).toBe(1920 * 0.8);
      expect(zones.titleSafe.height).toBe(1080 * 0.8);
      expect(zones.titleSafe.x).toBe(1920 * 0.1);
      expect(zones.titleSafe.y).toBe(1080 * 0.1);
    });
  });

  describe("generateSDFAtlas()", () => {
    it("generates SDF distance atlas data structures correctly", () => {
      const atlas = generateSDFAtlas("ABC", 32, 4);
      expect(atlas.width).toBeGreaterThan(0);
      expect(atlas.height).toBeGreaterThan(0);
      expect(atlas.charMap.has("A")).toBe(true);
      expect(atlas.imageData.length).toBe(atlas.width * atlas.height * 4);
    });
  });
});
