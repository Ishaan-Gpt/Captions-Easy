import { describe, expect, it } from "vitest";
import { GeneratorClipEngine, MaskingEngine, ShapeMaskConfig } from "./mediaMaskingEngine";

describe("Media Asset Overlays & Masking Engine (Phase 5)", () => {
  describe("GeneratorClipEngine", () => {
    it("generates 75% SMPTE Color Bars pixel buffer correctly", () => {
      const bars = GeneratorClipEngine.generateSMPTEBars(70, 10);
      expect(bars.length).toBe(70 * 10 * 4);

      // First bar (White: 191, 191, 191)
      expect(bars[0]).toBe(191);
      expect(bars[1]).toBe(191);
      expect(bars[2]).toBe(191);
      expect(bars[3]).toBe(255);
    });
  });

  describe("MaskingEngine Shape Masks", () => {
    it("evaluates rectangular shape mask bounds", () => {
      const mask: ShapeMaskConfig = {
        id: "m1",
        type: "rectangle",
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        featherRadius: 0,
        inverted: false,
      };

      expect(MaskingEngine.evaluateShapeMask(mask, 50, 50)).toBe(1.0);
      expect(MaskingEngine.evaluateShapeMask(mask, 200, 200)).toBe(0.0);
    });

    it("evaluates elliptical shape mask radial bounds", () => {
      const mask: ShapeMaskConfig = {
        id: "m2",
        type: "ellipse",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        featherRadius: 0,
        inverted: false,
      };

      expect(MaskingEngine.evaluateShapeMask(mask, 50, 50)).toBe(1.0); // Center of ellipse
      expect(MaskingEngine.evaluateShapeMask(mask, 99, 99)).toBe(0.0); // Outside corner
    });

    it("evaluates arbitrary vector Bezier polygon paths using ray-casting", () => {
      const mask: ShapeMaskConfig = {
        id: "m3",
        type: "bezierPath",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        bezierPoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 100 },
        ],
        featherRadius: 0,
        inverted: false,
      };

      expect(MaskingEngine.evaluateShapeMask(mask, 50, 20)).toBe(1.0);
      expect(MaskingEngine.evaluateShapeMask(mask, 5, 90)).toBe(0.0);
    });
  });

  describe("MaskingEngine Track Mattes", () => {
    it("clips base layer using Luma Matte luminance formula (Y = 0.2126R + 0.7152G + 0.0722B)", () => {
      const base: [number, number, number, number] = [255, 255, 255, 255];
      const whiteMatte: [number, number, number, number] = [255, 255, 255, 255];
      const blackMatte: [number, number, number, number] = [0, 0, 0, 255];

      const whiteRes = MaskingEngine.evaluateTrackMatte(base, whiteMatte, "luma");
      const blackRes = MaskingEngine.evaluateTrackMatte(base, blackMatte, "luma");

      expect(whiteRes[3]).toBe(255);
      expect(blackRes[3]).toBe(0);
    });

    it("clips base layer using Alpha Matte transparency", () => {
      const base: [number, number, number, number] = [255, 0, 0, 255];
      const semiMatte: [number, number, number, number] = [0, 0, 0, 128];

      const res = MaskingEngine.evaluateTrackMatte(base, semiMatte, "alpha");
      expect(res[3]).toBe(128);
    });
  });
});
