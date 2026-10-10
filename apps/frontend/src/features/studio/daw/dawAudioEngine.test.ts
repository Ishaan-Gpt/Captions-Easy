import { describe, expect, it } from "vitest";
import {
  DAWAudioEngine,
  evaluateAutomationAtSample,
  LufsMeterEngine,
} from "./dawAudioEngine";

describe("DAW Audio Engine (Phase 6)", () => {
  describe("LufsMeterEngine", () => {
    it("computes EBU R128 LUFS and True Peak metrics for PCM audio buffer", () => {
      const meter = new LufsMeterEngine();
      // Generate 1kHz sine wave PCM samples
      const sampleRate = 48000;
      const samples = new Float32Array(4800); // 100ms
      for (let i = 0; i < samples.length; i++) {
        samples[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
      }

      const metrics = meter.processPcmBuffer(samples, sampleRate);
      expect(metrics.momentaryLufs).toBeGreaterThan(-70);
      expect(metrics.momentaryLufs).toBeLessThan(0);
      expect(metrics.truePeakDb).toBeGreaterThan(-10);
    });
  });

  describe("evaluateAutomationAtSample()", () => {
    it("evaluates sample-accurate volume automation keyframes", () => {
      const kfs = [
        { sampleOffset: 0, value: 0, easing: "linear" as const },
        { sampleOffset: 48000, value: 1.0 }, // 1 second ramp
      ];

      expect(evaluateAutomationAtSample(kfs, 0, 0)).toBe(0);
      expect(evaluateAutomationAtSample(kfs, 24000, 0)).toBe(0.5); // At 0.5s (24000 samples)
      expect(evaluateAutomationAtSample(kfs, 48000, 0)).toBe(1.0);
    });
  });

  describe("DAWAudioEngine EQ Response", () => {
    it("evaluates 5-band parametric EQ transfer function response", () => {
      const daw = new DAWAudioEngine();
      const bands = [
        { type: "peaking" as const, frequency: 1000, gainDb: 6, q: 1.0 },
      ];

      const gainAtCenter = daw.evaluateEqResponse(bands, 1000);
      const gainFarOff = daw.evaluateEqResponse(bands, 10000);

      expect(gainAtCenter).toBeGreaterThan(4);
      expect(gainFarOff).toBeLessThan(1);
    });
  });
});
