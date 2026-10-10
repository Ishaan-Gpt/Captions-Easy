import { describe, expect, it } from "vitest";
import { MasterAudioClock } from "./masterAudioClock";

describe("MasterAudioClock Core (Phase 6)", () => {
  it("initializes master audio clock with default 48kHz sample rate", () => {
    const clock = new MasterAudioClock(48000);
    expect(clock.getSampleRate()).toBe(48000);
    expect(clock.isPlaying()).toBe(false);
    expect(clock.getCurrentTimelineMs()).toBe(0);
  });

  it("handles seek and playhead state correctly", () => {
    const clock = new MasterAudioClock(48000);
    clock.seek(2500);
    expect(clock.getCurrentTimelineMs()).toBe(2500);
    expect(clock.getCurrentSamplePosition()).toBe(2500 * 48); // 2.5s * 48000Hz = 120000 samples
  });

  it("updates playback rate without resetting timeline position", () => {
    const clock = new MasterAudioClock(48000);
    clock.seek(1000);
    clock.setPlaybackRate(2.0);
    expect(clock.getCurrentTimelineMs()).toBe(1000);
  });
});
