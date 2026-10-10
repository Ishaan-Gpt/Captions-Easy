import { describe, expect, it } from "vitest";
import {
  executeRippleTrim,
  executeRollTrim,
  executeSlipTrim,
  executeSlideTrim,
  findSnapPoint,
  type TimelineClip,
} from "./trimmingEngine";

describe("Trimming Engine Algorithms", () => {
  const sampleClips: TimelineClip[] = [
    {
      id: "clip-1",
      trackId: "V1",
      name: "Shot A",
      type: "video",
      startMs: 0,
      endMs: 2000,
      mediaStartMs: 0,
      mediaDurationMs: 10000,
    },
    {
      id: "clip-2",
      trackId: "V1",
      name: "Shot B",
      type: "video",
      startMs: 2000,
      endMs: 5000,
      mediaStartMs: 500,
      mediaDurationMs: 10000,
    },
    {
      id: "clip-3",
      trackId: "V1",
      name: "Shot C",
      type: "video",
      startMs: 5000,
      endMs: 8000,
      mediaStartMs: 0,
      mediaDurationMs: 10000,
    },
  ];

  it("executes Ripple Trim on end edge and shifts subsequent clips", () => {
    // Extend clip-1 from 2000ms to 3000ms (delta +1000ms)
    const result = executeRippleTrim(sampleClips, "clip-1", "end", 3000);
    expect(result[0].endMs).toBe(3000);
    expect(result[1].startMs).toBe(3000); // clip-2 shifted by +1000ms
    expect(result[1].endMs).toBe(6000);
    expect(result[2].startMs).toBe(6000); // clip-3 shifted by +1000ms
    expect(result[2].endMs).toBe(9000);
  });

  it("executes Roll Trim between two adjacent clips", () => {
    // Move edit point between clip-1 and clip-2 from 2000ms to 2500ms
    const result = executeRollTrim(sampleClips, "clip-1", "clip-2", 2500);
    expect(result[0].endMs).toBe(2500); // clip-1 extended
    expect(result[1].startMs).toBe(2500); // clip-2 trimmed start
    expect(result[1].endMs).toBe(5000); // clip-2 total end unchanged!
    expect(result[2].startMs).toBe(5000); // clip-3 unchanged!
  });

  it("executes Slip Trim on media start without altering clip duration or timeline position", () => {
    const result = executeSlipTrim(sampleClips, "clip-2", 300);
    expect(result[1].startMs).toBe(2000);
    expect(result[1].endMs).toBe(5000);
    expect(result[1].mediaStartMs).toBe(800); // 500 + 300
  });

  it("executes Slide Trim moving middle clip and adjusting neighbors", () => {
    // Move clip-2 start from 2000ms to 2500ms
    const result = executeSlideTrim(sampleClips, "clip-2", 2500);
    expect(result[0].endMs).toBe(2500); // clip-1 extended
    expect(result[1].startMs).toBe(2500); // clip-2 moved start
    expect(result[1].endMs).toBe(5500); // clip-2 moved end (duration 3000 maintained)
    expect(result[2].startMs).toBe(5500); // clip-3 start trimmed
  });

  it("correctly snaps to closest target within threshold", () => {
    const targets = [0, 2000, 5000, 8000];
    const snap1 = findSnapPoint(2020, targets, 50);
    expect(snap1.snappedTime).toBe(2000);

    const snap2 = findSnapPoint(3500, targets, 50);
    expect(snap2.snappedTime).toBe(3500); // outside threshold
  });
});
