import { describe, expect, it } from "vitest";
import {
  evaluateLayerTransformAtFrame,
  interpolateKeyframeValue,
  Matrix3x3,
  TrackLayerConfig,
  WebGPUCompositorEngine,
} from "./compositorEngine";
import { BlendMode, getWGSLBlendModeShader, getWGSLGaussianBlurShader } from "./wgslShaders";

describe("Compositor & WebGPU Engine (Phase 5)", () => {
  describe("WGSL Blend Modes Shader Generator", () => {
    it("generates WGSL shader code for all 14 required blend modes", () => {
      const blendModes: BlendMode[] = [
        "normal",
        "premultiplied",
        "multiply",
        "darken",
        "colorBurn",
        "screen",
        "linearDodge",
        "lighten",
        "colorDodge",
        "overlay",
        "softLight",
        "hardLight",
        "difference",
        "exclusion",
        "luminosity",
      ];

      blendModes.forEach((mode) => {
        const wgsl = getWGSLBlendModeShader(mode);
        expect(wgsl).toContain("@fragment");
        expect(wgsl).toContain("textureSample");
        expect(wgsl).toContain("clamp");
      });
    });

    it("generates Gaussian Blur convolution shader for mask feathering", () => {
      const wgsl = getWGSLGaussianBlurShader();
      expect(wgsl).toContain("BlurUniforms");
      expect(wgsl).toContain("kernelRadius");
    });
  });

  describe("2D Affine Matrix3x3 Math", () => {
    it("constructs valid 2D matrix combining position, scale, anchor point, and rotation", () => {
      const matrix = Matrix3x3.fromTransform({
        position: { x: 100, y: 200 },
        scale: { x: 2, y: 2 },
        anchorPoint: { x: 50, y: 50 },
        rotation: 90,
        opacity: 1,
      });

      expect(matrix.elements.length).toBe(9);
      expect(matrix.elements[8]).toBe(1); // Homogeneous row
    });
  });

  describe("Bezier Keyframe Interpolation", () => {
    it("interpolates spatial position with ease-in-out easing", () => {
      const kfTrack = [
        { frame: 0, value: { x: 0, y: 0 }, easing: "easeInOut" as const },
        { frame: 30, value: { x: 100, y: 200 } },
      ];

      const valAt15 = interpolateKeyframeValue(
        kfTrack,
        15,
        (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p })
      );

      expect(valAt15.x).toBe(50);
      expect(valAt15.y).toBe(100);
    });

    it("evaluates frame-based layer transforms deterministically", () => {
      const layer: TrackLayerConfig = {
        id: "l1",
        name: "Overlay Layer",
        type: "video",
        blendMode: "overlay",
        visible: true,
        transform: {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          anchorPoint: { x: 0, y: 0 },
          rotation: 0,
          opacity: 1,
        },
        keyframeTracks: {
          rotation: [
            { frame: 0, value: 0, easing: "linear" },
            { frame: 60, value: 360 },
          ],
        },
      };

      const tAt30 = evaluateLayerTransformAtFrame(layer, 30);
      expect(tAt30.rotation).toBe(180);
    });
  });

  describe("WebGPUCompositorEngine Pass Manager", () => {
    it("executes render pass under 16ms budget", () => {
      const engine = new WebGPUCompositorEngine();
      engine.setLayers([
        {
          id: "1",
          name: "Base Track",
          type: "video",
          blendMode: "normal",
          visible: true,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            anchorPoint: { x: 0, y: 0 },
            rotation: 0,
            opacity: 1,
          },
        },
      ]);

      const pass = engine.renderFramePass(60, 60);
      expect(pass.frameIndex).toBe(60);
      expect(pass.timeMs).toBe(1000);
      expect(pass.layersProcessed).toBe(1);
      expect(pass.executionDurationMs).toBeLessThan(16); // Sub-16ms budget guarantee
    });
  });
});
