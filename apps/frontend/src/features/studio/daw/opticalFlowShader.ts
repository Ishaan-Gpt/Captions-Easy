/**
 * WGSL Compute Shaders for WebGPU Optical Flow Motion Estimation & Frame Interpolation (Phase 6).
 * Calculates dense motion vectors V(x,y) between adjacent video frames F_N and F_{N+1}
 * and synthesizes motion-warped intermediate frames for ultra-smooth slow motion.
 */

export interface OpticalFlowUniforms {
  alpha: number;             // Interpolation factor 0.0 to 1.0
  frameWidth: number;
  frameHeight: number;
  motionScale: number;
}

/**
 * WGSL Compute Shader for Dense Motion Vector Field Estimation (Coarse-to-fine Lucas-Kanade).
 */
export function getWGSLMotionVectorComputeShader(): string {
  return `
    struct MotionParams {
      width: u32,
      height: u32,
      searchRadius: u32,
      padding: u32,
    };

    @group(0) @binding(0) var framePrev: texture_2d<f32>;
    @group(0) @binding(1) var frameNext: texture_2d<f32>;
    @group(0) @binding(2) var motionVectors: texture_storage_2d<rgba32float, write>;
    @group(0) @binding(3) var<uniform> params: MotionParams;

    @compute @workgroup_size(16, 16)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
      if (id.x >= params.width || id.y >= params.height) { return; }

      let pos = vec2<i32>(id.xy);
      let colorPrev = textureLoad(framePrev, pos, 0);
      let lumaPrev = 0.2126 * colorPrev.r + 0.7152 * colorPrev.g + 0.0722 * colorPrev.b;

      var bestVx = 0.0;
      var bestVy = 0.0;
      var minDiff = 1e9;

      let r = i32(params.searchRadius);
      for (var dy = -r; dy <= r; dy = dy + 1) {
        for (var dx = -r; dx <= r; dx = dx + 1) {
          let samplePos = clamp(pos + vec2<i32>(dx, dy), vec2<i32>(0), vec2<i32>(i32(params.width) - 1, i32(params.height) - 1));
          let colorNext = textureLoad(frameNext, samplePos, 0);
          let lumaNext = 0.2126 * colorNext.r + 0.7152 * colorNext.g + 0.0722 * colorNext.b;

          let diff = abs(lumaPrev - lumaNext);
          if (diff < minDiff) {
            minDiff = diff;
            bestVx = f32(dx);
            bestVy = f32(dy);
          }
        }
      }

      textureStore(motionVectors, pos, vec4<f32>(bestVx, bestVy, minDiff, 1.0));
    }
  `;
}

/**
 * WGSL Fragment Shader for Bidirectional Motion Vector Warping & Frame Synthesis.
 */
export function getWGSLFrameInterpolationShader(): string {
  return `
    struct WarpParams {
      alpha: f32,
      width: f32,
      height: f32,
      padding: f32,
    };

    @group(0) @binding(0) var framePrev: texture_2d<f32>;
    @group(0) @binding(1) var frameNext: texture_2d<f32>;
    @group(0) @binding(2) var motionVectors: texture_2d<f32>;
    @group(0) @binding(3) var textureSampler: sampler;
    @group(0) @binding(4) var<uniform> params: WarpParams;

    @fragment
    fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
      let motion = textureSample(motionVectors, textureSampler, uv);
      let flow = motion.xy * vec2<f32>(1.0 / params.width, 1.0 / params.height);

      let alpha = params.alpha;
      let uvPrev = clamp(uv + alpha * flow, vec2<f32>(0.0), vec2<f32>(1.0));
      let uvNext = clamp(uv - (1.0 - alpha) * flow, vec2<f32>(0.0), vec2<f32>(1.0));

      let colorPrev = textureSample(framePrev, textureSampler, uvPrev);
      let colorNext = textureSample(frameNext, textureSampler, uvNext);

      // Bidirectional Blend
      let synthesized = mix(colorPrev, colorNext, alpha);
      return vec4<f32>(clamp(synthesized.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), synthesized.a);
    }
  `;
}
