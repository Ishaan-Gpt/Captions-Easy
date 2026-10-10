/**
 * WGSL Shader definitions for WebGPU Zero-Copy Compositing Pipeline (Phase 5).
 * Implements 14 exact blend modes with automatic clamping, 2D Affine transform matrices,
 * multi-track external texture ingestion, and Gaussian blur mask feathering.
 */

export type BlendMode =
  | "normal"
  | "premultiplied"
  | "multiply"
  | "darken"
  | "colorBurn"
  | "screen"
  | "linearDodge"
  | "lighten"
  | "colorDodge"
  | "overlay"
  | "softLight"
  | "hardLight"
  | "difference"
  | "exclusion"
  | "luminosity";

/**
 * Generates high-performance WGSL fragment shader code for evaluating specific layer blend mode math.
 */
export function getWGSLBlendModeShader(blendMode: BlendMode): string {
  const blendFormulaWGSL: Record<BlendMode, string> = {
    normal: `
      let outColor = vec3<f32>(src.rgb * src.a + dst.rgb * (1.0 - src.a));
      let outAlpha = src.a + dst.a * (1.0 - src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(outAlpha, 0.0, 1.0));
    `,
    premultiplied: `
      let outColor = vec3<f32>(src.rgb + dst.rgb * (1.0 - src.a));
      let outAlpha = src.a + dst.a * (1.0 - src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(outAlpha, 0.0, 1.0));
    `,
    multiply: `
      let blended = src.rgb * dst.rgb;
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    darken: `
      let blended = min(src.rgb, dst.rgb);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    colorBurn: `
      let safeSrc = max(src.rgb, vec3<f32>(0.0001));
      let blended = clamp(vec3<f32>(1.0) - (vec3<f32>(1.0) - dst.rgb) / safeSrc, vec3<f32>(0.0), vec3<f32>(1.0));
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    screen: `
      let blended = vec3<f32>(1.0) - (vec3<f32>(1.0) - src.rgb) * (vec3<f32>(1.0) - dst.rgb);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    linearDodge: `
      let blended = src.rgb + dst.rgb;
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    lighten: `
      let blended = max(src.rgb, dst.rgb);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    colorDodge: `
      let safeInvSrc = max(vec3<f32>(1.0) - src.rgb, vec3<f32>(0.0001));
      let blended = clamp(dst.rgb / safeInvSrc, vec3<f32>(0.0), vec3<f32>(1.0));
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    overlay: `
      let low = 2.0 * src.rgb * dst.rgb;
      let high = vec3<f32>(1.0) - 2.0 * (vec3<f32>(1.0) - src.rgb) * (vec3<f32>(1.0) - dst.rgb);
      let cond = vec3<f32>(select(0.0, 1.0, dst.r >= 0.5), select(0.0, 1.0, dst.g >= 0.5), select(0.0, 1.0, dst.b >= 0.5));
      let blended = mix(low, high, cond);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    softLight: `
      let low = 2.0 * src.rgb * dst.rgb + dst.rgb * dst.rgb * (vec3<f32>(1.0) - 2.0 * src.rgb);
      let high = sqrt(dst.rgb) * (2.0 * src.rgb - vec3<f32>(1.0)) + 2.0 * dst.rgb * (vec3<f32>(1.0) - src.rgb);
      let cond = vec3<f32>(select(0.0, 1.0, src.r >= 0.5), select(0.0, 1.0, src.g >= 0.5), select(0.0, 1.0, src.b >= 0.5));
      let blended = mix(low, high, cond);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    hardLight: `
      let low = 2.0 * src.rgb * dst.rgb;
      let high = vec3<f32>(1.0) - 2.0 * (vec3<f32>(1.0) - src.rgb) * (vec3<f32>(1.0) - dst.rgb);
      let cond = vec3<f32>(select(0.0, 1.0, src.r >= 0.5), select(0.0, 1.0, src.g >= 0.5), select(0.0, 1.0, src.b >= 0.5));
      let blended = mix(low, high, cond);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    difference: `
      let blended = abs(dst.rgb - src.rgb);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    exclusion: `
      let blended = src.rgb + dst.rgb - 2.0 * src.rgb * dst.rgb;
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
    luminosity: `
      let srcLuma = 0.2126 * src.r + 0.7152 * src.g + 0.0722 * src.b;
      let dstLuma = 0.2126 * dst.r + 0.7152 * dst.g + 0.0722 * dst.b;
      let blended = dst.rgb + vec3<f32>(srcLuma - dstLuma);
      let outColor = mix(dst.rgb, blended, src.a);
      return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), dst.a);
    `,
  };

  return `
    struct LayerUniforms {
      transformMatrix: mat3x3<f32>,
      opacity: f32,
      padding: vec3<f32>,
    };

    @group(0) @binding(0) var dstTexture: texture_2d<f32>;
    @group(0) @binding(1) var srcTexture: texture_2d<f32>;
    @group(0) @binding(2) var textureSampler: sampler;
    @group(0) @binding(3) var<uniform> uniforms: LayerUniforms;

    @fragment
    fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
      let dst = textureSample(dstTexture, textureSampler, uv);
      
      // Transform UV mapping using 2D affine matrix
      let transformedPos = uniforms.transformMatrix * vec3<f32>(uv, 1.0);
      let srcUV = transformedPos.xy;

      // Bounds checking
      if (srcUV.x < 0.0 || srcUV.x > 1.0 || srcUV.y < 0.0 || srcUV.y > 1.0) {
        return dst;
      }

      var src = textureSample(srcTexture, textureSampler, srcUV);
      src.a = src.a * uniforms.opacity;

      ${blendFormulaWGSL[blendMode]}
    }
  `;
}

/**
 * WGSL Gaussian Blur Convolution Shader for Mask Edge Feathering.
 */
export function getWGSLGaussianBlurShader(): string {
  return `
    struct BlurUniforms {
      direction: vec2<f32>,
      kernelRadius: i32,
      padding: i32,
    };

    @group(0) @binding(0) var inputTexture: texture_2d<f32>;
    @group(0) @binding(1) var textureSampler: sampler;
    @group(0) @binding(2) var<uniform> uniforms: BlurUniforms;

    @fragment
    fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
      let texSize = vec2<f32>(textureDimensions(inputTexture));
      let texelSize = vec2<f32>(1.0 / texSize.x, 1.0 / texSize.y);
      
      var colorAcc = vec4<f32>(0.0);
      var weightAcc = 0.0;

      let radius = uniforms.kernelRadius;
      for (var i = -radius; i <= radius; i = i + 1) {
        let offset = uniforms.direction * vec2<f32>(f32(i)) * texelSize;
        let sampleUV = clamp(uv + offset, vec2<f32>(0.0), vec2<f32>(1.0));
        
        let sigma = max(f32(radius) / 3.0, 1.0);
        let weight = exp(-f32(i * i) / (2.0 * sigma * sigma));
        
        colorAcc = colorAcc + textureSample(inputTexture, textureSampler, sampleUV) * weight;
        weightAcc = weightAcc + weight;
      }

      return colorAcc / weightAcc;
    }
  `;
}
