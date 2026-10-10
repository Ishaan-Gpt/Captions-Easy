/**
 * Time Remapping & Speed Ramping Engine (Phase 6).
 * Manages variable speed ramping curves (0.1x to 5.0x), integral media timestamp calculation,
 * video frame interpolation selection (Nearest Neighbor, Frame Blending, Optical Flow),
 * and WSOLA real-time pitch preservation.
 */

import { cubicBezier, Easing } from "../motion-graphics/motionGraphicsEngine";
import { getWGSLFrameInterpolationShader, getWGSLMotionVectorComputeShader } from "./opticalFlowShader";

export interface SpeedKeyframe {
  timelineMs: number;
  speedMultiplier: number; // e.g., 0.5 = 50%, 2.0 = 200%
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | { cubic: [number, number, number, number] };
}

export type InterpolationMode = "nearest" | "frameBlend" | "opticalFlow";

export interface TimeRemappingState {
  interpolationMode: InterpolationMode;
  speedKeyframes: SpeedKeyframe[];
  pitchCorrectionEnabled: boolean;
}

export interface RemappedFrameResult {
  timelineMs: number;
  mediaMs: number;
  speedMultiplier: number;
  frameIndexPrev: number;
  frameIndexNext: number;
  alpha: number; // Fractional progress between frames [0, 1]
  interpolationMode: InterpolationMode;
}

/**
 * Evaluates current speed multiplier v(t) at timeline time t.
 */
export function evaluateSpeedAtTimelineMs(
  keyframes: SpeedKeyframe[],
  timelineMs: number,
  defaultSpeed: number = 1.0
): number {
  if (!keyframes || keyframes.length === 0) return defaultSpeed;

  if (timelineMs <= keyframes[0].timelineMs) {
    return keyframes[0].speedMultiplier;
  }

  if (timelineMs >= keyframes[keyframes.length - 1].timelineMs) {
    return keyframes[keyframes.length - 1].speedMultiplier;
  }

  let prevKf = keyframes[0];
  let nextKf = keyframes[1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (timelineMs >= keyframes[i].timelineMs && timelineMs <= keyframes[i + 1].timelineMs) {
      prevKf = keyframes[i];
      nextKf = keyframes[i + 1];
      break;
    }
  }

  const duration = nextKf.timelineMs - prevKf.timelineMs;
  if (duration === 0) return prevKf.speedMultiplier;

  const rawProgress = (timelineMs - prevKf.timelineMs) / duration;
  let easedProgress = rawProgress;

  const easing = prevKf.easing || "linear";
  if (easing === "easeIn") {
    easedProgress = Easing.easeIn(rawProgress);
  } else if (easing === "easeOut") {
    easedProgress = Easing.easeOut(rawProgress);
  } else if (easing === "easeInOut") {
    easedProgress = Easing.easeInOut(rawProgress);
  } else if (typeof easing === "object" && easing.cubic) {
    const cb = cubicBezier(...easing.cubic);
    easedProgress = cb(rawProgress);
  }

  return prevKf.speedMultiplier + easedProgress * (nextKf.speedMultiplier - prevKf.speedMultiplier);
}

/**
 * Calculates continuous media timestamp M(T) by integrating speed curve v(t).
 * M(T) = M_0 + ∫_0^T v(τ) dτ
 */
export function calculateMediaTimestampFromTimelineMs(
  keyframes: SpeedKeyframe[],
  targetTimelineMs: number,
  fps: number = 60
): RemappedFrameResult {
  const stepMs = 1000 / fps;
  let accumulatedMediaMs = 0;
  let currentTimelineMs = 0;
  let lastSpeed = 1.0;

  while (currentTimelineMs < targetTimelineMs) {
    const nextMs = Math.min(targetTimelineMs, currentTimelineMs + stepMs);
    const deltaMs = nextMs - currentTimelineMs;
    const currentSpeed = evaluateSpeedAtTimelineMs(keyframes, currentTimelineMs);
    accumulatedMediaMs += deltaMs * currentSpeed;
    currentTimelineMs = nextMs;
    lastSpeed = currentSpeed;
  }

  const exactFrameFloat = (accumulatedMediaMs / 1000) * fps;
  const frameIndexPrev = Math.floor(exactFrameFloat);
  const frameIndexNext = frameIndexPrev + 1;
  const alpha = exactFrameFloat - frameIndexPrev;

  return {
    timelineMs: targetTimelineMs,
    mediaMs: accumulatedMediaMs,
    speedMultiplier: lastSpeed,
    frameIndexPrev,
    frameIndexNext,
    alpha,
    interpolationMode: "opticalFlow",
  };
}

/**
 * WSOLA Pitch-Preserving Time-Stretching DSP Helper.
 * Overlaps and fades audio frames to maintain pitch during variable speed ramps.
 */
export function applyWSOLAPitchCorrection(
  inputPcm: Float32Array,
  speedMultiplier: number,
  windowSize: number = 1024
): Float32Array {
  if (Math.abs(speedMultiplier - 1.0) < 0.01 || inputPcm.length === 0) {
    return new Float32Array(inputPcm);
  }

  const outputLength = Math.floor(inputPcm.length / speedMultiplier);
  const outputPcm = new Float32Array(outputLength);

  const hopSizeInput = Math.floor(windowSize / 2);
  const hopSizeOutput = Math.floor(hopSizeInput / speedMultiplier);

  let inputPtr = 0;
  let outputPtr = 0;

  while (outputPtr + windowSize < outputLength && inputPtr + windowSize < inputPcm.length) {
    // Apply Hanning Window & Overlap Add
    for (let i = 0; i < windowSize; i++) {
      const windowVal = 0.5 * (1 - Math.cos((2 * Math.PI * i) / windowSize));
      outputPcm[outputPtr + i] += inputPcm[inputPtr + i] * windowVal;
    }
    inputPtr += hopSizeInput;
    outputPtr += hopSizeOutput;
  }

  return outputPcm;
}

export class TimeRemappingEngine {
  private config: TimeRemappingState;

  constructor(config?: Partial<TimeRemappingState>) {
    this.config = {
      interpolationMode: config?.interpolationMode || "opticalFlow",
      speedKeyframes: config?.speedKeyframes || [],
      pitchCorrectionEnabled: config?.pitchCorrectionEnabled ?? true,
    };
  }

  public setSpeedKeyframes(keyframes: SpeedKeyframe[]): void {
    this.config.speedKeyframes = keyframes;
  }

  public setInterpolationMode(mode: InterpolationMode): void {
    this.config.interpolationMode = mode;
  }

  public evaluate(timelineMs: number, fps: number = 60): RemappedFrameResult {
    const res = calculateMediaTimestampFromTimelineMs(this.config.speedKeyframes, timelineMs, fps);
    res.interpolationMode = this.config.interpolationMode;
    return res;
  }

  public getWGSLOpticalFlowShaders(): { compute: string; fragment: string } {
    return {
      compute: getWGSLMotionVectorComputeShader(),
      fragment: getWGSLFrameInterpolationShader(),
    };
  }
}
