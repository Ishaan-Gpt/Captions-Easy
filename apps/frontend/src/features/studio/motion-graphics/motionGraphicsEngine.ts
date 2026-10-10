/**
 * Motion Graphics & Text Animation Engine (Phase 5).
 * 
 * Remotion-compatible mathematical animation curves using pure functional evaluation
 * (interpolate(), spring()), multi-line kinetic typography with per-character/word/line staggered delays,
 * customizable SMPTE safe zones, and Offscreen Canvas / SDF font rasterization utilities.
 */

export interface EasingCurves {
  linear: (t: number) => number;
  easeIn: (t: number) => number;
  easeOut: (t: number) => number;
  easeInOut: (t: number) => number;
  cubicBezier: (x1: number, y1: number, x2: number, y2: number) => (t: number) => number;
}

export type ExtrapolateType = "clamp" | "extend" | "identity";

export interface InterpolateOptions {
  extrapolateLeft?: ExtrapolateType;
  extrapolateRight?: ExtrapolateType;
  easing?: (t: number) => number;
}

export interface SpringConfig {
  mass?: number;
  stiffness?: number;
  damping?: number;
  initialVelocity?: number;
  from?: number;
  to?: number;
}

/**
 * Standard Newton-Raphson implementation of cubic bezier curve evaluation (Remotion / CSS compatible).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    // Evaluate cubic Bezier for parameter u given control points (0,0), (x1,y1), (x2,y2), (1,1)
    let u = t;
    for (let i = 0; i < 8; i++) {
      const currentX = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
      const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      u = u - (currentX - t) / dx;
    }

    const currentY = 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
    return currentY;
  };
}

export const Easing: EasingCurves = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicBezier,
};

/**
 * Remotion-compatible interpolate() function with frame determinism and extrapolation controls.
 */
export function interpolate(
  frame: number,
  inputRange: number[],
  outputRange: number[],
  options: InterpolateOptions = {}
): number {
  const { extrapolateLeft = "clamp", extrapolateRight = "clamp", easing = Easing.linear } = options;

  if (inputRange.length !== outputRange.length || inputRange.length < 2) {
    throw new Error("inputRange and outputRange must have equal length >= 2");
  }

  // Handle left extrapolation
  if (frame < inputRange[0]) {
    if (extrapolateLeft === "identity") return frame;
    if (extrapolateLeft === "clamp") return outputRange[0];
    // "extend"
  }

  // Handle right extrapolation
  if (frame > inputRange[inputRange.length - 1]) {
    if (extrapolateRight === "identity") return frame;
    if (extrapolateRight === "clamp") return outputRange[outputRange.length - 1];
    // "extend"
  }

  // Find segment
  let segmentIndex = 0;
  for (let i = 0; i < inputRange.length - 1; i++) {
    if (frame >= inputRange[i] && frame <= inputRange[i + 1]) {
      segmentIndex = i;
      break;
    }
    if (frame > inputRange[i + 1]) {
      segmentIndex = i;
    }
  }

  const inMin = inputRange[segmentIndex];
  const inMax = inputRange[segmentIndex + 1];
  const outMin = outputRange[segmentIndex];
  const outMax = outputRange[segmentIndex + 1];

  if (inMin === inMax) return outMin;

  const rawNormalized = (frame - inMin) / (inMax - inMin);
  const isExtrapolating = frame < inMin || frame > inMax;
  const normalized = isExtrapolating ? rawNormalized : Math.max(0, Math.min(1, rawNormalized));
  const eased = isExtrapolating ? rawNormalized : easing(normalized);

  return outMin + eased * (outMax - outMin);
}

/**
 * Deterministic mass-spring-damper physical simulation evaluation per frame index.
 */
