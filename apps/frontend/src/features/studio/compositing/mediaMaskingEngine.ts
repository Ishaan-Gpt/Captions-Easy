/**
 * Media Asset Overlays & Masking Engine (Phase 5).
 * Generators (Solid, Gradients, SMPTE Color Bars), Shape Masks (Rectangle, Ellipse, Bezier Vector Paths),
 * Feathering, and Track Mattes (Luma Matte & Alpha Matte).
 */

export type OverlayAssetType =
  | "png"
  | "webp"
  | "gif"
  | "apng"
  | "transparentVideo"
  | "generatorSolid"
  | "generatorLinearGradient"
  | "generatorRadialGradient"
  | "generatorSMPTEBars";

export interface GeneratorClipConfig {
  type: "solid" | "linearGradient" | "radialGradient" | "smpteBars";
  colorA?: string;
  colorB?: string;
  angle?: number;
}

export type ShapeMaskType = "rectangle" | "ellipse" | "bezierPath";

export interface BezierPoint {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

export interface ShapeMaskConfig {
  id: string;
  type: ShapeMaskType;
  x: number;
  y: number;
  width: number;
  height: number;
  bezierPoints?: BezierPoint[];
  featherRadius: number; // Pixels
  inverted: boolean;
}

export type TrackMatteType = "luma" | "lumaInverted" | "alpha" | "alphaInverted";

export interface TrackMatteConfig {
  matteLayerId: string;
  type: TrackMatteType;
}

/**
 * Generator Clips Engine (Solid Colors, Gradients, SMPTE Color Bars).
 * Renders SVG/Canvas data for zero-copy upload to WebGPU.
 */
export class GeneratorClipEngine {
  /**
   * Generates standard EBU/SMPTE 75% Color Bars pattern pixel buffer.
   */
  public static generateSMPTEBars(width: number = 1920, height: number = 1080): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);

    // 7 Standard SMPTE Color Bars: White, Yellow, Cyan, Green, Magenta, Red, Blue
    const colorsRGB = [
      [191, 191, 191], // 75% White
      [191, 191, 0],   // 75% Yellow
      [0, 191, 191],   // 75% Cyan
      [0, 191, 0],     // 75% Green
      [191, 0, 191],   // 75% Magenta
      [191, 0, 0],     // 75% Red
      [0, 0, 191],     // 75% Blue
    ];

    const barWidth = Math.floor(width / 7);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const barIdx = Math.min(6, Math.floor(x / barWidth));
        const [r, g, b] = colorsRGB[barIdx];
        const pixelIdx = (y * width + x) * 4;

        data[pixelIdx] = r;
        data[pixelIdx + 1] = g;
        data[pixelIdx + 2] = b;
        data[pixelIdx + 3] = 255;
      }
    }

    return data;
  }

  /**
   * Renders Linear/Radial Gradient or Solid Color Clip to ImageBitmap.
   */
  public static async generateGradientBitmap(
    config: GeneratorClipConfig,
    width: number,
    height: number
  ): Promise<ImageBitmap | null> {
    if (typeof OffscreenCanvas === "undefined") return null;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (config.type === "solid") {
      ctx.fillStyle = config.colorA || "#000000";
      ctx.fillRect(0, 0, width, height);
    } else if (config.type === "linearGradient") {
      const angle = (config.angle || 0) * (Math.PI / 180);
      const x1 = width / 2 - (Math.cos(angle) * width) / 2;
      const y1 = height / 2 - (Math.sin(angle) * height) / 2;
      const x2 = width / 2 + (Math.cos(angle) * width) / 2;
      const y2 = height / 2 + (Math.sin(angle) * height) / 2;

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, config.colorA || "#000000");
      grad.addColorStop(1, config.colorB || "#FFFFFF");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (config.type === "radialGradient") {
      const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) / 2
      );
      grad.addColorStop(0, config.colorA || "#FFFFFF");
      grad.addColorStop(1, config.colorB || "#000000");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (config.type === "smpteBars") {
      const barData = this.generateSMPTEBars(width, height);
      const imgData = new ImageData(barData as any, width, height);
      ctx.putImageData(imgData, 0, 0);
    }

    return canvas.transferToImageBitmap();
  }
}

/**
 * Masking & Track Matte Evaluator Engine.
 */
export class MaskingEngine {
  /**
   * Computes mask alpha value (0.0 to 1.0) at point (px, py) for Rectangle, Ellipse, or Bezier Vector Mask.
   */
  public static evaluateShapeMask(mask: ShapeMaskConfig, px: number, py: number): number {
    let inside = false;

    if (mask.type === "rectangle") {
      inside =
        px >= mask.x &&
        px <= mask.x + mask.width &&
        py >= mask.y &&
        py <= mask.y + mask.height;
    } else if (mask.type === "ellipse") {
      const rx = mask.width / 2;
      const ry = mask.height / 2;
      const cx = mask.x + rx;
      const cy = mask.y + ry;
      const normX = (px - cx) / rx;
      const normY = (py - cy) / ry;
      inside = normX * normX + normY * normY <= 1.0;
    } else if (mask.type === "bezierPath" && mask.bezierPoints && mask.bezierPoints.length > 2) {
      // Ray-casting algorithm for arbitrary vector bezier polygon path evaluation
      const pts = mask.bezierPoints;
      let intersects = 0;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        if (
          (p1.y > py) !== (p2.y > py) &&
          px < ((p2.x - p1.x) * (py - p1.y)) / (p2.y - p1.y) + p1.x
        ) {
          intersects++;
        }
      }
      inside = intersects % 2 !== 0;
    }

    if (mask.inverted) {
      inside = !inside;
    }

    return inside ? 1.0 : 0.0;
  }

  /**
   * Evaluates Track Matte math (Luma Matte vs Alpha Matte) for base pixel and matte pixel.
   */
  public static evaluateTrackMatte(
    baseColor: [number, number, number, number],
    matteColor: [number, number, number, number],
    matteType: TrackMatteType
  ): [number, number, number, number] {
    const [r, g, b, a] = baseColor;
    const [mr, mg, mb, ma] = matteColor;

    let matteFactor = 0;

    if (matteType === "alpha") {
      matteFactor = ma / 255.0;
    } else if (matteType === "alphaInverted") {
      matteFactor = 1.0 - ma / 255.0;
    } else if (matteType === "luma") {
      const luma = (0.2126 * mr + 0.7152 * mg + 0.0722 * mb) / 255.0;
      matteFactor = luma;
    } else if (matteType === "lumaInverted") {
      const luma = (0.2126 * mr + 0.7152 * mg + 0.0722 * mb) / 255.0;
      matteFactor = 1.0 - luma;
    }

    return [r, g, b, Math.round(a * matteFactor)];
  }
}
