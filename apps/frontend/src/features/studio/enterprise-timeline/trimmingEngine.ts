export type TrimTool = "select" | "razor" | "ripple" | "roll" | "slip" | "slide";

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  type: "video" | "audio" | "caption";
  startMs: number;
  endMs: number;
  mediaStartMs: number;
  mediaDurationMs: number;
  color?: string;
  muted?: boolean;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "caption";
  muted: boolean;
  solo: boolean;
  locked: boolean;
  heightPx?: number;
}

export interface TrimmingState {
  activeTool: TrimTool;
  snappingEnabled: boolean;
  rippleAllTracks: boolean;
}

const MIN_CLIP_DURATION_MS = 100;

/**
 * Ripple Trim:
 * Adjusts clip edge (start or end) and shifts all subsequent clips on the track (or all un-locked tracks)
 * by the delta difference.
 */
export function executeRippleTrim(
  clips: TimelineClip[],
  targetClipId: string,
  edge: "start" | "end",
  newTimeMs: number,
  rippleAllTracks: boolean = false
): TimelineClip[] {
  const targetIndex = clips.findIndex((c) => c.id === targetClipId);
  if (targetIndex === -1) return clips;
  const target = clips[targetIndex];

  let delta = 0;
  let newStart = target.startMs;
  let newEnd = target.endMs;
  let newMediaStart = target.mediaStartMs;

  if (edge === "start") {
    newTimeMs = Math.min(newTimeMs, target.endMs - MIN_CLIP_DURATION_MS);
    delta = newTimeMs - target.startMs;
    newStart = newTimeMs;
    newMediaStart = Math.max(0, target.mediaStartMs + delta);
  } else {
    newTimeMs = Math.max(newTimeMs, target.startMs + MIN_CLIP_DURATION_MS);
    delta = newTimeMs - target.endMs;
    newEnd = newTimeMs;
  }

  return clips.map((clip) => {
    if (clip.id === targetClipId) {
      return {
        ...clip,
        startMs: newStart,
        endMs: newEnd,
        mediaStartMs: newMediaStart,
      };
    }
    // Shift subsequent clips
    const isSubsequent = clip.startMs >= target.endMs;
    const sameTrack = clip.trackId === target.trackId;
    if (isSubsequent && (sameTrack || rippleAllTracks)) {
      return {
        ...clip,
        startMs: Math.max(0, clip.startMs + delta),
        endMs: Math.max(MIN_CLIP_DURATION_MS, clip.endMs + delta),
      };
    }
    return clip;
  });
}

/**
 * Roll Trim:
 * Adjusts the edit boundary between two adjacent clips on the same track.
 * Extending Clip A shrinks Clip B by the same amount, keeping sequence total duration constant.
 */
export function executeRollTrim(
  clips: TimelineClip[],
  clipAId: string,
  clipBId: string,
  newBoundaryMs: number
): TimelineClip[] {
  const clipA = clips.find((c) => c.id === clipAId);
  const clipB = clips.find((c) => c.id === clipBId);
  if (!clipA || !clipB || clipA.trackId !== clipB.trackId) return clips;

  const minBoundary = clipA.startMs + MIN_CLIP_DURATION_MS;
  const maxBoundary = clipB.endMs - MIN_CLIP_DURATION_MS;
  const boundedTime = Math.max(minBoundary, Math.min(maxBoundary, newBoundaryMs));

  return clips.map((clip) => {
    if (clip.id === clipAId) {
      return { ...clip, endMs: boundedTime };
    }
    if (clip.id === clipBId) {
      const delta = boundedTime - clip.startMs;
      return {
        ...clip,
        startMs: boundedTime,
        mediaStartMs: Math.max(0, clip.mediaStartMs + delta),
      };
    }
    return clip;
  });
}

/**
 * Slip Trim:
 * Shifts the clip's media start/end points inside the clip container without altering
 * the clip's startMs, endMs, or position on the timeline.
 */
export function executeSlipTrim(
  clips: TimelineClip[],
  clipId: string,
  deltaMediaMs: number
): TimelineClip[] {
  return clips.map((clip) => {
    if (clip.id !== clipId) return clip;
    const maxMediaOffset = Math.max(0, clip.mediaDurationMs - (clip.endMs - clip.startMs));
    const newMediaStart = Math.max(0, Math.min(maxMediaOffset, clip.mediaStartMs + deltaMediaMs));
    return {
      ...clip,
      mediaStartMs: newMediaStart,
    };
  });
}

/**
 * Slide Trim:
 * Moves a clip left or right on the timeline while simultaneously trimming
 * the out-point of the preceding clip and the in-point of the succeeding clip.
 */
export function executeSlideTrim(
  clips: TimelineClip[],
  clipId: string,
  newStartMs: number
): TimelineClip[] {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;

  const trackClips = clips
    .filter((c) => c.trackId === target.trackId)
    .sort((a, b) => a.startMs - b.startMs);
  const index = trackClips.findIndex((c) => c.id === clipId);
  const prevClip = index > 0 ? trackClips[index - 1] : null;
  const nextClip = index < trackClips.length - 1 ? trackClips[index + 1] : null;

  const duration = target.endMs - target.startMs;
  let minStart = prevClip ? prevClip.startMs + MIN_CLIP_DURATION_MS : 0;
  let maxStart = nextClip ? nextClip.endMs - duration - MIN_CLIP_DURATION_MS : Infinity;

  const boundedStart = Math.max(minStart, Math.min(maxStart, newStartMs));
  const boundedEnd = boundedStart + duration;

  return clips.map((clip) => {
    if (clip.id === clipId) {
      return { ...clip, startMs: boundedStart, endMs: boundedEnd };
    }
    if (prevClip && clip.id === prevClip.id) {
      return { ...clip, endMs: boundedStart };
    }
    if (nextClip && clip.id === nextClip.id) {
      const delta = boundedEnd - clip.startMs;
      return {
        ...clip,
        startMs: boundedEnd,
        mediaStartMs: Math.max(0, clip.mediaStartMs + delta),
      };
    }
    return clip;
  });
}

/**
 * Snapping Helper:
 * Finds nearest snap point (playhead, clip boundaries, track markers) within snap threshold.
 */
export function findSnapPoint(
  targetMs: number,
  snapTargets: number[],
  thresholdMs: number
): { snappedTime: number; distance: number } {
  let closestTime = targetMs;
  let minDistance = thresholdMs;

  for (const target of snapTargets) {
    const dist = Math.abs(target - targetMs);
    if (dist < minDistance) {
      minDistance = dist;
      closestTime = target;
    }
  }

  return { snappedTime: closestTime, distance: minDistance };
}