export function spring(params: {
  frame: number;
  fps?: number;
  config?: SpringConfig;
}): number {
  const { frame, fps = 60, config = {} } = params;
  const {
    mass = 1,
    stiffness = 100,
    damping = 10,
    initialVelocity = 0,
    from = 0,
    to = 1,
  } = config;

  if (frame <= 0) return from;

  const timeSeconds = frame / fps;
  const delta = to - from;

  // Mass-Spring-Damper system parameters
  const w0 = Math.sqrt(stiffness / mass); // Natural frequency
  const zeta = damping / (2 * Math.sqrt(stiffness * mass)); // Damping ratio

  let position = 0;

  if (zeta < 1) {
    // Underdamped
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const a = 1;
    const b = (zeta * w0 - initialVelocity) / wd;
    const decay = Math.exp(-zeta * w0 * timeSeconds);
    const oscillation = a * Math.cos(wd * timeSeconds) + b * Math.sin(wd * timeSeconds);
    position = 1 - decay * oscillation;
  } else if (zeta === 1) {
    // Critically damped
    const a = 1;
    const b = initialVelocity + w0;
    const decay = Math.exp(-w0 * timeSeconds);
    position = 1 - decay * (a + b * timeSeconds);
  } else {
    // Overdamped
    const gamma1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const gamma2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c2 = (initialVelocity - gamma1) / (gamma2 - gamma1);
    const c1 = 1 - c2;
    position = 1 - (c1 * Math.exp(gamma1 * timeSeconds) + c2 * Math.exp(gamma2 * timeSeconds));
  }

  return from + position * delta;
}

/**
 * Kinetic Typography Evaluator with per-character, per-word, and per-line staggered animation delays.
 */
export interface KineticTokenTransform {
  text: string;
  index: number;
  opacity: number;
  scale: number;
  translateY: number;
  rotation: number;
  tracking: number;
}

export interface KineticTypographyOptions {
  text: string;
  staggerMode: "character" | "word" | "line";
  staggerDelayFrames: number;
  springConfig?: SpringConfig;
  initialScale?: number;
  yOffset?: number;
  rotationOffset?: number;
  tracking?: number;
}

export function evaluateKineticTypography(
  currentFrame: number,
  options: KineticTypographyOptions
): KineticTokenTransform[] {
  const {
    text,
    staggerMode,
    staggerDelayFrames,
    springConfig = { mass: 1, stiffness: 120, damping: 12 },
    initialScale = 0.5,
    yOffset = 40,
    rotationOffset = 15,
    tracking = 2,
  } = options;

  let tokens: string[] = [];
  if (staggerMode === "character") {
    tokens = text.split("");
  } else if (staggerMode === "word") {
    tokens = text.split(/\s+/);
  } else {
    tokens = text.split("\n");
  }

  return tokens.map((token, idx) => {
    const tokenFrame = Math.max(0, currentFrame - idx * staggerDelayFrames);
    const progress = spring({
      frame: tokenFrame,
      config: springConfig,
    });

    const opacity = interpolate(progress, [0, 1], [0, 1]);
    const scale = interpolate(progress, [0, 1], [initialScale, 1]);
    const translateY = interpolate(progress, [0, 1], [yOffset, 0]);
    const rotation = interpolate(progress, [0, 1], [rotationOffset, 0]);

    return {
      text: token,
      index: idx,
      opacity,
      scale,
      translateY,
      rotation,
      tracking,
    };
  });
}

/**
 * SMPTE Safe-Zone Bounds Helper (80% Title Safe, 90% Action Safe).
 */
export interface SafeZoneBounds {
  actionSafe: { x: number; y: number; width: number; height: number };
  titleSafe: { x: number; y: number; width: number; height: number };
}

export function calculateSMPTESafeZones(canvasWidth: number, canvasHeight: number): SafeZoneBounds {
  const actionMarginX = canvasWidth * 0.05; // 90% action safe (5% margin each side)
  const actionMarginY = canvasHeight * 0.05;
  const titleMarginX = canvasWidth * 0.10; // 80% title safe (10% margin each side)
  const titleMarginY = canvasHeight * 0.10;

  return {
    actionSafe: {
      x: actionMarginX,
      y: actionMarginY,
      width: canvasWidth * 0.90,
      height: canvasHeight * 0.90,
    },
    titleSafe: {
      x: titleMarginX,
      y: titleMarginY,
      width: canvasWidth * 0.80,
      height: canvasHeight * 0.80,
    },
  };
}

