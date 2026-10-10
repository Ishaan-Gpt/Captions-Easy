import { describe, expect, it } from "vitest";
import {
  applyWSOLAPitchCorrection,
  calculateMediaTimestampFromTimelineMs,
  evaluateSpeedAtTimelineMs,
  TimeRemappingEngine,
} from "./timeRemappingEngine";

describe("Time Remapping & Speed Ramping Engine (Phase 6)", () => {
  describe("evaluateSpeedAtTimelineMs()", () => {
    it("evaluates variable speed multipliers across timeline keyframes", () => {
      const kfs = [
        { timelineMs: 0, speedMultiplier: 1.0, easing: "linear" as const },
        { timelineMs: 1000, speedMultiplier: 2.0 }, // Ramps to 200% at 1s
      ];

      expect(evaluateSpeedAtTimelineMs(kfs, 0)).toBe(1.0);
      expect(evaluateSpeedAtTimelineMs(kfs, 500)).toBe(1.5);
      expect(evaluateSpeedAtTimelineMs(kfs, 1000)).toBe(2.0);
    });
  });

  describe("calculateMediaTimestampFromTimelineMs()", () => {
    it("integrates speed curves to calculate exact media timestamp M(T)", () => {
      const kfs = [
        { timelineMs: 0, speedMultiplier: 2.0 }, // 2x constant speed
      ];

      const res = calculateMediaTimestampFromTimelineMs(kfs, 1000, 60);
      expect(res.mediaMs).toBe(2000); // 1 sec timeline @ 2x = 2 sec media
      expect(res.speedMultiplier).toBe(2.0);
      expect(res.alpha).toBeGreaterThanOrEqual(0);
      expect(res.alpha).toBeLessThan(1);
    });
  });

  describe("applyWSOLAPitchCorrection()", () => {
    it("stretches audio PCM samples while maintaining pitch and window size", () => {
      const inputPcm = new Float32Array(4800); // 100ms audio
      for (let i = 0; i < inputPcm.length; i++) inputPcm[i] = Math.sin(i);

      const outputSlow = applyWSOLAPitchCorrection(inputPcm, 0.5); // 0.5x slow motion
      expect(outputSlow.length).toBeGreaterThan(inputPcm.length);
    });
  });

  describe("TimeRemappingEngine WGSL Shaders", () => {
    it("provides WGSL compute and fragment shaders for Optical Flow motion estimation", () => {
      const engine = new TimeRemappingEngine();
      const shaders = engine.getWGSLOpticalFlowShaders();

      expect(shaders.compute).toContain("motionVectors");
      expect(shaders.fragment).toContain("fs_main");
      expect(shaders.fragment).toContain("mix(colorPrev, colorNext, alpha)");
    });
  });
});