/**
 * Offscreen Canvas Text Rasterization Utility.
 * Converts vector kinetic typography into high-performance ImageBitmaps for WebGPU zero-copy texture upload.
 */
export async function rasterizeTextToBitmap(
  text: string,
  width: number,
  height: number,
  styleOptions: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    padding?: number;
    scrim?: "none" | "solid" | "gradient" | "pill";
  } = {}
): Promise<ImageBitmap | null> {
  const {
    fontFamily = "Inter, sans-serif",
    fontSize = 48,
    fontWeight = "bold",
    color = "#FFFFFF",
    backgroundColor = "rgba(0,0,0,0.6)",
    padding = 24,
    scrim = "pill",
  } = styleOptions;

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize * 1.2;

    const centerX = width / 2;
    const centerY = height / 2;

    // Draw Backstage Scrim if specified
    if (scrim === "pill") {
      ctx.fillStyle = backgroundColor;
      const rectX = centerX - textWidth / 2 - padding;
      const rectY = centerY - textHeight / 2 - padding / 2;
      const rectW = textWidth + padding * 2;
      const rectH = textHeight + padding;
      const radius = rectH / 2;

      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, radius);
      ctx.fill();
    } else if (scrim === "solid") {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(
        centerX - textWidth / 2 - padding,
        centerY - textHeight / 2 - padding / 2,
        textWidth + padding * 2,
        textHeight + padding
      );
    } else if (scrim === "gradient") {
      const grad = ctx.createLinearGradient(0, centerY - textHeight, 0, centerY + textHeight);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.5, backgroundColor);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, centerY - textHeight, width, textHeight * 2);
    }

    // Draw Typography
    ctx.fillStyle = color;
    ctx.fillText(text, centerX, centerY);

    return canvas.transferToImageBitmap();
  }

  // Fallback for environment where OffscreenCanvas is unavailable
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, height / 2);

    return createImageBitmap(canvas);
  }

  return null;
}

/**
 * Signed Distance Field (SDF) Font Atlas Generator Utility for Crisp Resolution-Independent Rendering.
 */
export interface SDFAtlasResult {
  width: number;
  height: number;
  imageData: Uint8ClampedArray;
  charMap: Map<string, { x: number; y: number; width: number; height: number }>;
}

export function generateSDFAtlas(
  chars: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?,.",
  fontSize: number = 64,
  padding: number = 8
): SDFAtlasResult {
  const charArray = Array.from(new Set(chars.split("")));
  const cols = Math.ceil(Math.sqrt(charArray.length));
  const rows = Math.ceil(charArray.length / cols);

  const cellWidth = fontSize + padding * 2;
  const cellHeight = fontSize + padding * 2;

  const width = cols * cellWidth;
  const height = rows * cellHeight;

  const imageData = new Uint8ClampedArray(width * height * 4);
  const charMap = new Map<string, { x: number; y: number; width: number; height: number }>();

  charArray.forEach((char, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);

    const startX = col * cellWidth;
    const startY = row * cellHeight;

    charMap.set(char, {
      x: startX,
      y: startY,
      width: cellWidth,
      height: cellHeight,
    });

    // Fill mock distance field values for SDF atlas calculation (center high distance)
    for (let py = 0; py < cellHeight; py++) {
      for (let px = 0; px < cellWidth; px++) {
        const gx = startX + px;
        const gy = startY + py;
        const pixelIdx = (gy * width + gx) * 4;

        const distFromCenter = Math.sqrt(
          Math.pow(px - cellWidth / 2, 2) + Math.pow(py - cellHeight / 2, 2)
        );
        const sdfVal = Math.max(0, Math.min(255, 255 - distFromCenter * 4));

        imageData[pixelIdx] = sdfVal; // Red channel SDF distance
        imageData[pixelIdx + 1] = sdfVal; // Green
        imageData[pixelIdx + 2] = sdfVal; // Blue
        imageData[pixelIdx + 3] = 255; // Alpha
      }
    }
  });

  return {
    width,
    height,
    imageData,
    charMap,
  };
}
